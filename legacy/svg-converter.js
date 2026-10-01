(function initSvgConverter() {
  "use strict";

  const STORAGE_LANGUAGE_KEY = "stickerPdfLabLang";
  const state = {
    uiLanguage: "en",
    file: null,
    dataUrl: "",
    imageElement: null,
    width: 0,
    height: 0,
    svgText: "",
    svgObjectUrl: "",
    convertMode: "trace",
    colorPalette: "srgb",
    qualityMode: "high",
    detailLevel: 5,
  };

  const PMS_APPROX_PALETTE = [
    { name: "PMS 100 C (approx)", hex: "#f4ed7c" },
    { name: "PMS 109 C (approx)", hex: "#ffd100" },
    { name: "PMS 116 C (approx)", hex: "#ffcd00" },
    { name: "PMS 1235 C (approx)", hex: "#ffb81c" },
    { name: "PMS 130 C (approx)", hex: "#f2a900" },
    { name: "PMS 1375 C (approx)", hex: "#ff8f1c" },
    { name: "PMS 1655 C (approx)", hex: "#ff5f00" },
    { name: "PMS 185 C (approx)", hex: "#e4002b" },
    { name: "PMS 186 C (approx)", hex: "#c8102e" },
    { name: "PMS 200 C (approx)", hex: "#ba0c2f" },
    { name: "PMS 219 C (approx)", hex: "#da1884" },
    { name: "PMS 2602 C (approx)", hex: "#6a1b9a" },
    { name: "PMS 2685 C (approx)", hex: "#330072" },
    { name: "PMS 2728 C (approx)", hex: "#0047bb" },
    { name: "PMS 285 C (approx)", hex: "#0072ce" },
    { name: "PMS 3005 C (approx)", hex: "#0077c8" },
    { name: "PMS 3125 C (approx)", hex: "#00a3e0" },
    { name: "PMS 3258 C (approx)", hex: "#00c7b1" },
    { name: "PMS 3395 C (approx)", hex: "#00af66" },
    { name: "PMS 347 C (approx)", hex: "#009a44" },
    { name: "PMS 361 C (approx)", hex: "#43b02a" },
    { name: "PMS 375 C (approx)", hex: "#97d700" },
    { name: "PMS 390 C (approx)", hex: "#b5bd00" },
    { name: "PMS 4625 C (approx)", hex: "#4f2c1d" },
    { name: "PMS 476 C (approx)", hex: "#59362f" },
    { name: "PMS Cool Gray 1 C (approx)", hex: "#d9d9d6" },
    { name: "PMS Cool Gray 5 C (approx)", hex: "#b1b3b3" },
    { name: "PMS Cool Gray 11 C (approx)", hex: "#53565a" },
    { name: "PMS Black C (approx)", hex: "#2d2926" },
    { name: "PMS White (paper, approx)", hex: "#ffffff" },
  ];
  const PMS_PALETTE_CONFIG = {
    high: {
      tintLevels: buildPercentRange(100, 20, 5),
      shadeLevels: buildPercentRange(95, 60, 5),
    },
    ultra: {
      tintLevels: buildPercentRange(100, 8, 2),
      shadeLevels: buildPercentRange(98, 50, 2),
    },
  };
  const pmsPaletteCache = new Map();

  const I18N = {
    en: {
      lang_toggle: "Toggle interface language",
      brand_title: "Sticker PDF Lab",
      brand_subtitle: "Raster to SVG with maximum quality output.",
      back_editor: "⬅ Back to Editor",
      heading: "🧩 SVG Converter",
      note: "Upload JPG or PNG. Use High-Detail Vector Trace for scalable SVG quality, or Exact Fidelity for pixel-perfect output.",
      drop_hint: "Drop JPG/PNG here or click to upload",
      mode_label: "Mode",
      mode_trace: "High-Detail Vector Trace",
      mode_embed: "Exact Fidelity (Image Embed)",
      palette_label: "Palette",
      palette_srgb: "Full RGB (Max Detail)",
      palette_pms: "PMS Approx (Spot-like)",
      quality_label: "Quality",
      quality_high: "High (Recommended)",
      quality_ultra: "Ultra Slow (Best Accuracy)",
      detail_label: "Detail",
      convert: "⚡ Convert to SVG",
      download: "⬇ Download SVG",
      meta_file: "File",
      meta_dimensions: "Dimensions",
      meta_type: "Type",
      meta_palette: "Palette",
      meta_palette_srgb: "sRGB",
      meta_palette_pms: "PMS Approx",
      meta_quality: "Quality",
      meta_quality_high: "High",
      meta_quality_ultra: "Ultra Slow",
      preview: "Preview",
      preview_original: "Original",
      preview_svg: "Generated SVG",
      ready: "Ready.",
      invalid_file: "Please choose a JPG or PNG file.",
      loaded: "Image loaded. Click Convert to generate SVG.",
      converted_embed: "SVG generated in exact-fidelity mode (no quality loss). Download is ready.",
      converted_trace: "SVG generated in high-detail vector mode. Download is ready.",
      converted_trace_pms: "SVG generated in high-detail vector mode with PMS-approx mapped colors. Download is ready.",
      download_ready: "Downloaded SVG.",
      read_error: "Could not read this image file.",
      decode_error: "Could not decode this image.",
      no_file: "Upload an image first.",
      tracing: "Tracing image to vector paths...",
      tracing_pms: "Tracing image and remapping colors to PMS approximations...",
      tracing_ultra: "Ultra tracing in progress... this can take longer for better quality.",
      tracing_pms_ultra: "Ultra tracing + PMS remap in progress... this can take longer for better quality.",
      trace_failed: "Vector tracing failed. Try lower detail or use Exact Fidelity mode.",
      tracer_missing: "Vector tracer unavailable. Falling back to Exact Fidelity mode.",
      settings_changed: "Settings changed. Convert again to refresh SVG.",
    },
    ko: {
      lang_toggle: "인터페이스 언어 전환",
      brand_title: "스티커 PDF 랩",
      brand_subtitle: "최대 품질로 JPG/PNG를 SVG로 변환합니다.",
      back_editor: "⬅ 편집기로 돌아가기",
      heading: "🧩 SVG 변환기",
      note: "JPG 또는 PNG를 업로드하세요. 확대 품질은 고디테일 벡터 트레이스, 원본 동일 품질은 정확도 모드를 사용하세요.",
      drop_hint: "여기에 JPG/PNG를 놓거나 클릭해서 업로드하세요",
      mode_label: "모드",
      mode_trace: "고디테일 벡터 트레이스",
      mode_embed: "정확도 모드 (이미지 포함)",
      palette_label: "팔레트",
      palette_srgb: "전체 RGB (최대 디테일)",
      palette_pms: "PMS 근사 (스팟 느낌)",
      quality_label: "품질",
      quality_high: "고품질 (권장)",
      quality_ultra: "울트라 느림 (최고 정확도)",
      detail_label: "디테일",
      convert: "⚡ SVG로 변환",
      download: "⬇ SVG 다운로드",
      meta_file: "파일",
      meta_dimensions: "크기",
      meta_type: "형식",
      meta_palette: "팔레트",
      meta_palette_srgb: "sRGB",
      meta_palette_pms: "PMS 근사",
      meta_quality: "품질",
      meta_quality_high: "고품질",
      meta_quality_ultra: "울트라 느림",
      preview: "미리보기",
      preview_original: "원본",
      preview_svg: "생성된 SVG",
      ready: "준비됨.",
      invalid_file: "JPG 또는 PNG 파일만 선택할 수 있습니다.",
      loaded: "이미지를 불러왔습니다. 변환 버튼을 눌러 SVG를 생성하세요.",
      converted_embed: "정확도 모드 SVG 생성 완료 (원본 품질 유지). 다운로드 가능합니다.",
      converted_trace: "고디테일 벡터 SVG 생성 완료. 다운로드 가능합니다.",
      converted_trace_pms: "PMS 근사 색상 매핑이 적용된 고디테일 벡터 SVG 생성 완료. 다운로드 가능합니다.",
      download_ready: "SVG 다운로드 완료.",
      read_error: "이미지 파일을 읽을 수 없습니다.",
      decode_error: "이미지를 해석할 수 없습니다.",
      no_file: "먼저 이미지를 업로드하세요.",
      tracing: "이미지를 벡터 경로로 변환 중...",
      tracing_pms: "이미지를 벡터로 변환하고 PMS 근사 색상으로 매핑 중...",
      tracing_ultra: "울트라 트레이스 진행 중... 더 나은 품질을 위해 시간이 더 걸립니다.",
      tracing_pms_ultra: "울트라 트레이스 + PMS 매핑 진행 중... 더 나은 품질을 위해 시간이 더 걸립니다.",
      trace_failed: "벡터 트레이스에 실패했습니다. 디테일을 낮추거나 정확도 모드를 사용하세요.",
      tracer_missing: "벡터 트레이서가 없어 정확도 모드로 대체합니다.",
      settings_changed: "설정이 변경되었습니다. SVG를 다시 변환하세요.",
    },
  };

  const ui = {
    langToggleBtn: document.getElementById("langToggleBtn"),
    brandTitle: document.getElementById("brandTitle"),
    brandSubtitle: document.getElementById("brandSubtitle"),
    backEditorBtn: document.getElementById("backEditorBtn"),
    svgHeading: document.getElementById("svgHeading"),
    svgNote: document.getElementById("svgNote"),
    svgDropzone: document.getElementById("svgDropzone"),
    svgDropHint: document.getElementById("svgDropHint"),
    svgFileInput: document.getElementById("svgFileInput"),
    svgModeLabel: document.getElementById("svgModeLabel"),
    svgModeSelect: document.getElementById("svgModeSelect"),
    svgModeTraceOpt: document.getElementById("svgModeTraceOpt"),
    svgModeEmbedOpt: document.getElementById("svgModeEmbedOpt"),
    svgPaletteLabel: document.getElementById("svgPaletteLabel"),
    svgPaletteSelect: document.getElementById("svgPaletteSelect"),
    svgPaletteSrgbOpt: document.getElementById("svgPaletteSrgbOpt"),
    svgPalettePmsOpt: document.getElementById("svgPalettePmsOpt"),
    svgQualityLabel: document.getElementById("svgQualityLabel"),
    svgQualitySelect: document.getElementById("svgQualitySelect"),
    svgQualityHighOpt: document.getElementById("svgQualityHighOpt"),
    svgQualityUltraOpt: document.getElementById("svgQualityUltraOpt"),
    svgDetailLabel: document.getElementById("svgDetailLabel"),
    svgDetailInput: document.getElementById("svgDetailInput"),
    svgDetailValue: document.getElementById("svgDetailValue"),
    svgConvertBtn: document.getElementById("svgConvertBtn"),
    svgDownloadBtn: document.getElementById("svgDownloadBtn"),
    metaFileLabel: document.getElementById("metaFileLabel"),
    metaSizeLabel: document.getElementById("metaSizeLabel"),
    metaTypeLabel: document.getElementById("metaTypeLabel"),
    metaFileValue: document.getElementById("metaFileValue"),
    metaSizeValue: document.getElementById("metaSizeValue"),
    metaTypeValue: document.getElementById("metaTypeValue"),
    metaPaletteLabel: document.getElementById("metaPaletteLabel"),
    metaPaletteValue: document.getElementById("metaPaletteValue"),
    metaQualityLabel: document.getElementById("metaQualityLabel"),
    metaQualityValue: document.getElementById("metaQualityValue"),
    previewHeading: document.getElementById("previewHeading"),
    rasterPreviewTitle: document.getElementById("rasterPreviewTitle"),
    svgPreviewTitle: document.getElementById("svgPreviewTitle"),
    rasterPreview: document.getElementById("rasterPreview"),
    svgPreview: document.getElementById("svgPreview"),
    svgStatusLine: document.getElementById("svgStatusLine"),
  };

  function getInitialLanguage() {
    try {
      if (window.localStorage.getItem(STORAGE_LANGUAGE_KEY) === "ko") {
        return "ko";
      }
    } catch (error) {
      // no-op
    }
    return "en";
  }

  function t(key) {
    const dictionary = I18N[state.uiLanguage] || I18N.en;
    return dictionary[key] || I18N.en[key] || key;
  }

  function setStatus(key, isError) {
    ui.svgStatusLine.textContent = t(key);
    ui.svgStatusLine.style.color = isError ? "#c62828" : "";
  }

  function clamp(value, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return min;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function hexToRgb(hex) {
    const value = String(hex || "").trim().toLowerCase();
    if (!/^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)) {
      return null;
    }
    if (value.length === 4) {
      return {
        r: parseInt(value[1] + value[1], 16),
        g: parseInt(value[2] + value[2], 16),
        b: parseInt(value[3] + value[3], 16),
      };
    }
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
    };
  }

  function rgbToHex(rgb) {
    const r = Math.round(clamp(rgb.r, 0, 255));
    const g = Math.round(clamp(rgb.g, 0, 255));
    const b = Math.round(clamp(rgb.b, 0, 255));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  function blendRgb(source, target, amount) {
    const t = clamp(amount, 0, 1);
    return {
      r: source.r + (target.r - source.r) * t,
      g: source.g + (target.g - source.g) * t,
      b: source.b + (target.b - source.b) * t,
    };
  }

  function buildPercentRange(start, end, step) {
    const result = [];
    const safeStep = Math.max(1, Math.abs(Number(step) || 1));
    for (let value = start; value >= end; value -= safeStep) {
      result.push(Math.round(value));
    }
    if (!result.length || result[result.length - 1] !== end) {
      result.push(end);
    }
    return result;
  }

  function buildExpandedPmsPalette(config) {
    const tintLevels = Array.isArray(config && config.tintLevels)
      ? config.tintLevels
      : PMS_PALETTE_CONFIG.high.tintLevels;
    const shadeLevels = Array.isArray(config && config.shadeLevels)
      ? config.shadeLevels
      : PMS_PALETTE_CONFIG.high.shadeLevels;
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    const byHex = new Map();

    function pushEntry(name, rgb) {
      const hex = rgbToHex(rgb);
      if (byHex.has(hex)) {
        return;
      }
      byHex.set(hex, {
        name,
        hex,
        rgb: {
          r: Math.round(clamp(rgb.r, 0, 255)),
          g: Math.round(clamp(rgb.g, 0, 255)),
          b: Math.round(clamp(rgb.b, 0, 255)),
        },
      });
    }

    PMS_APPROX_PALETTE.forEach((base) => {
      const baseRgb = hexToRgb(base.hex);
      if (!baseRgb) {
        return;
      }
      pushEntry(base.name, baseRgb);
      tintLevels.forEach((pct) => {
        if (pct >= 100) {
          return;
        }
        const tintAmount = (100 - pct) / 100;
        const tinted = blendRgb(baseRgb, white, tintAmount);
        pushEntry(`${base.name} Tint ${pct}%`, tinted);
      });
      shadeLevels.forEach((pct) => {
        if (pct >= 100) {
          return;
        }
        const shadeAmount = 1 - pct / 100;
        const shaded = blendRgb(baseRgb, black, shadeAmount);
        pushEntry(`${base.name} Shade ${pct}%`, shaded);
      });
    });

    return Array.from(byHex.values()).map((entry) => ({
      name: entry.name,
      hex: entry.hex,
      rgb: entry.rgb,
      lab: rgbToLab(entry.rgb),
    }));
  }

  function getActivePmsPalette() {
    const key = state.qualityMode === "ultra" ? "ultra" : "high";
    if (pmsPaletteCache.has(key)) {
      return pmsPaletteCache.get(key);
    }
    const config = PMS_PALETTE_CONFIG[key] || PMS_PALETTE_CONFIG.high;
    const palette = buildExpandedPmsPalette(config);
    pmsPaletteCache.set(key, palette);
    return palette;
  }

  function parseRgbFunction(input) {
    const match = String(input || "")
      .trim()
      .match(/^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*[0-9.]+)?\s*\)$/i);
    if (!match) {
      return null;
    }
    return {
      r: clamp(match[1], 0, 255),
      g: clamp(match[2], 0, 255),
      b: clamp(match[3], 0, 255),
    };
  }

  function parseCssColor(value) {
    if (!value) {
      return null;
    }
    const text = String(value).trim().toLowerCase();
    if (!text || text === "none" || text === "transparent") {
      return null;
    }
    return hexToRgb(text) || parseRgbFunction(text);
  }

  function srgbToLinear(value) {
    const normalized = clamp(value, 0, 255) / 255;
    if (normalized <= 0.04045) {
      return normalized / 12.92;
    }
    return Math.pow((normalized + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(rgb) {
    const r = srgbToLinear(rgb.r);
    const g = srgbToLinear(rgb.g);
    const b = srgbToLinear(rgb.b);

    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

    const refX = 0.95047;
    const refY = 1.0;
    const refZ = 1.08883;

    const fx = labPivot(x / refX);
    const fy = labPivot(y / refY);
    const fz = labPivot(z / refZ);

    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function labPivot(value) {
    if (value > 0.008856) {
      return Math.cbrt(value);
    }
    return 7.787 * value + 16 / 116;
  }

  function deltaE(labA, labB) {
    const dl = labA.l - labB.l;
    const da = labA.a - labB.a;
    const db = labA.b - labB.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function nearestPmsColor(rgb) {
    const palette = getActivePmsPalette();
    if (!palette.length) {
      return null;
    }
    const inputLab = rgbToLab(rgb);
    let best = palette[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    palette.forEach((entry) => {
      const distance = deltaE(inputLab, entry.lab);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    });
    return best;
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function filenameWithoutExt(name) {
    return String(name || "converted-image")
      .replace(/\.[^.]+$/, "")
      .trim() || "converted-image";
  }

  function isSupportedImage(file) {
    if (!file) {
      return false;
    }
    const mime = String(file.type || "").toLowerCase();
    if (/^image\/(png|jpeg|jpg)$/i.test(mime)) {
      return true;
    }
    return /\.(png|jpe?g)$/i.test(String(file.name || ""));
  }

  function applyLanguageUI() {
    document.documentElement.lang = state.uiLanguage === "ko" ? "ko" : "en";
    ui.langToggleBtn.dataset.lang = state.uiLanguage;
    ui.langToggleBtn.title = t("lang_toggle");
    ui.langToggleBtn.setAttribute("aria-label", t("lang_toggle"));

    ui.brandTitle.textContent = t("brand_title");
    ui.brandSubtitle.textContent = t("brand_subtitle");
    ui.backEditorBtn.textContent = t("back_editor");
    ui.svgHeading.textContent = t("heading");
    ui.svgNote.textContent = t("note");
    ui.svgDropHint.textContent = t("drop_hint");
    ui.svgModeLabel.textContent = t("mode_label");
    ui.svgModeTraceOpt.textContent = t("mode_trace");
    ui.svgModeEmbedOpt.textContent = t("mode_embed");
    ui.svgPaletteLabel.textContent = t("palette_label");
    ui.svgPaletteSrgbOpt.textContent = t("palette_srgb");
    ui.svgPalettePmsOpt.textContent = t("palette_pms");
    ui.svgQualityLabel.textContent = t("quality_label");
    ui.svgQualityHighOpt.textContent = t("quality_high");
    ui.svgQualityUltraOpt.textContent = t("quality_ultra");
    ui.svgDetailLabel.textContent = t("detail_label");
    ui.svgConvertBtn.textContent = t("convert");
    ui.svgDownloadBtn.textContent = t("download");
    ui.metaFileLabel.textContent = t("meta_file");
    ui.metaSizeLabel.textContent = t("meta_dimensions");
    ui.metaTypeLabel.textContent = t("meta_type");
    ui.metaPaletteLabel.textContent = t("meta_palette");
    ui.metaQualityLabel.textContent = t("meta_quality");
    ui.previewHeading.textContent = t("preview");
    ui.rasterPreviewTitle.textContent = t("preview_original");
    ui.svgPreviewTitle.textContent = t("preview_svg");
    updatePaletteMeta();
    updateQualityMeta();
    updateDetailValueLabel();
  }

  function toggleLanguage() {
    state.uiLanguage = state.uiLanguage === "ko" ? "en" : "ko";
    try {
      window.localStorage.setItem(STORAGE_LANGUAGE_KEY, state.uiLanguage);
    } catch (error) {
      // no-op
    }
    applyLanguageUI();
  }

  function revokePreviewUrl() {
    if (!state.svgObjectUrl) {
      return;
    }
    URL.revokeObjectURL(state.svgObjectUrl);
    state.svgObjectUrl = "";
  }

  function clearGeneratedSvg() {
    state.svgText = "";
    revokePreviewUrl();
    ui.svgPreview.removeAttribute("data");
  }

  function updateDetailValueLabel() {
    const safeDetail = clamp(state.detailLevel, 1, 5);
    ui.svgDetailValue.textContent = `${safeDetail}/5`;
  }

  function updatePaletteMeta() {
    ui.metaPaletteValue.textContent =
      state.colorPalette === "pms" ? t("meta_palette_pms") : t("meta_palette_srgb");
  }

  function updateQualityMeta() {
    ui.metaQualityValue.textContent =
      state.qualityMode === "ultra" ? t("meta_quality_ultra") : t("meta_quality_high");
  }

  function updateMeta() {
    ui.metaFileValue.textContent = state.file ? state.file.name : "-";
    ui.metaSizeValue.textContent =
      state.width > 0 && state.height > 0 ? `${state.width} × ${state.height}` : "-";
    ui.metaTypeValue.textContent = state.file ? state.file.type : "-";
    updatePaletteMeta();
    updateQualityMeta();
  }

  function updateButtons() {
    ui.svgConvertBtn.disabled = !state.file;
    ui.svgDownloadBtn.disabled = !state.svgText;
    ui.svgDetailInput.disabled = state.convertMode !== "trace";
    ui.svgPaletteSelect.disabled = state.convertMode !== "trace";
    ui.svgQualitySelect.disabled = state.convertMode !== "trace";
  }

  async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function decodeImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode_failed"));
      image.src = dataUrl;
    });
  }

  async function handleFile(file) {
    if (!file) {
      return;
    }
    if (!isSupportedImage(file)) {
      setStatus("invalid_file", true);
      return;
    }

    revokePreviewUrl();
    state.file = null;
    state.dataUrl = "";
    state.imageElement = null;
    state.width = 0;
    state.height = 0;
    clearGeneratedSvg();
    ui.rasterPreview.removeAttribute("src");
    updateMeta();
    updateButtons();

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await decodeImage(dataUrl);
      state.file = file;
      state.dataUrl = dataUrl;
      state.imageElement = image;
      state.width = image.naturalWidth || image.width;
      state.height = image.naturalHeight || image.height;
      ui.rasterPreview.src = dataUrl;
      updateMeta();
      updateButtons();
      setStatus("loaded", false);
    } catch (error) {
      setStatus(error && error.message === "decode_failed" ? "decode_error" : "read_error", true);
    }
  }

  function buildMaxQualitySvg() {
    if (!state.file || !state.dataUrl || !state.width || !state.height) {
      return "";
    }
    const safeName = escapeXml(state.file.name);
    const width = Math.max(1, Number(state.width || 1));
    const height = Math.max(1, Number(state.height || 1));
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      "  <metadata>",
      `    source: ${safeName}; mode: lossless-embedded-raster; quality: maximum-visual-fidelity`,
      "  </metadata>",
      `  <image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${state.dataUrl}"/>`,
      "</svg>",
      "",
    ].join("\n");
  }

  function buildTraceOptions() {
    const level = clamp(state.detailLevel, 1, 5);
    const presetMap = {
      1: { ltres: 1.2, qtres: 1.2, pathomit: 12, numberofcolors: 36, colorquantcycles: 3 },
      2: { ltres: 0.85, qtres: 0.85, pathomit: 7, numberofcolors: 56, colorquantcycles: 4 },
      3: { ltres: 0.6, qtres: 0.6, pathomit: 3, numberofcolors: 84, colorquantcycles: 5 },
      4: { ltres: 0.38, qtres: 0.38, pathomit: 1, numberofcolors: 120, colorquantcycles: 6 },
      5: { ltres: 0.22, qtres: 0.22, pathomit: 0, numberofcolors: 170, colorquantcycles: 8 },
    };
    const preset = presetMap[level] || presetMap[5];
    const isUltra = state.qualityMode === "ultra";
    const pmsColorBoost = isUltra ? [128, 196, 280, 360, 460] : [64, 96, 136, 188, 248];
    const boostedPmsColors = pmsColorBoost[level - 1] || (isUltra ? 460 : 248);
    const srgbBoost = isUltra ? [96, 148, 224, 320, 420] : [36, 56, 84, 120, 170];
    const boostedSrgbColors = srgbBoost[level - 1] || (isUltra ? 420 : 170);
    const baseLtres = isUltra ? preset.ltres * 0.66 : preset.ltres;
    const baseQtres = isUltra ? preset.qtres * 0.66 : preset.qtres;
    const basePathomit = isUltra ? Math.max(0, preset.pathomit - 1) : preset.pathomit;
    const baseCycles = isUltra ? preset.colorquantcycles + 3 : preset.colorquantcycles;
    return {
      ltres: Math.max(0.06, baseLtres),
      qtres: Math.max(0.06, baseQtres),
      pathomit: basePathomit,
      rightangleenhance: true,
      colorsampling: 2,
      numberofcolors: state.colorPalette === "pms" ? boostedPmsColors : boostedSrgbColors,
      mincolorratio: 0,
      colorquantcycles:
        state.colorPalette === "pms" ? baseCycles + 2 : baseCycles,
      layering: 0,
      strokewidth: 0,
      linefilter: false,
      roundcoords: isUltra || level >= 4 ? 1 : 2,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
      desc: true,
    };
  }

  function ensureSvgSize(svgText, width, height) {
    if (!svgText) {
      return "";
    }
    return String(svgText).replace(/<svg\b([^>]*)>/i, (match, attrs) => {
      let nextAttrs = attrs || "";
      if (!/\bwidth\s*=/.test(nextAttrs)) {
        nextAttrs += ` width="${width}"`;
      }
      if (!/\bheight\s*=/.test(nextAttrs)) {
        nextAttrs += ` height="${height}"`;
      }
      if (!/\bviewBox\s*=/.test(nextAttrs)) {
        nextAttrs += ` viewBox="0 0 ${width} ${height}"`;
      }
      return `<svg${nextAttrs}>`;
    });
  }

  async function buildTraceInputDataUrl() {
    if (!state.imageElement || !state.width || !state.height) {
      return state.dataUrl;
    }
    const level = clamp(state.detailLevel, 1, 5);
    const isUltra = state.qualityMode === "ultra";
    const scaleMap = isUltra ? [1.4, 1.8, 2.2, 2.8, 3.4] : [1, 1.15, 1.3, 1.6, 2.0];
    let scale = scaleMap[level - 1] || (isUltra ? 3.4 : 2.0);
    const maxEdge = isUltra ? 5200 : 3200;
    const longestEdge = Math.max(state.width, state.height);
    if (longestEdge > 0) {
      scale = Math.min(scale, maxEdge / longestEdge);
    }
    if (!Number.isFinite(scale) || scale <= 1.02) {
      return state.dataUrl;
    }
    const targetWidth = Math.max(1, Math.round(state.width * scale));
    const targetHeight = Math.max(1, Math.round(state.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return state.dataUrl;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(state.imageElement, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/png");
  }

  async function buildVectorTraceSvg() {
    const tracer = window.ImageTracer;
    if (!tracer || typeof tracer.imageToSVG !== "function") {
      throw new Error("tracer_missing");
    }
    const options = buildTraceOptions();
    const traceDataUrl = await buildTraceInputDataUrl();
    return new Promise((resolve, reject) => {
      try {
        tracer.imageToSVG(
          traceDataUrl,
          (svgString) => {
            if (!svgString || typeof svgString !== "string") {
              reject(new Error("trace_failed"));
              return;
            }
            resolve(ensureSvgSize(svgString, state.width, state.height));
          },
          options,
        );
      } catch (error) {
        reject(new Error("trace_failed"));
      }
    });
  }

  function replaceStyleColor(styleText, propertyName, mapper) {
    const regex = new RegExp(`(${propertyName}\\s*:\\s*)([^;]+)`, "gi");
    return String(styleText || "").replace(regex, (match, prefix, rawColor) => {
      const mapped = mapper(rawColor);
      if (!mapped) {
        return match;
      }
      return `${prefix}${mapped.hex}`;
    });
  }

  function mapSvgToPmsApprox(svgText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(String(svgText || ""), "image/svg+xml");
    if (!xml || xml.querySelector("parsererror")) {
      return { svg: svgText, used: [] };
    }
    const svgEl = xml.documentElement;
    const colorCache = new Map();
    const used = new Set();

    function mapColor(rawColor) {
      const key = String(rawColor || "").trim().toLowerCase();
      if (!key || key === "none" || key === "transparent" || key === "currentcolor" || key.startsWith("url(")) {
        return null;
      }
      if (colorCache.has(key)) {
        return colorCache.get(key);
      }
      const rgb = parseCssColor(key);
      if (!rgb) {
        colorCache.set(key, null);
        return null;
      }
      const mapped = nearestPmsColor(rgb);
      colorCache.set(key, mapped);
      if (mapped) {
        used.add(mapped.name);
      }
      return mapped;
    }

    Array.from(svgEl.querySelectorAll("*")).forEach((node) => {
      if (node.hasAttribute("fill")) {
        const mappedFill = mapColor(node.getAttribute("fill"));
        if (mappedFill) {
          node.setAttribute("fill", mappedFill.hex);
        }
      }
      if (node.hasAttribute("stroke")) {
        const mappedStroke = mapColor(node.getAttribute("stroke"));
        if (mappedStroke) {
          node.setAttribute("stroke", mappedStroke.hex);
        }
      }
      if (node.hasAttribute("stop-color")) {
        const mappedStop = mapColor(node.getAttribute("stop-color"));
        if (mappedStop) {
          node.setAttribute("stop-color", mappedStop.hex);
        }
      }
      if (node.hasAttribute("style")) {
        let style = node.getAttribute("style");
        style = replaceStyleColor(style, "fill", mapColor);
        style = replaceStyleColor(style, "stroke", mapColor);
        style = replaceStyleColor(style, "stop-color", mapColor);
        node.setAttribute("style", style);
      }
    });

    const usedList = Array.from(used);
    const shownList = usedList.slice(0, 40);
    const remainder = usedList.length - shownList.length;
    const swatchSummary =
      shownList.length === 0
        ? "none"
        : remainder > 0
          ? `${shownList.join(", ")} (+${remainder} more)`
          : shownList.join(", ");
    const activePaletteSize = getActivePmsPalette().length;
    const metadataLine =
      `palette: PMS approximate mapping; paletteSize: ${activePaletteSize}; qualityMode: ${state.qualityMode}; ` +
      `swatches: ${swatchSummary}`;
    let metadataNode = svgEl.querySelector("metadata");
    if (!metadataNode) {
      metadataNode = xml.createElementNS("http://www.w3.org/2000/svg", "metadata");
      if (svgEl.firstChild) {
        svgEl.insertBefore(metadataNode, svgEl.firstChild);
      } else {
        svgEl.appendChild(metadataNode);
      }
    }
    const existing = metadataNode.textContent ? `${metadataNode.textContent}\n` : "";
    metadataNode.textContent = `${existing}${metadataLine}`;

    const serialized = new XMLSerializer().serializeToString(xml);
    return { svg: serialized, used: usedList };
  }

  async function convertToSvg() {
    if (!state.file) {
      setStatus("no_file", true);
      return;
    }
    ui.svgConvertBtn.disabled = true;
    try {
      let svgText = "";
      if (state.convertMode === "trace") {
        const tracingStatusKey =
          state.qualityMode === "ultra"
            ? state.colorPalette === "pms"
              ? "tracing_pms_ultra"
              : "tracing_ultra"
            : state.colorPalette === "pms"
              ? "tracing_pms"
              : "tracing";
        setStatus(tracingStatusKey, false);
        try {
          svgText = await buildVectorTraceSvg();
          if (state.colorPalette === "pms") {
            const mapped = mapSvgToPmsApprox(svgText);
            svgText = mapped.svg;
          }
          setStatus(state.colorPalette === "pms" ? "converted_trace_pms" : "converted_trace", false);
        } catch (traceError) {
          if (traceError && traceError.message === "tracer_missing") {
            svgText = buildMaxQualitySvg();
            setStatus("tracer_missing", true);
          } else {
            setStatus("trace_failed", true);
            return;
          }
        }
      } else {
        svgText = buildMaxQualitySvg();
        setStatus("converted_embed", false);
      }

      if (!svgText) {
        setStatus("no_file", true);
        return;
      }
      state.svgText = svgText;
      revokePreviewUrl();
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      state.svgObjectUrl = URL.createObjectURL(blob);
      ui.svgPreview.data = state.svgObjectUrl;
    } finally {
      updateButtons();
    }
  }

  function downloadSvg() {
    if (!state.svgText || !state.file) {
      setStatus("no_file", true);
      return;
    }
    const blob = new Blob([state.svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filenameWithoutExt(state.file.name)}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("download_ready", false);
  }

  function bindDragDrop() {
    const preventDefaults = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      ui.svgDropzone.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      ui.svgDropzone.addEventListener(eventName, () => {
        ui.svgDropzone.classList.add("active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      ui.svgDropzone.addEventListener(eventName, () => {
        ui.svgDropzone.classList.remove("active");
      });
    });

    ui.svgDropzone.addEventListener("drop", (event) => {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) {
        return;
      }
      handleFile(files[0]);
    });
  }

  function bindEvents() {
    ui.langToggleBtn.addEventListener("click", toggleLanguage);
    ui.svgFileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      handleFile(file);
      ui.svgFileInput.value = "";
    });
    ui.svgModeSelect.addEventListener("change", (event) => {
      state.convertMode = event.target.value === "embed" ? "embed" : "trace";
      clearGeneratedSvg();
      updateMeta();
      updateButtons();
      if (state.file) {
        setStatus("settings_changed", false);
      }
    });
    ui.svgPaletteSelect.addEventListener("change", (event) => {
      state.colorPalette = event.target.value === "pms" ? "pms" : "srgb";
      clearGeneratedSvg();
      updateMeta();
      updateButtons();
      if (state.file && state.convertMode === "trace") {
        setStatus("settings_changed", false);
      }
    });
    ui.svgQualitySelect.addEventListener("change", (event) => {
      state.qualityMode = event.target.value === "ultra" ? "ultra" : "high";
      clearGeneratedSvg();
      updateMeta();
      updateButtons();
      if (state.file && state.convertMode === "trace") {
        setStatus("settings_changed", false);
      }
    });
    ui.svgDetailInput.addEventListener("input", (event) => {
      state.detailLevel = clamp(event.target.value, 1, 5);
      ui.svgDetailInput.value = String(state.detailLevel);
      updateDetailValueLabel();
      if (state.convertMode === "trace") {
        clearGeneratedSvg();
        updateButtons();
        if (state.file) {
          setStatus("settings_changed", false);
        }
      }
    });
    ui.svgConvertBtn.addEventListener("click", () => {
      convertToSvg();
    });
    ui.svgDownloadBtn.addEventListener("click", downloadSvg);
    bindDragDrop();
  }

  function initialize() {
    state.uiLanguage = getInitialLanguage();
    state.convertMode = ui.svgModeSelect.value === "embed" ? "embed" : "trace";
    state.colorPalette = ui.svgPaletteSelect.value === "pms" ? "pms" : "srgb";
    state.qualityMode = ui.svgQualitySelect.value === "ultra" ? "ultra" : "high";
    state.detailLevel = clamp(ui.svgDetailInput.value, 1, 5);
    ui.svgDetailInput.value = String(state.detailLevel);
    applyLanguageUI();
    updateMeta();
    updateButtons();
    setStatus("ready", false);
    bindEvents();
  }

  window.addEventListener("beforeunload", revokePreviewUrl);
  initialize();
})();
