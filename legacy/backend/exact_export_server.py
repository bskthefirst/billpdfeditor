#!/usr/bin/env python3
import base64
import re
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request

try:
    import fitz  # PyMuPDF
except Exception as exc:  # pragma: no cover
    fitz = None
    FITZ_IMPORT_ERROR = str(exc)
else:
    FITZ_IMPORT_ERROR = ""


app = Flask(__name__)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _decode_pdf_base64(value: str) -> bytes:
    return base64.b64decode(value.encode("utf-8"))


def _encode_pdf_base64(value: bytes) -> str:
    return base64.b64encode(value).decode("utf-8")


def _parse_rgb(color_raw: str) -> Tuple[float, float, float]:
    color = str(color_raw or "").strip().lower()
    if not color:
        return (0.0, 0.0, 0.0)
    if color.startswith("#"):
        hex_value = color[1:]
        if len(hex_value) == 3:
            hex_value = "".join(ch + ch for ch in hex_value)
        if len(hex_value) == 6:
            try:
                parsed = int(hex_value, 16)
                return (
                    ((parsed >> 16) & 255) / 255.0,
                    ((parsed >> 8) & 255) / 255.0,
                    (parsed & 255) / 255.0,
                )
            except ValueError:
                return (0.0, 0.0, 0.0)
    match = re.search(r"rgba?\(([^)]+)\)", color)
    if match:
        channels = [part.strip() for part in match.group(1).split(",")]
        if len(channels) >= 3:
            try:
                return (
                    _clamp(float(channels[0]), 0, 255) / 255.0,
                    _clamp(float(channels[1]), 0, 255) / 255.0,
                    _clamp(float(channels[2]), 0, 255) / 255.0,
                )
            except ValueError:
                return (0.0, 0.0, 0.0)
    return (0.0, 0.0, 0.0)


def _to_pdf_rect(rect_payload: Dict[str, Any], page_width: float, page_height: float, source_width: float, source_height: float) -> "fitz.Rect":
    scale_x = page_width / max(source_width, 1.0)
    scale_y = page_height / max(source_height, 1.0)
    left = float(rect_payload.get("left", 0.0)) * scale_x
    top = float(rect_payload.get("top", 0.0)) * scale_y
    width = max(float(rect_payload.get("width", 0.0)) * scale_x, 0.2)
    height = max(float(rect_payload.get("height", 0.0)) * scale_y, 0.2)
    return fitz.Rect(left, top, left + width, top + height)


def _area(rect: "fitz.Rect") -> float:
    return max(0.0, rect.width) * max(0.0, rect.height)


def _intersection_over_union(a: "fitz.Rect", b: "fitz.Rect") -> float:
    inter = a & b
    inter_area = _area(inter)
    if inter_area <= 0:
        return 0.0
    union = _area(a) + _area(b) - inter_area
    if union <= 0:
        return 0.0
    return inter_area / union


def _collect_page_spans(page: "fitz.Page") -> List[Dict[str, Any]]:
    spans: List[Dict[str, Any]] = []
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                bbox = span.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                spans.append(
                    {
                        "rect": fitz.Rect(bbox),
                        "font": str(span.get("font") or ""),
                        "size": float(span.get("size") or 0.0),
                        "color": span.get("color"),
                        "flags": int(span.get("flags") or 0),
                        "ascender": float(span.get("ascender") or 0.0),
                        "descender": float(span.get("descender") or 0.0),
                        "origin": tuple(span.get("origin", (0.0, 0.0))),
                    }
                )
    return spans


def _normalize_font_token(value: str) -> str:
    raw = str(value or "").strip()
    if "+" in raw:
        raw = raw.split("+", 1)[1]
    return re.sub(r"[^a-z0-9]+", "", raw.lower())


def _collect_page_font_xrefs(page: "fitz.Page") -> Dict[str, int]:
    font_map: Dict[str, int] = {}
    for font_info in page.get_fonts() or []:
        if len(font_info) < 5:
            continue
        xref = int(font_info[0] or 0)
        basefont = str(font_info[3] or "")
        resource_name = str(font_info[4] or "")
        for candidate in (basefont, resource_name):
            token = _normalize_font_token(candidate)
            if token and token not in font_map:
                font_map[token] = xref
    return font_map


def _guess_base14_font(font_family: str, font_weight: str, font_style: str) -> str:
    family = str(font_family or "").lower()
    weight = str(font_weight or "").lower()
    style = str(font_style or "").lower()
    is_bold = "bold" in weight or (weight.isdigit() and int(weight) >= 600)
    is_italic = "italic" in style or "oblique" in style

    if any(token in family for token in ["times", "serif", "georgia", "cambria"]):
        if is_bold and is_italic:
            return "Times-BoldItalic"
        if is_bold:
            return "Times-Bold"
        if is_italic:
            return "Times-Italic"
        return "Times-Roman"
    if any(token in family for token in ["courier", "mono", "consolas"]):
        if is_bold and is_italic:
            return "Courier-BoldOblique"
        if is_bold:
            return "Courier-Bold"
        if is_italic:
            return "Courier-Oblique"
        return "Courier"
    if is_bold and is_italic:
        return "Helvetica-BoldOblique"
    if is_bold:
        return "Helvetica-Bold"
    if is_italic:
        return "Helvetica-Oblique"
    return "Helvetica"


def _span_color_to_rgb(span_color: Any) -> Optional[Tuple[float, float, float]]:
    if span_color is None:
        return None
    if isinstance(span_color, int):
        r = (span_color >> 16) & 255
        g = (span_color >> 8) & 255
        b = span_color & 255
        return (r / 255.0, g / 255.0, b / 255.0)
    return None


def _resolve_font_name_for_span(
    document: "fitz.Document",
    page: "fitz.Page",
    span: Optional[Dict[str, Any]],
    fallback_font: str,
    page_font_map: Dict[str, int],
    font_alias_cache: Dict[int, str],
) -> str:
    if not span:
        return fallback_font
    span_font_name = str(span.get("font") or "")
    span_token = _normalize_font_token(span_font_name)
    xref = page_font_map.get(span_token)
    if not xref:
        return fallback_font
    if xref in font_alias_cache:
        return font_alias_cache[xref]
    try:
        extracted = document.extract_font(xref)
        font_bytes = extracted[3] if extracted and len(extracted) > 3 else None
        if font_bytes:
            alias = f"xf{xref}"
            page.insert_font(fontname=alias, fontbuffer=font_bytes)
            font_alias_cache[xref] = alias
            return alias
    except Exception:
        return fallback_font
    return fallback_font


def _safe_text_length(text: str, font_name: str, font_size: float) -> float:
    content = str(text or "")
    if not content:
        return 0.0
    size = max(float(font_size or 0.0), 1.0)
    try:
        measured = float(fitz.get_text_length(content, fontname=font_name, fontsize=size))
        if measured > 0:
            return measured
    except Exception:
        pass
    return max(len(content) * size * 0.52, size * 0.4)


def _estimate_text_run_width(
    text: str, font_name: str, font_size: float, tracking: float, horizontal_scale: float
) -> float:
    base = _safe_text_length(text, font_name, font_size)
    if not text:
        return 0.0
    extra_tracking = max(len(text) - 1, 0) * tracking * font_size
    return max((base + extra_tracking) * horizontal_scale, 0.0)


def _fit_font_size_to_width(
    text: str,
    font_name: str,
    initial_size: float,
    max_width: float,
    tracking: float,
    horizontal_scale: float,
    min_ratio: float = 0.68,
) -> float:
    size = max(float(initial_size or 0.0), 1.0)
    width = _estimate_text_run_width(text, font_name, size, tracking, horizontal_scale)
    if width <= max_width or max_width <= 1.0:
        return size

    low = max(size * min_ratio, 1.0)
    high = size
    for _ in range(14):
        mid = (low + high) / 2.0
        mid_width = _estimate_text_run_width(text, font_name, mid, tracking, horizontal_scale)
        if mid_width > max_width:
            high = mid
        else:
            low = mid
    return max(low, 1.0)


def _fit_tracking_to_width(
    text: str,
    font_name: str,
    font_size: float,
    tracking: float,
    horizontal_scale: float,
    max_width: float,
) -> float:
    if len(text) < 2:
        return tracking
    width = _estimate_text_run_width(text, font_name, font_size, tracking, horizontal_scale)
    if width <= max_width or max_width <= 1.0:
        return tracking
    chars = max(len(text) - 1, 1)
    deficit = width - max_width
    adjust = deficit / (chars * max(font_size, 1.0) * max(horizontal_scale, 0.1))
    next_tracking = tracking - adjust
    return _clamp(next_tracking, -0.08, tracking)


def _micro_calibrate_origin(
    draw_point: "fitz.Point",
    current_rect: "fitz.Rect",
    span: Optional[Dict[str, Any]],
    draw_font_size: float,
    ascent: float,
) -> "fitz.Point":
    if not span:
        return draw_point
    span_rect: "fitz.Rect" = span.get("rect")
    if not span_rect:
        return draw_point
    span_origin = span.get("origin") or (span_rect.x0, span_rect.y1)
    span_origin_x = float(span_origin[0]) if len(span_origin) > 0 else float(span_rect.x0)
    span_origin_y = float(span_origin[1]) if len(span_origin) > 1 else float(span_rect.y1)

    expected_x = current_rect.x0 + (span_origin_x - span_rect.x0)
    expected_y = current_rect.y0 + (span_origin_y - span_rect.y0)
    fallback_y = current_rect.y0 + draw_font_size * ascent

    tuned_y = expected_y if expected_y == expected_y else fallback_y
    if tuned_y != tuned_y:
        tuned_y = fallback_y

    max_dx = 1.25
    max_dy = 1.0
    tuned_x = draw_point.x + _clamp(expected_x - draw_point.x, -max_dx, max_dx)
    tuned_y = draw_point.y + _clamp(tuned_y - draw_point.y, -max_dy, max_dy)
    return fitz.Point(tuned_x, tuned_y)


def _pick_span_for_rect(spans: List[Dict[str, Any]], base_rect: "fitz.Rect") -> Optional[Dict[str, Any]]:
    best = None
    best_score = 0.0
    for span in spans:
        score = _intersection_over_union(span["rect"], base_rect)
        if score > best_score:
            best = span
            best_score = score
    if best_score < 0.03:
        return None
    return best


def _draw_replacement_text(
    document: "fitz.Document",
    page: "fitz.Page",
    op: Dict[str, Any],
    spans: List[Dict[str, Any]],
    page_font_map: Dict[str, int],
    font_alias_cache: Dict[int, str],
) -> None:
    source_width = float(op.get("sourceWidth", 1.0) or 1.0)
    source_height = float(op.get("sourceHeight", 1.0) or 1.0)
    page_width = float(page.rect.width)
    page_height = float(page.rect.height)
    base_rect = _to_pdf_rect(op.get("baseRect", {}), page_width, page_height, source_width, source_height)
    current_rect = _to_pdf_rect(op.get("currentRect", {}), page_width, page_height, source_width, source_height)

    fill_rgb = _parse_rgb(op.get("maskFillColor", "#ffffff"))
    page.draw_rect(base_rect, color=fill_rgb, fill=fill_rgb, width=0)
    if current_rect != base_rect:
        page.draw_rect(current_rect, color=fill_rgb, fill=fill_rgb, width=0)

    text_value = str(op.get("text") or "").replace("\r", "").replace("\n", " ")
    if not text_value.strip():
        return

    span = _pick_span_for_rect(spans, base_rect)
    fallback_font = _guess_base14_font(
        str(op.get("fontFamily") or ""),
        str(op.get("fontWeight") or ""),
        str(op.get("fontStyle") or ""),
    )
    font_name = _resolve_font_name_for_span(
        document,
        page,
        span,
        fallback_font,
        page_font_map,
        font_alias_cache,
    )

    scale_y = page_height / max(source_height, 1.0)
    scale_x = page_width / max(source_width, 1.0)
    pad_x = float(op.get("padX", 0.0)) * scale_x
    pad_y = float(op.get("padY", 0.0)) * scale_y
    offset_x = float(op.get("inkOffsetX", 0.0)) * scale_x
    offset_y = float(op.get("inkOffsetY", 0.0)) * scale_y

    op_font_size = max(float(op.get("fontSize", 8.0)), 1.0)
    span_size = float(span.get("size", 0.0)) if span else 0.0
    draw_font_size = span_size if span_size > 0 else op_font_size * scale_y
    draw_font_size = max(draw_font_size, 1.0)
    ascent = _clamp(float(op.get("ascent", 0.82)), 0.5, 0.95)
    span_rgb = _span_color_to_rgb(span.get("color") if span else None)
    draw_color = span_rgb if span_rgb else _parse_rgb(op.get("textColor", "#111827"))

    if span and span.get("origin"):
        origin = span.get("origin")
        span_rect = span.get("rect")
        origin_x = float(origin[0]) if len(origin) > 0 else float(span_rect.x0)
        origin_y = float(origin[1]) if len(origin) > 1 else float(span_rect.y1)
        draw_point = fitz.Point(
            current_rect.x0 + (origin_x - span_rect.x0) + offset_x,
            current_rect.y0 + (origin_y - span_rect.y0) + offset_y,
        )
    else:
        baseline = current_rect.y0 + pad_y + offset_y + draw_font_size * ascent
        draw_point = fitz.Point(current_rect.x0 + pad_x + offset_x, baseline)

    # Preserve spacing feel by drawing glyph by glyph when custom spacing or x-scale exists.
    tracking = float(op.get("charSpacing", 0.0)) / 1000.0
    horizontal_scale = _clamp(float(op.get("fontScaleX", 1.0)), 0.5, 2.2)
    strict_fit = bool(op.get("strictFit", True))
    micro_calibration = bool(op.get("microCalibration", True))

    if strict_fit:
        max_width = max(current_rect.width - (pad_x * 2.0) - 0.6, 1.0)
        draw_font_size = _fit_font_size_to_width(
            text_value, font_name, draw_font_size, max_width, tracking, horizontal_scale
        )
        tracking = _fit_tracking_to_width(
            text_value, font_name, draw_font_size, tracking, horizontal_scale, max_width
        )

    if micro_calibration:
        draw_point = _micro_calibrate_origin(draw_point, current_rect, span, draw_font_size, ascent)

    needs_manual_advance = abs(tracking) > 0.001 or abs(horizontal_scale - 1.0) > 0.015

    if not needs_manual_advance:
        try:
            page.insert_text(
                draw_point,
                text_value,
                fontsize=draw_font_size,
                fontname=font_name,
                color=draw_color,
                overlay=True,
            )
            return
        except Exception:
            page.insert_text(
                draw_point,
                text_value,
                fontsize=draw_font_size,
                fontname=fallback_font,
                color=draw_color,
                overlay=True,
            )
            return

    cursor_x = float(draw_point.x)
    for ch in text_value:
        try:
            page.insert_text(
                fitz.Point(cursor_x, draw_point.y),
                ch,
                fontsize=draw_font_size,
                fontname=font_name,
                color=draw_color,
                overlay=True,
            )
            glyph_width = _safe_text_length(ch, font_name, draw_font_size)
        except Exception:
            page.insert_text(
                fitz.Point(cursor_x, draw_point.y),
                ch,
                fontsize=draw_font_size,
                fontname=fallback_font,
                color=draw_color,
                overlay=True,
            )
            glyph_width = _safe_text_length(ch, fallback_font, draw_font_size)
        cursor_x += (glyph_width + tracking * draw_font_size) * horizontal_scale


def _export_exact_pdf(pdf_bytes: bytes, operations: List[Dict[str, Any]]) -> bytes:
    if fitz is None:
        raise RuntimeError(f"PyMuPDF import failed: {FITZ_IMPORT_ERROR}")
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    grouped_ops: Dict[int, List[Dict[str, Any]]] = {}
    for op in operations:
        page_index = int(op.get("pageIndex", -1))
        if page_index < 0 or page_index >= document.page_count:
            continue
        grouped_ops.setdefault(page_index, []).append(op)

    for page_index, page_ops in grouped_ops.items():
        page = document.load_page(page_index)
        spans = _collect_page_spans(page)
        page_font_map = _collect_page_font_xrefs(page)
        font_alias_cache: Dict[int, str] = {}
        for op in page_ops:
            _draw_replacement_text(document, page, op, spans, page_font_map, font_alias_cache)

    out_bytes = document.tobytes(deflate=True, garbage=3, clean=True)
    document.close()
    return out_bytes


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "ok": fitz is not None,
            "engine": "pymupdf" if fitz is not None else "unavailable",
            "error": FITZ_IMPORT_ERROR,
        }
    )


@app.route("/api/export-exact", methods=["POST", "OPTIONS"])
def export_exact():
    if request.method == "OPTIONS":
        return ("", 204)
    if fitz is None:
        return jsonify({"error": f"PyMuPDF is not available: {FITZ_IMPORT_ERROR}"}), 500
    payload = request.get_json(silent=True) or {}
    pdf_base64 = str(payload.get("pdfBase64") or "")
    operations = payload.get("operations") or []
    if not pdf_base64:
        return jsonify({"error": "Missing pdfBase64"}), 400
    if not isinstance(operations, list):
        return jsonify({"error": "operations must be a list"}), 400

    try:
        source_bytes = _decode_pdf_base64(pdf_base64)
        output_bytes = _export_exact_pdf(source_bytes, operations)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(
        {
            "ok": True,
            "pdfBase64": _encode_pdf_base64(output_bytes),
            "operationCount": len(operations),
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8787, debug=False)
