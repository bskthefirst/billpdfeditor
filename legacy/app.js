(function initPdfStudio() {
  "use strict";

  const pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  const fabricLib = window.fabric;
  const pdfLib = window.PDFLib;
  const pdfLibFontkit = window.fontkit || null;
  const tesseractLib = window.Tesseract;

  if (!pdfjsLib || !fabricLib || !pdfLib) {
    window.alert("Required libraries did not load. Refresh and try again. / 필수 라이브러리가 로드되지 않았습니다. 새로고침 후 다시 시도하세요.");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const CREATE_TOOLS = new Set(["text", "rect", "ellipse", "line"]);
  const DEFAULT_DETECTED_TEXT_COLOR = "#111827";
  const EXPORT_OVERLAY_MULTIPLIER = 6;
  const EXACT_EXPORT_HEALTH_URL = "http://127.0.0.1:8787/api/health";
  const EXACT_EXPORT_URL = "http://127.0.0.1:8787/api/export-exact";
  const STORAGE_LANGUAGE_KEY = "stickerPdfLabLang";
  const cssFontFaceSrcCache = new Map();
  const cssFontFaceBytesCache = new Map();
  let initialLanguage = "en";
  try {
    if (window.localStorage.getItem(STORAGE_LANGUAGE_KEY) === "ko") {
      initialLanguage = "ko";
    }
  } catch (error) {
    initialLanguage = "en";
  }
  const I18N = {
    en: {
      brand_title: "Sticker PDF Lab",
      brand_subtitle: "Edit text, draw, decorate, and export.",
      lang_button_en: "Eng/한글",
      lang_button_ko: "한글/Eng",
      lang_button_title: "Toggle interface language",
      ocr_opt_eng: "🔎 OCR English",
      ocr_opt_kor: "🔎 OCR Korean",
      ocr_opt_eng_kor: "🔎 OCR Eng + Kor",
      ocr_button: "🔎 OCR",
      open_pdf: "📂 Open PDF",
      export_pdf: "📤 Export PDF",
      pages_heading: "Pages",
      no_file_loaded: "No file loaded",
      tool_select: "🎯 Select",
      tool_edit_text: "📝 Edit Text",
      tool_draw: "✏️ Draw",
      tool_text: "🔤 Add Text",
      tool_rect: "🟥 Rect",
      tool_ellipse: "🟠 Ellipse",
      tool_line: "📏 Line",
      tool_delete: "🗑️ Delete",
      tool_duplicate: "📄 Duplicate",
      tool_title_select: "Select (V)",
      tool_title_edit_text: "Edit Text (R)",
      tool_title_draw: "Free draw (D)",
      tool_title_text: "Add text (T)",
      tool_title_rect: "Rectangle",
      tool_title_ellipse: "Ellipse",
      tool_title_line: "Line",
      prev: "⬅️ Prev",
      next: "Next ➡️",
      undo: "↩️ Undo",
      redo: "↪️ Redo",
      clear_page: "🧹 Clear Page",
      preview_before: "🪞 Before",
      preview_after: "🪞 After",
      zoom: "🔍 Zoom",
      fit: "Fit",
      drop_hint: "Drop a PDF here or click Open PDF",
      ready: "Ready",
      properties: "Properties",
      svg_page: "🧩 SVG",
      split_page: "✂️ Split",
      png_jpg_page: "🖼️ PNG/JPG",
      stroke: "Stroke",
      fill: "Fill",
      fill_opacity: "Fill Opacity",
      text_color: "Text Color",
      font: "Font",
      stroke_width: "Stroke Width",
      font_size: "Font Size",
      bring_front: "⬆️ Bring To Front",
      send_back: "⬇️ Send To Back",
      split_heading: "✂️ Split PDF",
      split_note: "Extract page ranges from the edited document.",
      from: "From",
      to: "To",
      add_range: "➕ Add Range",
      clear: "🧹 Clear",
      merge_ranges: "Merge all ranges into one PDF",
      split_extract: "✂️ Split / Extract",
      text_tune_heading: "🧠 Text Match",
      letter_spacing: "Letter Spacing",
      auto_match_all: "🧲 Auto-Match All",
      vector_text_export: "Use vector text export",
      font_inspector_heading: "🔎 Font Inspector",
      font_inspector_original: "Original",
      font_inspector_export: "Export",
      font_inspector_empty: "Select a text box to inspect font substitution.",
      font_inspector_unavailable: "No editable text selected.",
      font_inspector_embedded: "Embedded as {font}.",
      font_inspector_fallback: "Fallback to {font} for export.",
      page_zero: "Page 0 / 0",
      page_position: "Page {current} / {total}",
      page_count: "{count} pages",
      thumb_page: "Page {index}",
      split_no_ranges: "No ranges yet.",
      split_range_row: "Range {index}: pages {from}–{to}",
      split_remove: "Remove",
      tool_name_select: "select",
      tool_name_editText: "edit text",
      tool_name_draw: "draw",
      tool_name_text: "add text",
      tool_name_rect: "rect",
      tool_name_ellipse: "ellipse",
      tool_name_line: "line",
    },
    ko: {
      brand_title: "스티커 PDF 랩",
      brand_subtitle: "텍스트 편집, 그리기, 꾸미기, 내보내기.",
      lang_button_en: "Eng/한글",
      lang_button_ko: "한글/Eng",
      lang_button_title: "인터페이스 언어 전환",
      ocr_opt_eng: "🔎 OCR 영어",
      ocr_opt_kor: "🔎 OCR 한국어",
      ocr_opt_eng_kor: "🔎 OCR 영+한",
      ocr_button: "🔎 OCR",
      open_pdf: "📂 PDF 열기",
      export_pdf: "📤 PDF 내보내기",
      pages_heading: "페이지",
      no_file_loaded: "불러온 파일 없음",
      tool_select: "🎯 선택",
      tool_edit_text: "📝 텍스트 편집",
      tool_draw: "✏️ 그리기",
      tool_text: "🔤 텍스트 추가",
      tool_rect: "🟥 사각형",
      tool_ellipse: "🟠 타원",
      tool_line: "📏 선",
      tool_delete: "🗑️ 삭제",
      tool_duplicate: "📄 복제",
      tool_title_select: "선택 (V)",
      tool_title_edit_text: "텍스트 편집 (R)",
      tool_title_draw: "자유 그리기 (D)",
      tool_title_text: "텍스트 추가 (T)",
      tool_title_rect: "사각형",
      tool_title_ellipse: "타원",
      tool_title_line: "선",
      prev: "⬅️ 이전",
      next: "다음 ➡️",
      undo: "↩️ 실행 취소",
      redo: "↪️ 다시 실행",
      clear_page: "🧹 페이지 비우기",
      preview_before: "🪞 이전 보기",
      preview_after: "🪞 편집 보기",
      zoom: "🔍 확대/축소",
      fit: "맞춤",
      drop_hint: "여기에 PDF를 놓거나 'PDF 열기'를 클릭하세요",
      ready: "준비됨",
      properties: "속성",
      svg_page: "🧩 SVG",
      split_page: "✂️ 분할",
      png_jpg_page: "🖼️ PNG/JPG",
      stroke: "선",
      fill: "채우기",
      fill_opacity: "채우기 투명도",
      text_color: "텍스트 색상",
      font: "글꼴",
      stroke_width: "선 두께",
      font_size: "글자 크기",
      bring_front: "⬆️ 맨 앞으로",
      send_back: "⬇️ 맨 뒤로",
      split_heading: "✂️ PDF 분할",
      split_note: "편집된 문서에서 페이지 범위를 추출합니다.",
      from: "시작",
      to: "끝",
      add_range: "➕ 범위 추가",
      clear: "🧹 초기화",
      merge_ranges: "모든 범위를 하나의 PDF로 병합",
      split_extract: "✂️ 분할 / 추출",
      text_tune_heading: "🧠 텍스트 매칭",
      letter_spacing: "자간",
      auto_match_all: "🧲 전체 자동 보정",
      vector_text_export: "벡터 텍스트 내보내기 사용",
      font_inspector_heading: "🔎 폰트 분석기",
      font_inspector_original: "원본",
      font_inspector_export: "내보내기",
      font_inspector_empty: "텍스트 박스를 선택하면 폰트 대체 정보를 볼 수 있습니다.",
      font_inspector_unavailable: "선택된 편집 텍스트가 없습니다.",
      font_inspector_embedded: "{font} 폰트로 임베드됩니다.",
      font_inspector_fallback: "내보내기 시 {font}로 대체됩니다.",
      page_zero: "페이지 0 / 0",
      page_position: "페이지 {current} / {total}",
      page_count: "{count}페이지",
      thumb_page: "페이지 {index}",
      split_no_ranges: "아직 범위가 없습니다.",
      split_range_row: "범위 {index}: 페이지 {from}–{to}",
      split_remove: "삭제",
      tool_name_select: "선택",
      tool_name_editText: "텍스트 편집",
      tool_name_draw: "그리기",
      tool_name_text: "텍스트 추가",
      tool_name_rect: "사각형",
      tool_name_ellipse: "타원",
      tool_name_line: "선",
    },
  };
  const SERIALIZED_PROPS = [
    "isHelper",
    "isInlineEditor",
    "isTextEditGroup",
    "textSource",
    "originalText",
    "editedText",
    "hasTextEdit",
    "isDeletedText",
    "originalFontFamily",
    "originalFontSize",
    "originalFontWeight",
    "originalFontStyle",
    "editFontFamily",
    "editFontSize",
    "editFontWeight",
    "editFontStyle",
    "paddingX",
    "paddingY",
    "maskFillColor",
    "textFillColor",
    "baseLeft",
    "baseTop",
    "baseWidth",
    "baseHeight",
    "isMoveOriginMask",
    "originalComparableText",
    "fontScaleX",
    "originalFontScaleX",
    "originalCharSpacing",
    "editCharSpacing",
    "originalAscent",
    "originalInkOffsetX",
    "originalInkOffsetY",
    "typographyCalibrated",
  ];

  const state = {
    originalPdfBytes: null,
    pdfDoc: null,
    pageEntries: [],
    currentPageIndex: 0,
    currentFileName: "edited-document",
    tool: "select",
    renderScale: 1.5,
    pageZoom: 1,
    strokeColor: "#0d4efd",
    fillColor: "#63a1ff",
    fillOpacity: 0.2,
    textColor: "#0f172a",
    strokeWidth: 3,
    fontSize: 24,
    fontFamily: "Gaegu, cursive",
    ocrLanguage: "eng",
    isPreparingTextBoxes: false,
    isRunningOcr: false,
    splitRanges: [],
    beforePreview: false,
    vectorTextExport: true,
    letterSpacing: 0,
    uiLanguage: initialLanguage,
    lastStatusRaw: "",
    lastStatusIsError: false,
    exactExportAvailable: null,
  };

  const ui = {
    langToggleBtn: document.getElementById("langToggleBtn"),
    brandTitle: document.getElementById("brandTitle"),
    brandSubtitle: document.getElementById("brandSubtitle"),
    fileInput: document.getElementById("fileInput"),
    fileLabel: document.querySelector('label.file-label[for="fileInput"]'),
    exportBtn: document.getElementById("exportBtn"),
    ocrBtn: document.getElementById("ocrBtn"),
    ocrLangSelect: document.getElementById("ocrLangSelect"),
    ocrOptEng: document.getElementById("ocrOptEng"),
    ocrOptKor: document.getElementById("ocrOptKor"),
    ocrOptEngKor: document.getElementById("ocrOptEngKor"),
    pagesHeading: document.getElementById("pagesHeading"),
    toolSelectBtn: document.getElementById("toolSelectBtn"),
    toolEditTextBtn: document.getElementById("toolEditTextBtn"),
    toolDrawBtn: document.getElementById("toolDrawBtn"),
    toolAddTextBtn: document.getElementById("toolAddTextBtn"),
    toolRectBtn: document.getElementById("toolRectBtn"),
    toolEllipseBtn: document.getElementById("toolEllipseBtn"),
    toolLineBtn: document.getElementById("toolLineBtn"),
    pageCountLabel: document.getElementById("pageCountLabel"),
    pagePositionLabel: document.getElementById("pagePositionLabel"),
    thumbnailList: document.getElementById("thumbnailList"),
    pageStage: document.getElementById("pageStage"),
    dropHint: document.getElementById("dropHint"),
    statusLine: document.getElementById("statusLine"),
    toolButtons: Array.from(document.querySelectorAll(".tool-btn[data-tool]")),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    undoBtn: document.getElementById("undoBtn"),
    redoBtn: document.getElementById("redoBtn"),
    clearPageBtn: document.getElementById("clearPageBtn"),
    beforeAfterBtn: document.getElementById("beforeAfterBtn"),
    deleteSelectionBtn: document.getElementById("deleteSelectionBtn"),
    duplicateSelectionBtn: document.getElementById("duplicateSelectionBtn"),
    bringFrontBtn: document.getElementById("bringFrontBtn"),
    sendBackBtn: document.getElementById("sendBackBtn"),
    strokeColorInput: document.getElementById("strokeColorInput"),
    fillColorInput: document.getElementById("fillColorInput"),
    fillOpacityInput: document.getElementById("fillOpacityInput"),
    textColorInput: document.getElementById("textColorInput"),
    fontFamilySelect: document.getElementById("fontFamilySelect"),
    strokeWidthInput: document.getElementById("strokeWidthInput"),
    fontSizeInput: document.getElementById("fontSizeInput"),
    stageScroller: document.getElementById("stageScroller"),
    zoomRangeInput: document.getElementById("zoomRangeInput"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomResetBtn: document.getElementById("zoomResetBtn"),
    zoomFitBtn: document.getElementById("zoomFitBtn"),
    zoomValueLabel: document.getElementById("zoomValueLabel"),
    zoomControlLabel: document.getElementById("zoomControlLabel"),
    propertiesHeading: document.getElementById("propertiesHeading"),
    svgPageBtn: document.getElementById("svgPageBtn"),
    splitSectionBtn: document.getElementById("splitSectionBtn"),
    pngJpgPageBtn: document.getElementById("pngJpgPageBtn"),
    splitPanelSection: document.getElementById("splitPanelSection"),
    textTuneHeading: document.getElementById("textTuneHeading"),
    labelLetterSpacing: document.getElementById("labelLetterSpacing"),
    letterSpacingInput: document.getElementById("letterSpacingInput"),
    letterSpacingValue: document.getElementById("letterSpacingValue"),
    autoMatchTextBtn: document.getElementById("autoMatchTextBtn"),
    vectorTextExportInput: document.getElementById("vectorTextExportInput"),
    vectorTextExportLabel: document.getElementById("vectorTextExportLabel"),
    fontInspectorHeading: document.getElementById("fontInspectorHeading"),
    fontInspectorOriginalLabel: document.getElementById("fontInspectorOriginalLabel"),
    fontInspectorOriginalValue: document.getElementById("fontInspectorOriginalValue"),
    fontInspectorExportLabel: document.getElementById("fontInspectorExportLabel"),
    fontInspectorExportValue: document.getElementById("fontInspectorExportValue"),
    fontInspectorNote: document.getElementById("fontInspectorNote"),
    labelStroke: document.getElementById("labelStroke"),
    labelFill: document.getElementById("labelFill"),
    labelFillOpacity: document.getElementById("labelFillOpacity"),
    labelTextColor: document.getElementById("labelTextColor"),
    labelFont: document.getElementById("labelFont"),
    labelStrokeWidth: document.getElementById("labelStrokeWidth"),
    labelFontSize: document.getElementById("labelFontSize"),
    splitHeading: document.getElementById("splitHeading"),
    splitNote: document.getElementById("splitNote"),
    splitFromLabel: document.getElementById("splitFromLabel"),
    splitToLabel: document.getElementById("splitToLabel"),
    mergeRangesLabel: document.getElementById("mergeRangesLabel"),
    splitFromInput: document.getElementById("splitFromInput"),
    splitToInput: document.getElementById("splitToInput"),
    addSplitRangeBtn: document.getElementById("addSplitRangeBtn"),
    clearSplitRangesBtn: document.getElementById("clearSplitRangesBtn"),
    splitRangeList: document.getElementById("splitRangeList"),
    mergeSplitRangesInput: document.getElementById("mergeSplitRangesInput"),
    splitPdfBtn: document.getElementById("splitPdfBtn"),
  };
  const textMeasureCanvas = document.createElement("canvas");
  const textMeasureContext = textMeasureCanvas.getContext("2d");

  function formatI18n(template, values) {
    return String(template || "").replace(/\{([^}]+)\}/g, (match, key) => {
      if (!values || typeof values[key] === "undefined") {
        return match;
      }
      return String(values[key]);
    });
  }

  function t(key, values) {
    const languageTable = I18N[state.uiLanguage] || I18N.en;
    const englishFallback = I18N.en[key] || key;
    const template = languageTable[key] || englishFallback;
    return formatI18n(template, values);
  }

  function translateStatusMessage(message) {
    const raw = String(message || "");
    if (state.uiLanguage !== "ko" || !raw) {
      return raw;
    }

    const exactMap = {
      "Text updated.": "텍스트가 수정되었습니다.",
      "Text deleted.": "텍스트가 삭제되었습니다.",
      "Editing text: Enter or Esc to apply.": "텍스트 편집 중: Enter 또는 Esc로 적용됩니다.",
      "Open a PDF before adding split ranges.": "분할 범위를 추가하기 전에 PDF를 열어주세요.",
      "Invalid page range.": "유효하지 않은 페이지 범위입니다.",
      "That range already exists.": "이미 추가된 범위입니다.",
      "Split ranges cleared.": "분할 범위가 초기화되었습니다.",
      "No embedded text found. Use OCR for scanned PDFs.": "내장 텍스트를 찾지 못했습니다. 스캔 PDF는 OCR을 사용하세요.",
      "Failed to detect text boxes.": "텍스트 박스 감지에 실패했습니다.",
      "Open a PDF first.": "먼저 PDF를 열어주세요.",
      "OCR library is not loaded.": "OCR 라이브러리가 로드되지 않았습니다.",
      "OCR complete. No new text boxes detected.": "OCR 완료. 새로운 텍스트 박스가 감지되지 않았습니다.",
      "OCR failed. Try a smaller file or different OCR language.": "OCR 실패. 더 작은 파일이나 다른 OCR 언어를 시도하세요.",
      "Detecting text boxes...": "텍스트 박스를 감지하는 중...",
      "Edit Text ready. Double-click to edit, drag to move, arrow keys nudge, Delete removes text.":
        "텍스트 편집 준비 완료. 더블클릭으로 편집, 드래그로 이동, 방향키로 미세 이동, Delete로 삭제.",
      "Nothing selected.": "선택된 항목이 없습니다.",
      "Selection deleted.": "선택 항목이 삭제되었습니다.",
      "Select an object to duplicate.": "복제할 객체를 선택하세요.",
      "Detected text boxes cannot be duplicated.": "감지된 텍스트 박스는 복제할 수 없습니다.",
      "Duplicated selection.": "선택 항목을 복제했습니다.",
      "Page already clean.": "이 페이지에는 삭제할 편집 내용이 없습니다.",
      "Page cleared.": "페이지가 초기화되었습니다.",
      Undo: "실행 취소",
      Redo: "다시 실행",
      "Primary export failed. Running compatibility export...": "기본 내보내기에 실패해 호환 모드로 진행합니다...",
      "Open a PDF before splitting.": "분할 전에 PDF를 열어주세요.",
      "Add at least one split range.": "최소 1개 이상의 분할 범위를 추가하세요.",
      "Building edited PDF for split...": "분할용 편집 PDF를 생성하는 중...",
      "No valid split ranges.": "유효한 분할 범위가 없습니다.",
      "Split export complete.": "분할 내보내기가 완료되었습니다.",
      "Failed to split PDF.": "PDF 분할에 실패했습니다.",
      "Preparing export...": "내보내기 준비 중...",
      "Export complete.": "내보내기가 완료되었습니다.",
      "Failed to export PDF.": "PDF 내보내기에 실패했습니다.",
      "No editable text selected.": "선택된 편집 텍스트가 없습니다.",
      "Preview: Before": "미리보기: 편집 전",
      "Preview: After": "미리보기: 편집 후",
      "Please choose a PDF file.": "PDF 파일을 선택해주세요.",
      "Reading PDF...": "PDF를 읽는 중...",
      "Could not open this PDF.": "이 PDF를 열 수 없습니다.",
      "Please drop a valid PDF file.": "유효한 PDF 파일을 드롭해주세요.",
      "Ready. Open a PDF to start editing.": "준비 완료. PDF를 열어 편집을 시작하세요.",
    };
    if (exactMap[raw]) {
      return exactMap[raw];
    }

    let match = raw.match(/^Zoom (\d+)%$/);
    if (match) {
      return `줌 ${match[1]}%`;
    }
    match = raw.match(/^Fit width (\d+)%$/);
    if (match) {
      return `가로 맞춤 ${match[1]}%`;
    }
    match = raw.match(/^Added split range (\d+)–(\d+)\.$/);
    if (match) {
      return `분할 범위 ${match[1]}–${match[2]} 추가됨.`;
    }
    match = raw.match(/^Edit Text scan (\d+)\/(\d+)$/);
    if (match) {
      return `텍스트 감지 ${match[1]}/${match[2]}`;
    }
    match = raw.match(/^OCR (\d+)\/(\d+): (\d+)%$/);
    if (match) {
      return `OCR ${match[1]}/${match[2]}: ${match[3]}%`;
    }
    match = raw.match(/^OCR scanning page (\d+)\/(\d+)$/);
    if (match) {
      return `OCR 페이지 스캔 ${match[1]}/${match[2]}`;
    }
    match = raw.match(/^OCR complete\. Added (\d+) editable text boxes\.$/);
    if (match) {
      return `OCR 완료. 편집 가능한 텍스트 박스 ${match[1]}개를 추가했습니다.`;
    }
    match = raw.match(/^Tool: (.+)$/);
    if (match) {
      const toolName = String(match[1] || "");
      const translatedTool = t(`tool_name_${toolName}`) || toolName;
      return `도구: ${translatedTool}`;
    }
    match = raw.match(/^Split export complete \((\d+) files\)\.$/);
    if (match) {
      return `분할 내보내기 완료 (${match[1]}개 파일).`;
    }
    match = raw.match(/^Exporting page (\d+)\/(\d+)\.\.\.$/);
    if (match) {
      return `페이지 내보내는 중 ${match[1]}/${match[2]}...`;
    }
    match = raw.match(/^Viewing page (\d+)$/);
    if (match) {
      return `페이지 ${match[1]} 보는 중`;
    }
    match = raw.match(/^Rendering page (\d+)\/(\d+)\.\.\.$/);
    if (match) {
      return `페이지 렌더링 중 ${match[1]}/${match[2]}...`;
    }
    match = raw.match(/^Loaded (\d+) pages\.$/);
    if (match) {
      return `${match[1]}페이지를 불러왔습니다.`;
    }
    match = raw.match(/^Moved (\d+) text boxes?\.$/);
    if (match) {
      return `텍스트 박스 ${match[1]}개 이동됨.`;
    }
    match = raw.match(/^Auto-matched (\d+) text boxes?\.$/);
    if (match) {
      return `텍스트 박스 ${match[1]}개 자동 보정 완료.`;
    }
    return raw;
  }

  function setStatus(message, isError) {
    state.lastStatusRaw = String(message || "");
    state.lastStatusIsError = Boolean(isError);
    ui.statusLine.textContent = translateStatusMessage(state.lastStatusRaw);
    ui.statusLine.style.color = isError ? "#c62828" : "";
  }

  function normalizeFileName(fileName) {
    const clean = fileName.replace(/\.pdf$/i, "").trim();
    return clean || "edited-document";
  }

  function getCurrentEntry() {
    return state.pageEntries[state.currentPageIndex] || null;
  }

  function getNormalizedZoomPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 100;
    }
    return Math.round(clamp(parsed, 50, 200));
  }

  function updateZoomControls() {
    if (!ui.zoomRangeInput || !ui.zoomValueLabel) {
      return;
    }
    const hasPages = state.pageEntries.length > 0;
    const percent = getNormalizedZoomPercent(Number(state.pageZoom || 1) * 100);
    ui.zoomRangeInput.disabled = !hasPages;
    ui.zoomRangeInput.value = String(percent);
    ui.zoomValueLabel.textContent = `${percent}%`;
    if (ui.zoomOutBtn) {
      ui.zoomOutBtn.disabled = !hasPages || percent <= 50;
    }
    if (ui.zoomInBtn) {
      ui.zoomInBtn.disabled = !hasPages || percent >= 200;
    }
    if (ui.zoomResetBtn) {
      ui.zoomResetBtn.disabled = !hasPages;
    }
    if (ui.zoomFitBtn) {
      ui.zoomFitBtn.disabled = !hasPages;
    }
  }

  function applyZoomToEntry(entry) {
    if (!entry || !entry.wrapper || !entry.viewport) {
      return;
    }
    const zoom = clamp(Number(state.pageZoom || 1), 0.5, 2);
    const width = Math.max(Math.round(Number(entry.viewport.width || 0) * zoom), 1);
    const height = Math.max(Math.round(Number(entry.viewport.height || 0) * zoom), 1);
    entry.wrapper.style.width = `${width}px`;
    entry.wrapper.style.height = `${height}px`;
    if (entry.fabric && typeof entry.fabric.calcOffset === "function") {
      entry.fabric.calcOffset();
    }
  }

  function applyZoomToAllPages() {
    state.pageEntries.forEach((entry) => {
      applyZoomToEntry(entry);
      if (entry.fabric) {
        entry.fabric.requestRenderAll();
      }
    });
    updateZoomControls();
  }

  function setPageZoomFromPercent(percent, silent) {
    const normalizedPercent = getNormalizedZoomPercent(percent);
    const nextZoom = normalizedPercent / 100;
    if (Math.abs(nextZoom - Number(state.pageZoom || 1)) < 0.0001) {
      updateZoomControls();
      return;
    }
    closeAllInlineEditors(true);
    state.pageZoom = nextZoom;
    applyZoomToAllPages();
    if (!silent) {
      setStatus(`Zoom ${normalizedPercent}%`);
    }
  }

  function nudgePageZoom(stepDelta) {
    const currentPercent = getNormalizedZoomPercent(Number(state.pageZoom || 1) * 100);
    const nextPercent = getNormalizedZoomPercent(currentPercent + Number(stepDelta || 0) * 5);
    setPageZoomFromPercent(nextPercent, false);
  }

  function fitPageToViewportWidth() {
    const entry = getCurrentEntry();
    if (!entry || !entry.viewport || !ui.stageScroller) {
      return;
    }
    const scrollerWidth = Number(ui.stageScroller.clientWidth || 0);
    const pageWidth = Number(entry.viewport.width || 0);
    if (scrollerWidth <= 0 || pageWidth <= 0) {
      return;
    }
    const estimatedPadding = 34;
    const usableWidth = Math.max(scrollerWidth - estimatedPadding, 80);
    let percent = (usableWidth / pageWidth) * 100;
    percent = clamp(percent, 50, 200);
    percent = Math.round(percent / 5) * 5;
    setPageZoomFromPercent(percent, false);
    setStatus(`Fit width ${getNormalizedZoomPercent(percent)}%`);
  }

  function isInputFocused(eventTarget) {
    if (!eventTarget) {
      return false;
    }
    const tag = eventTarget.tagName ? eventTarget.tagName.toLowerCase() : "";
    return (
      tag === "input" ||
      tag === "textarea" ||
      eventTarget.isContentEditable === true
    );
  }

  function hexToRgb(hex) {
    const cleaned = hex.replace("#", "");
    const full =
      cleaned.length === 3
        ? cleaned
            .split("")
            .map((char) => char + char)
            .join("")
        : cleaned;
    const value = Number.parseInt(full, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function colorWithOpacity(hex, opacity) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  }

  function getFillStyle() {
    return colorWithOpacity(state.fillColor, state.fillOpacity);
  }

  function measureSingleLineTextWidth(text, fontFamily, fontSize, fontWeight, fontStyle) {
    const value = String(text || "");
    if (!value) {
      return 0;
    }
    if (!textMeasureContext) {
      return value.length * Math.max(Number(fontSize || 12), 8) * 0.52;
    }
    const safeFontSize = Math.max(Number(fontSize || 12), 1);
    textMeasureContext.font = `${String(fontStyle || "normal")} ${String(
      fontWeight || "400",
    )} ${safeFontSize}px ${String(fontFamily || "Arial, sans-serif")}`;
    return Number(textMeasureContext.measureText(value).width || 0);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function deriveFontScaleX(text, fontFamily, fontSize, fontWeight, fontStyle, targetWidth) {
    const measured = measureSingleLineTextWidth(
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
    );
    if (!measured || !Number.isFinite(measured) || measured <= 0) {
      return 1;
    }
    const wantedWidth = Math.max(Number(targetWidth || 0), 2);
    // Keep a wider range so original glyph width can be matched more closely.
    return clamp(wantedWidth / measured, 0.58, 1.9);
  }

  function getEffectiveTextScaleX(group, useEditedScale) {
    const baseScale = clamp(Number(group && group.fontScaleX ? group.fontScaleX : 1), 0.5, 2.2);
    if (!useEditedScale) {
      return baseScale;
    }
    // Keep original horizontal glyph metric for seamless text replacement.
    return baseScale;
  }

  function getEditableGroupBaseDimension(group, mask, axis) {
    const key = axis === "height" ? "baseHeight" : "baseWidth";
    const fallback = Math.max(getScaledObjectDimension(mask, axis), axis === "height" ? 10 : 6);
    const value = Number(group && typeof group[key] === "number" ? group[key] : 0);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }
    return value;
  }

  function restoreEditableGroupBaseSize(group) {
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }
    const { mask } = nodes;
    mask.set({
      width: getEditableGroupBaseDimension(group, mask, "width"),
      height: getEditableGroupBaseDimension(group, mask, "height"),
      scaleX: 1,
      scaleY: 1,
    });
    mask.setCoords();
    group.setCoords();
  }

  function resizeEditableGroupMaskToText(group, textValue) {
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }
    const { mask } = nodes;
    const padX = Number(group.paddingX ?? 2);
    const padY = Number(group.paddingY ?? 1);
    const hasText = String(textValue || "").trim().length > 0;
    const baseWidth = getEditableGroupBaseDimension(group, mask, "width");
    const baseHeight = getEditableGroupBaseDimension(group, mask, "height");
    const fontFamily = group.editFontFamily || group.originalFontFamily || state.fontFamily;
    const fontSize = Math.max(
      Number(group.editFontSize || group.originalFontSize || state.fontSize),
      8,
    );
    const fontWeight = group.editFontWeight || group.originalFontWeight || "400";
    const fontStyle = group.editFontStyle || group.originalFontStyle || "normal";
    const inkOffsetX = Number(group.originalInkOffsetX || 0);
    const textScaleX = getEffectiveTextScaleX(
      group,
      Boolean(group && (group.hasTextEdit || group.editingActive)),
    );

    if (!hasText) {
      mask.set({
        width: baseWidth,
        height: baseHeight,
        scaleX: 1,
        scaleY: 1,
      });
      mask.setCoords();
      group.setCoords();
      return;
    }

    const measuredWidth =
      measureSingleLineTextWidth(textValue, fontFamily, fontSize, fontWeight, fontStyle) *
      textScaleX;
    const desiredWidth = Math.max(baseWidth, measuredWidth + padX * 2 + 4 + Math.max(inkOffsetX, 0));
    const desiredHeight = Math.max(baseHeight, fontSize * 1.2 + padY * 2);
    const canvasWidth =
      group && group.canvas && typeof group.canvas.getWidth === "function"
        ? Number(group.canvas.getWidth() || 0)
        : 0;
    const maxWidthByCanvas =
      canvasWidth > 1 ? Math.max(canvasWidth - Number(group.left || 0) - 2, 6) : desiredWidth;

    mask.set({
      width: clamp(desiredWidth, 6, maxWidthByCanvas),
      height: Math.max(desiredHeight, 10),
      scaleX: 1,
      scaleY: 1,
    });
    mask.setCoords();
    group.setCoords();
  }

  function sampleMaskFillColor(canvas, left, top, width, height) {
    if (!canvas) {
      return "#ffffff";
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "#ffffff";
    }

    const maxX = canvas.width - 1;
    const maxY = canvas.height - 1;
    const points = [
      [left + 1, top + 1],
      [left + width - 2, top + 1],
      [left + 1, top + height - 2],
      [left + width - 2, top + height - 2],
    ];

    let best = null;
    points.forEach((point) => {
      const x = Math.round(clamp(point[0], 0, maxX));
      const y = Math.round(clamp(point[1], 0, maxY));
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const alpha = Number(pixel[3] || 0);
      if (!alpha) {
        return;
      }
      const r = Number(pixel[0] || 255);
      const g = Number(pixel[1] || 255);
      const b = Number(pixel[2] || 255);
      const lightness = r + g + b;
      if (!best || lightness > best.lightness) {
        best = { r, g, b, lightness };
      }
    });

    if (!best) {
      return "#ffffff";
    }
    return `rgb(${best.r}, ${best.g}, ${best.b})`;
  }

  function sampleTextFillColor(canvas, left, top, width, height) {
    if (!canvas) {
      return DEFAULT_DETECTED_TEXT_COLOR;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return DEFAULT_DETECTED_TEXT_COLOR;
    }

    const maxX = canvas.width - 1;
    const maxY = canvas.height - 1;
    const stepX = Math.max(width / 4, 1);
    const stepY = Math.max(height / 3, 1);
    let best = null;

    for (let row = 0; row <= 3; row += 1) {
      for (let col = 0; col <= 4; col += 1) {
        const x = Math.round(clamp(left + col * stepX, 0, maxX));
        const y = Math.round(clamp(top + row * stepY, 0, maxY));
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const alpha = Number(pixel[3] || 0);
        if (!alpha) {
          continue;
        }
        const r = Number(pixel[0] || 0);
        const g = Number(pixel[1] || 0);
        const b = Number(pixel[2] || 0);
        const lightness = r + g + b;
        if (!best || lightness < best.lightness) {
          best = { r, g, b, lightness };
        }
      }
    }

    if (!best) {
      return DEFAULT_DETECTED_TEXT_COLOR;
    }
    const maxChannel = Math.max(best.r, best.g, best.b);
    const minChannel = Math.min(best.r, best.g, best.b);
    const saturationSpread = maxChannel - minChannel;
    const luminance = best.r * 0.2126 + best.g * 0.7152 + best.b * 0.0722;
    const lowContrastGray = saturationSpread < 44 && luminance > 118;
    const washedOutColor = saturationSpread > 78 && luminance > 170;
    if (luminance > 170 || lowContrastGray || washedOutColor || best.lightness > 640) {
      return DEFAULT_DETECTED_TEXT_COLOR;
    }
    return `rgb(${best.r}, ${best.g}, ${best.b})`;
  }

  function isEditableTextGroup(object) {
    return Boolean(object && object.isTextEditGroup);
  }

  function getEditableGroupNodes(group) {
    if (!isEditableTextGroup(group) || typeof group.item !== "function") {
      return null;
    }
    const mask = group.item(0);
    const text = group.item(1);
    if (!mask || !text) {
      return null;
    }
    return { mask, text };
  }

  function getScaledObjectDimension(object, axis) {
    if (!object) {
      return 0;
    }
    const size = axis === "height" ? Number(object.height || 0) : Number(object.width || 0);
    const scale =
      axis === "height" ? Number(object.scaleY || 1) : Number(object.scaleX || 1);
    return Math.max(size * scale, 0);
  }

  function getObjectTopLeftOnCanvas(object) {
    if (!object) {
      return { x: 0, y: 0 };
    }
    if (object.aCoords && object.aCoords.tl) {
      return {
        x: Number(object.aCoords.tl.x || 0),
        y: Number(object.aCoords.tl.y || 0),
      };
    }
    if (typeof object.getPointByOrigin !== "function") {
      return { x: 0, y: 0 };
    }
    const point = object.getPointByOrigin("left", "top");
    return {
      x: Number(point && typeof point.x === "number" ? point.x : 0),
      y: Number(point && typeof point.y === "number" ? point.y : 0),
    };
  }

  function normalizeEditorCommitText(value) {
    return String(value || "")
      .replace(/\r/g, "")
      .replace(/\s*\n+\s*/g, " ");
  }

  function getOriginalComparableText(group) {
    if (!isEditableTextGroup(group)) {
      return "";
    }
    if (typeof group.originalComparableText === "string") {
      return group.originalComparableText;
    }
    const normalized = normalizeEditorCommitText(group.originalText || "");
    group.originalComparableText = normalized;
    return normalized;
  }

  function isEditableGroupMoved(group) {
    if (!isEditableTextGroup(group)) {
      return false;
    }
    const groupedSelection =
      group.group && group.group.type === "activeSelection";
    const canvasPoint = groupedSelection ? getObjectTopLeftOnCanvas(group) : null;
    const left = Number(
      groupedSelection && canvasPoint && Number.isFinite(canvasPoint.x)
        ? canvasPoint.x
        : group.left || 0,
    );
    const top = Number(
      groupedSelection && canvasPoint && Number.isFinite(canvasPoint.y)
        ? canvasPoint.y
        : group.top || 0,
    );
    const baseLeft = Number(
      typeof group.baseLeft === "number" ? group.baseLeft : group.left || 0,
    );
    const baseTop = Number(
      typeof group.baseTop === "number" ? group.baseTop : group.top || 0,
    );
    return Math.abs(left - baseLeft) > 0.5 || Math.abs(top - baseTop) > 0.5;
  }

  function syncEditableTextGeometry(group) {
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }
    const { mask, text } = nodes;
    const padX = Number(group.paddingX ?? 2);
    const padY = Number(group.paddingY ?? 1);
    const edited = Boolean(group.hasTextEdit);
    const deleted = Boolean(group.isDeletedText);
    const hasLivePreview = group.editingActive && typeof group.livePreviewText === "string";
    const effectiveText = hasLivePreview
      ? group.livePreviewText
      : edited
        ? group.editedText || ""
        : group.originalText || "";
    const effectiveFontFamily = edited
      ? group.editFontFamily || group.originalFontFamily || state.fontFamily
      : group.originalFontFamily || state.fontFamily;
    const effectiveFontSize = edited
      ? Number(group.editFontSize || group.originalFontSize || state.fontSize)
      : Number(group.originalFontSize || state.fontSize);
    const effectiveFontWeight = edited
      ? group.editFontWeight || group.originalFontWeight || "400"
      : group.originalFontWeight || "400";
    const effectiveFontStyle = edited
      ? group.editFontStyle || group.originalFontStyle || "normal"
      : group.originalFontStyle || "normal";
    const effectiveCharSpacing = edited
      ? Number(
          typeof group.editCharSpacing === "number"
            ? group.editCharSpacing
            : group.originalCharSpacing || 0,
        )
      : Number(group.originalCharSpacing || 0);
    if (edited && !deleted && !hasLivePreview) {
      resizeEditableGroupMaskToText(group, effectiveText);
    } else if (!edited || deleted) {
      restoreEditableGroupBaseSize(group);
    }
    const maskLeft = Number(mask.left || 0);
    const maskTop = Number(mask.top || 0);
    const maskWidth = Math.max(getScaledObjectDimension(mask, "width"), 6);
    const textWidth = Math.max(maskWidth - padX * 2, 4);
    const textScaleX = getEffectiveTextScaleX(group, edited || hasLivePreview);
    const renderFontSize = Math.max(effectiveFontSize, 8);
    const inkOffsetX = Number(group.originalInkOffsetX || 0);
    const inkOffsetY = Number(group.originalInkOffsetY || 0);

    text.set({
      text: deleted ? "" : effectiveText,
      left: maskLeft + padX + inkOffsetX,
      top: maskTop + padY + inkOffsetY,
      originX: "left",
      originY: "top",
      textAlign: "left",
      scaleX: textScaleX,
      scaleY: 1,
      fontFamily: effectiveFontFamily,
      fontSize: renderFontSize,
      fontWeight: effectiveFontWeight,
      fontStyle: effectiveFontStyle,
      charSpacing: effectiveCharSpacing,
      lineHeight: 1,
      splitByGrapheme: false,
      fill: group.textFillColor || state.textColor,
    });
    mask.set({
      originX: "left",
      originY: "top",
    });
    mask.setCoords();
    text.setCoords();
    group.setCoords();
  }

  function recalibrateEditableGroupTypography(group) {
    if (!isEditableTextGroup(group)) {
      return;
    }
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }
    const { mask } = nodes;
    const padX = Number(group.paddingX ?? 2);
    const sampleText = group.originalText || group.editedText || "";
    if (!sampleText.trim()) {
      return;
    }
    const fontFamily = group.originalFontFamily || state.fontFamily;
    const fontSize = Number(group.originalFontSize || state.fontSize);
    const fontWeight = group.originalFontWeight || "400";
    const fontStyle = group.originalFontStyle || "normal";
    const targetWidth = Math.max(getScaledObjectDimension(mask, "width") - padX * 2, 4);
    const derivedScale = deriveFontScaleX(
      sampleText,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      targetWidth,
    );
    if (!Number.isFinite(Number(group.originalFontScaleX))) {
      group.originalFontScaleX = derivedScale;
    }
    group.fontScaleX = clamp(
      Number(group.originalFontScaleX || derivedScale || 1),
      0.5,
      2.2,
    );
  }

  function applyEditableVisualState(group, inEditMode) {
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }

    const { mask, text } = nodes;
    const edited = Boolean(group.hasTextEdit);
    const deleted = Boolean(group.isDeletedText);
    const moved = isEditableGroupMoved(group);
    const changed = edited || moved;
    const editingActive = Boolean(group.editingActive);
    const showTextNode = !deleted && (edited || moved || editingActive);
    syncEditableTextGeometry(group);

    if (editingActive) {
      group.visible = true;
      mask.set({
        stroke: "#1f74e8",
        strokeWidth: 1,
        strokeDashArray: [6, 4],
        fill: group.maskFillColor || "#ffffff",
      });
      text.set({
        visible: !deleted,
      });
      group.dirty = true;
      return;
    }

    if (inEditMode) {
      group.visible = true;
      mask.set({
        stroke: "#1f74e8",
        strokeWidth: 1,
        strokeDashArray: [6, 4],
        fill: edited
          ? group.maskFillColor || "#ffffff"
          : moved
            ? "transparent"
          : "rgba(115, 171, 255, 0.18)",
      });
      text.set({
        visible: showTextNode,
      });
    } else if (changed) {
      group.visible = true;
      mask.set({
        stroke: "transparent",
        strokeWidth: 0,
        strokeDashArray: null,
        fill: edited ? group.maskFillColor || "#ffffff" : "transparent",
      });
      text.set({
        visible: showTextNode,
      });
    } else {
      group.visible = false;
    }
    group.dirty = true;
  }

  function syncMovedOriginMasksForEntry(entry) {
    if (!entry || !entry.fabric) {
      return;
    }

    const staleMasks = entry.fabric
      .getObjects()
      .filter(
        (object) =>
          Boolean(object && (object.isMoveOriginMask || object.isMoveTextSnapshot)),
      );
    if (staleMasks.length) {
      entry.isRestoring = true;
      staleMasks.forEach((maskObject) => {
        entry.fabric.remove(maskObject);
      });
      entry.isRestoring = false;
    }

    const movedGroups = entry.fabric
      .getObjects()
      .filter((object) => isEditableTextGroup(object) && isEditableGroupMoved(object));
    if (!movedGroups.length) {
      return;
    }

    entry.isRestoring = true;
    movedGroups.forEach((group) => {
      const nodes = getEditableGroupNodes(group);
      if (!nodes) {
        return;
      }
      const { mask } = nodes;
      const maskWidth = getEditableGroupBaseDimension(group, mask, "width");
      const maskHeight = getEditableGroupBaseDimension(group, mask, "height");
      const baseLeft = Number(
        typeof group.baseLeft === "number" ? group.baseLeft : group.left || 0,
      );
      const baseTop = Number(
        typeof group.baseTop === "number" ? group.baseTop : group.top || 0,
      );

      const originMask = new fabricLib.Rect({
        left: baseLeft,
        top: baseTop,
        originX: "left",
        originY: "top",
        width: maskWidth,
        height: maskHeight,
        fill: group.maskFillColor || "#ffffff",
        stroke: "transparent",
        strokeWidth: 0,
        selectable: false,
        evented: false,
        objectCaching: false,
        excludeFromExport: true,
      });
      originMask.set({
        isHelper: true,
        isMoveOriginMask: true,
      });
      entry.fabric.add(originMask);
      entry.fabric.sendToBack(originMask);
    });
    entry.isRestoring = false;
  }

  function refreshEditableVisualsForEntry(entry) {
    const inEditMode = state.tool === "editText";
    entry.fabric.forEachObject((object) => {
      if (isEditableTextGroup(object)) {
        applyEditableVisualState(object, inEditMode);
      }
    });
    syncMovedOriginMasksForEntry(entry);
  }

  function updateEntryFlagsFromObjects(entry) {
    const objects = entry.fabric.getObjects();
    entry.pdfTextReady = objects.some(
      (object) => isEditableTextGroup(object) && object.textSource === "pdf",
    );
    entry.ocrReady = objects.some(
      (object) => isEditableTextGroup(object) && object.textSource === "ocr",
    );
    if (!entry.ocrReady) {
      entry.ocrLanguages = {};
    }
  }

  function clearWorkspace() {
    closeAllInlineEditors(true);
    state.pageEntries.forEach((entry) => {
      entry.fabric.dispose();
    });
    state.pageEntries = [];
    state.currentPageIndex = 0;
    state.originalPdfBytes = null;
    state.pdfDoc = null;
    state.isPreparingTextBoxes = false;
    state.isRunningOcr = false;
    state.splitRanges = [];
    state.beforePreview = false;
    state.pageZoom = 1;

    ui.pageStage.innerHTML = "";
    ui.thumbnailList.innerHTML = "";
    ui.pageCountLabel.textContent = t("no_file_loaded");
    ui.pagePositionLabel.textContent = t("page_zero");
    ui.dropHint.classList.remove("hidden");
    if (ui.beforeAfterBtn) {
      ui.beforeAfterBtn.textContent = t("preview_before");
    }
    if (ui.vectorTextExportInput) {
      ui.vectorTextExportInput.checked = Boolean(state.vectorTextExport);
    }

    updateActionButtons();
    updatePageButtons();
    updateUndoRedoButtons();
    syncSplitInputBounds();
    renderSplitRanges();
    updateZoomControls();
    setLetterSpacingUiValue(0);
    updateFontInspector();
  }

  function updateActionButtons() {
    const hasPages = state.pageEntries.length > 0;
    ui.exportBtn.disabled = !hasPages;
    ui.ocrBtn.disabled = !hasPages || state.isRunningOcr;
    ui.clearPageBtn.disabled = !hasPages;
    if (ui.beforeAfterBtn) {
      ui.beforeAfterBtn.disabled = !hasPages;
    }
    if (ui.vectorTextExportInput) {
      ui.vectorTextExportInput.disabled = !hasPages;
    }
    if (ui.autoMatchTextBtn) {
      ui.autoMatchTextBtn.disabled = !hasPages;
    }
    if (ui.addSplitRangeBtn) {
      ui.addSplitRangeBtn.disabled = !hasPages;
    }
    if (ui.clearSplitRangesBtn) {
      ui.clearSplitRangesBtn.disabled = !state.splitRanges.length;
    }
    if (ui.splitPdfBtn) {
      ui.splitPdfBtn.disabled = !hasPages || !state.splitRanges.length;
    }
    updateZoomControls();
  }

  function getTotalPageCount() {
    return Number(state.pageEntries.length || 0);
  }

  function sanitizeSplitRange(fromValue, toValue, totalPages) {
    if (!totalPages) {
      return null;
    }
    let from = Number.parseInt(fromValue, 10);
    let to = Number.parseInt(toValue, 10);
    if (!Number.isFinite(from)) {
      from = 1;
    }
    if (!Number.isFinite(to)) {
      to = totalPages;
    }
    from = clamp(from, 1, totalPages);
    to = clamp(to, 1, totalPages);
    if (from > to) {
      const swapped = from;
      from = to;
      to = swapped;
    }
    return { from, to };
  }

  function clampSplitInputValue(input, totalPages, fallback) {
    if (!input) {
      return;
    }
    const parsed = Number.parseInt(input.value, 10);
    const safeFallback = Number.isFinite(fallback) ? fallback : 1;
    let nextValue = Number.isFinite(parsed) ? parsed : safeFallback;
    nextValue = clamp(nextValue, 1, Math.max(totalPages, 1));
    input.value = String(nextValue);
  }

  function syncSplitInputBounds() {
    if (!ui.splitFromInput || !ui.splitToInput) {
      return;
    }
    const totalPages = getTotalPageCount();
    const maxValue = Math.max(totalPages, 1);
    ui.splitFromInput.min = "1";
    ui.splitToInput.min = "1";
    ui.splitFromInput.max = String(maxValue);
    ui.splitToInput.max = String(maxValue);
    clampSplitInputValue(ui.splitFromInput, maxValue, 1);
    clampSplitInputValue(ui.splitToInput, maxValue, maxValue);
  }

  function renderSplitRanges() {
    if (!ui.splitRangeList) {
      return;
    }
    ui.splitRangeList.innerHTML = "";
    if (!state.splitRanges.length) {
      const empty = document.createElement("div");
      empty.className = "split-range-item";
      empty.textContent = t("split_no_ranges");
      ui.splitRangeList.appendChild(empty);
      updateActionButtons();
      return;
    }
    state.splitRanges.forEach((range, index) => {
      const row = document.createElement("div");
      row.className = "split-range-item";
      const label = document.createElement("span");
      label.textContent = t("split_range_row", {
        index: index + 1,
        from: range.from,
        to: range.to,
      });
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = t("split_remove");
      removeBtn.addEventListener("click", () => {
        state.splitRanges = state.splitRanges.filter((_, rangeIndex) => rangeIndex !== index);
        renderSplitRanges();
      });
      row.appendChild(label);
      row.appendChild(removeBtn);
      ui.splitRangeList.appendChild(row);
    });
    updateActionButtons();
  }

  function addSplitRange() {
    const totalPages = getTotalPageCount();
    if (!totalPages) {
      setStatus("Open a PDF before adding split ranges.", true);
      return;
    }
    const range = sanitizeSplitRange(
      ui.splitFromInput ? ui.splitFromInput.value : 1,
      ui.splitToInput ? ui.splitToInput.value : totalPages,
      totalPages,
    );
    if (!range) {
      setStatus("Invalid page range.", true);
      return;
    }
    const duplicate = state.splitRanges.some(
      (existing) => existing.from === range.from && existing.to === range.to,
    );
    if (duplicate) {
      setStatus("That range already exists.");
      return;
    }
    state.splitRanges.push(range);
    renderSplitRanges();
    setStatus(`Added split range ${range.from}–${range.to}.`);
  }

  function clearSplitRanges() {
    state.splitRanges = [];
    renderSplitRanges();
    setStatus("Split ranges cleared.");
  }

  function focusSplitPanelSection() {
    if (!ui.splitPanelSection) {
      return;
    }
    ui.splitPanelSection.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
    ui.splitPanelSection.classList.remove("flash-highlight");
    void ui.splitPanelSection.offsetWidth;
    ui.splitPanelSection.classList.add("flash-highlight");
  }

  function getActiveSelectionObjects(entry) {
    if (!entry || !entry.fabric) {
      return [];
    }
    const active = entry.fabric.getActiveObject();
    if (!active) {
      return [];
    }
    if (active.type === "activeSelection" && typeof active.getObjects === "function") {
      return active.getObjects().slice();
    }
    return [active];
  }

  function getSelectedEditableGroups(entry) {
    return getActiveSelectionObjects(entry).filter((object) => isEditableTextGroup(object));
  }

  function formatLetterSpacingValue(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return `${Math.round(numeric)}`;
  }

  function setLetterSpacingUiValue(nextValue) {
    const numeric = clamp(Number(nextValue || 0), -120, 320);
    state.letterSpacing = numeric;
    if (ui.letterSpacingInput) {
      ui.letterSpacingInput.value = String(Math.round(numeric));
    }
    if (ui.letterSpacingValue) {
      ui.letterSpacingValue.textContent = formatLetterSpacingValue(numeric);
    }
  }

  function updateFontInspector() {
    if (
      !ui.fontInspectorOriginalValue ||
      !ui.fontInspectorExportValue ||
      !ui.fontInspectorNote
    ) {
      return;
    }
    const entry = getCurrentEntry();
    const selected = getSelectedEditableGroups(entry);
    const target = selected.length ? selected[0] : null;
    if (!target) {
      ui.fontInspectorOriginalValue.textContent = "-";
      ui.fontInspectorExportValue.textContent = "-";
      ui.fontInspectorNote.textContent = t("font_inspector_unavailable");
      return;
    }
    const originalFamily = String(target.originalFontFamily || "Unknown");
    const originalWeight = String(target.originalFontWeight || "400");
    const originalStyle = String(target.originalFontStyle || "normal");
    const originalSize = Number(target.originalFontSize || 0);
    const exportFamily = target.hasTextEdit
      ? target.editFontFamily || originalFamily
      : originalFamily;
    const exportWeight = target.hasTextEdit
      ? target.editFontWeight || originalWeight
      : originalWeight;
    const exportStyle = target.hasTextEdit
      ? target.editFontStyle || originalStyle
      : originalStyle;
    const primaryFamily = getPrimaryFontFamilyCandidate(exportFamily);
    const hasCustomEmbedCandidate = Boolean(
      pdfLibFontkit && primaryFamily && findFontFaceSourceUrl(primaryFamily),
    );
    const descriptor = hasCustomEmbedCandidate
      ? {
          label: primaryFamily,
          fallbackUsed: false,
          customEmbedded: true,
        }
      : resolveStandardFontDescriptor(exportFamily, exportWeight, exportStyle);

    ui.fontInspectorOriginalValue.textContent = `${originalFamily} ${Math.round(
      Math.max(originalSize, 0),
    )}px`;
    ui.fontInspectorExportValue.textContent = descriptor.label;
    ui.fontInspectorNote.textContent = descriptor.fallbackUsed
      ? t("font_inspector_fallback", { font: descriptor.label })
      : t("font_inspector_embedded", { font: descriptor.label });
  }

  function syncPropertyPanelFromSelection() {
    const entry = getCurrentEntry();
    const selected = getSelectedEditableGroups(entry);
    if (!selected.length) {
      setLetterSpacingUiValue(0);
      updateFontInspector();
      return;
    }
    const first = selected[0];
    const spacing = first.hasTextEdit
      ? Number(
          typeof first.editCharSpacing === "number"
            ? first.editCharSpacing
            : first.originalCharSpacing || 0,
        )
      : Number(first.originalCharSpacing || 0);
    setLetterSpacingUiValue(spacing);
    updateFontInspector();
  }

  function applyLetterSpacingToSelection(rawValue) {
    const entry = getCurrentEntry();
    if (!entry || !entry.fabric) {
      return;
    }
    const selected = getSelectedEditableGroups(entry);
    const nextSpacing = clamp(Number(rawValue || 0), -120, 320);
    setLetterSpacingUiValue(nextSpacing);
    if (!selected.length) {
      return;
    }

    selected.forEach((group) => {
      group.editCharSpacing = nextSpacing;
      if (!group.editFontFamily) {
        group.editFontFamily = group.originalFontFamily || state.fontFamily;
      }
      if (!group.editFontSize) {
        group.editFontSize = group.originalFontSize || state.fontSize;
      }
      if (!group.editFontWeight) {
        group.editFontWeight = group.originalFontWeight || "400";
      }
      if (!group.editFontStyle) {
        group.editFontStyle = group.originalFontStyle || "normal";
      }
      if (!group.editedText && !group.isDeletedText) {
        group.editedText = group.originalText || "";
      }
      refreshEditableGroupChangedState(group);
      if (group.hasTextEdit && !group.isDeletedText) {
        resizeEditableGroupMaskToText(group, group.editedText || group.originalText || "");
      } else {
        restoreEditableGroupBaseSize(group);
      }
      syncEditableTextGeometry(group);
      applyEditableVisualState(group, state.tool === "editText");
      group.setCoords();
    });
    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
    updateFontInspector();
  }

  function getGroupTopLeft(group) {
    const point = getObjectTopLeftOnCanvas(group);
    return {
      left: Number(point.x || group.left || 0),
      top: Number(point.y || group.top || 0),
    };
  }

  function snapSelectionToBaseline() {
    const entry = getCurrentEntry();
    if (!entry || !entry.fabric || state.tool !== "editText") {
      return;
    }
    const selected = getSelectedEditableGroups(entry);
    if (!selected.length) {
      setStatus("No editable text selected.", true);
      return;
    }

    const refs = entry.fabric
      .getObjects()
      .filter((object) => isEditableTextGroup(object) && !object.isDeletedText);
    if (!refs.length) {
      setStatus("No editable text selected.", true);
      return;
    }

    let movedCount = 0;
    selected.forEach((target) => {
      const targetPos = getGroupTopLeft(target);
      const targetFontSize = Number(
        target.hasTextEdit ? target.editFontSize || target.originalFontSize : target.originalFontSize,
      );
      const targetAscent = clamp(Number(target.originalAscent || 0.82), 0.5, 0.95);
      const targetBaseline = targetPos.top + targetFontSize * targetAscent;

      let best = null;
      refs.forEach((ref) => {
        if (ref === target) {
          return;
        }
        const refPos = getGroupTopLeft(ref);
        const refFontSize = Number(
          ref.hasTextEdit ? ref.editFontSize || ref.originalFontSize : ref.originalFontSize,
        );
        const refAscent = clamp(Number(ref.originalAscent || 0.82), 0.5, 0.95);
        const refBaseline = refPos.top + refFontSize * refAscent;
        const score = Math.abs(refBaseline - targetBaseline) + Math.abs(refPos.top - targetPos.top) * 0.1;
        if (!best || score < best.score) {
          best = { baseline: refBaseline, score };
        }
      });

      const baseline = best
        ? best.baseline
        : Number(target.baseTop || targetPos.top) + targetFontSize * targetAscent;
      const nextTop = baseline - targetFontSize * targetAscent;
      if (Math.abs(nextTop - Number(target.top || 0)) > 0.3) {
        target.set({ top: nextTop });
        target.setCoords();
        movedCount += 1;
      }
    });

    if (!movedCount) {
      setStatus("Nothing selected.", true);
      return;
    }
    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
    setStatus(`Moved ${movedCount} text boxes.`);
  }

  function autoMatchAllEditableText() {
    if (!state.pageEntries.length) {
      setStatus("Open a PDF first.", true);
      return;
    }
    let touched = 0;
    state.pageEntries.forEach((entry) => {
      const groups = entry.fabric.getObjects().filter((object) => isEditableTextGroup(object));
      if (!groups.length) {
        return;
      }
      let entryTouched = 0;
      groups.forEach((group) => {
        group.editFontFamily = group.originalFontFamily;
        group.editFontSize = group.originalFontSize;
        group.editFontWeight = group.originalFontWeight;
        group.editFontStyle = group.originalFontStyle;
        group.editCharSpacing = Number(group.originalCharSpacing || 0);
        group.fontScaleX = clamp(
          Number(group.originalFontScaleX || group.fontScaleX || 1),
          0.5,
          2.2,
        );
        refreshEditableGroupChangedState(group);
        if (group.hasTextEdit && !group.isDeletedText) {
          resizeEditableGroupMaskToText(group, group.editedText || group.originalText || "");
        } else {
          restoreEditableGroupBaseSize(group);
        }
        syncEditableTextGeometry(group);
        applyEditableVisualState(group, state.tool === "editText");
        touched += 1;
        entryTouched += 1;
      });
      if (entryTouched) {
        saveHistory(entry);
      }
      entry.fabric.requestRenderAll();
    });
    if (!touched) {
      setStatus("No embedded text found. Use OCR for scanned PDFs.", true);
      return;
    }
    syncPropertyPanelFromSelection();
    setStatus(`Auto-matched ${touched} text boxes.`);
  }

  function applyBeforePreviewToEntry(entry) {
    if (!entry || !entry.fabric) {
      return;
    }
    if (!state.beforePreview) {
      entry.fabric.getObjects().forEach((object) => {
        if (Object.prototype.hasOwnProperty.call(object, "__beforeVisibleCache")) {
          object.visible = Boolean(object.__beforeVisibleCache);
          delete object.__beforeVisibleCache;
        }
      });
      applyToolMode(entry.fabric);
      refreshEditableVisualsForEntry(entry);
      entry.fabric.requestRenderAll();
      return;
    }
    entry.fabric.getObjects().forEach((object) => {
      if (!Object.prototype.hasOwnProperty.call(object, "__beforeVisibleCache")) {
        object.__beforeVisibleCache = Boolean(object.visible);
      }
      if (!object.isHelper) {
        object.visible = false;
      }
    });
    entry.fabric.requestRenderAll();
  }

  function setBeforePreview(enabled) {
    const shouldEnable = Boolean(enabled);
    if (state.beforePreview === shouldEnable) {
      return;
    }
    if (shouldEnable) {
      closeAllInlineEditors(true);
    }
    state.beforePreview = shouldEnable;
    state.pageEntries.forEach((entry) => {
      applyBeforePreviewToEntry(entry);
    });
    if (ui.beforeAfterBtn) {
      ui.beforeAfterBtn.textContent = state.beforePreview
        ? t("preview_after")
        : t("preview_before");
    }
    if (state.beforePreview) {
      setStatus("Preview: Before");
    } else {
      setStatus("Preview: After");
    }
  }

  async function determineAutoRenderScale(pdfDocument) {
    if (!pdfDocument || typeof pdfDocument.getPage !== "function") {
      return state.renderScale;
    }
    const stageWidth = Number(
      ui.stageScroller && ui.stageScroller.clientWidth ? ui.stageScroller.clientWidth : 0,
    );
    if (!stageWidth) {
      return state.renderScale;
    }
    const firstPage = await pdfDocument.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const usableWidth = Math.max(stageWidth - 40, 320);
    const fitScale = usableWidth / Math.max(Number(baseViewport.width || 1), 1);
    return clamp(fitScale, 0.6, 1.6);
  }

  function updatePageButtons() {
    const total = state.pageEntries.length;
    const hasPages = total > 0;
    ui.prevPageBtn.disabled = !hasPages || state.currentPageIndex === 0;
    ui.nextPageBtn.disabled = !hasPages || state.currentPageIndex === total - 1;
  }

  function updatePagePositionLabel() {
    const total = state.pageEntries.length;
    if (!total) {
      ui.pagePositionLabel.textContent = t("page_zero");
      return;
    }
    ui.pagePositionLabel.textContent = t("page_position", {
      current: state.currentPageIndex + 1,
      total,
    });
  }

  function updateThumbnailLabels() {
    const labels = Array.from(ui.thumbnailList.querySelectorAll(".thumb-label"));
    labels.forEach((label, index) => {
      label.textContent = t("thumb_page", { index: index + 1 });
    });
  }

  function applyLanguageUI() {
    document.documentElement.lang = state.uiLanguage === "ko" ? "ko" : "en";
    if (ui.langToggleBtn) {
      ui.langToggleBtn.dataset.lang = state.uiLanguage;
      ui.langToggleBtn.title = t("lang_button_title");
      ui.langToggleBtn.setAttribute("aria-label", t("lang_button_title"));
    }

    if (ui.brandTitle) {
      ui.brandTitle.textContent = t("brand_title");
    }
    if (ui.brandSubtitle) {
      ui.brandSubtitle.textContent = t("brand_subtitle");
    }
    if (ui.ocrOptEng) {
      ui.ocrOptEng.textContent = t("ocr_opt_eng");
    }
    if (ui.ocrOptKor) {
      ui.ocrOptKor.textContent = t("ocr_opt_kor");
    }
    if (ui.ocrOptEngKor) {
      ui.ocrOptEngKor.textContent = t("ocr_opt_eng_kor");
    }
    if (ui.ocrBtn) {
      ui.ocrBtn.textContent = t("ocr_button");
    }
    if (ui.fileLabel) {
      ui.fileLabel.textContent = t("open_pdf");
    }
    if (ui.exportBtn) {
      ui.exportBtn.textContent = t("export_pdf");
    }
    if (ui.pagesHeading) {
      ui.pagesHeading.textContent = t("pages_heading");
    }
    if (ui.toolSelectBtn) {
      ui.toolSelectBtn.textContent = t("tool_select");
      ui.toolSelectBtn.title = t("tool_title_select");
    }
    if (ui.toolEditTextBtn) {
      ui.toolEditTextBtn.textContent = t("tool_edit_text");
      ui.toolEditTextBtn.title = t("tool_title_edit_text");
    }
    if (ui.toolDrawBtn) {
      ui.toolDrawBtn.textContent = t("tool_draw");
      ui.toolDrawBtn.title = t("tool_title_draw");
    }
    if (ui.toolAddTextBtn) {
      ui.toolAddTextBtn.textContent = t("tool_text");
      ui.toolAddTextBtn.title = t("tool_title_text");
    }
    if (ui.toolRectBtn) {
      ui.toolRectBtn.textContent = t("tool_rect");
      ui.toolRectBtn.title = t("tool_title_rect");
    }
    if (ui.toolEllipseBtn) {
      ui.toolEllipseBtn.textContent = t("tool_ellipse");
      ui.toolEllipseBtn.title = t("tool_title_ellipse");
    }
    if (ui.toolLineBtn) {
      ui.toolLineBtn.textContent = t("tool_line");
      ui.toolLineBtn.title = t("tool_title_line");
    }
    if (ui.deleteSelectionBtn) {
      ui.deleteSelectionBtn.textContent = t("tool_delete");
    }
    if (ui.duplicateSelectionBtn) {
      ui.duplicateSelectionBtn.textContent = t("tool_duplicate");
    }
    if (ui.prevPageBtn) {
      ui.prevPageBtn.textContent = t("prev");
    }
    if (ui.nextPageBtn) {
      ui.nextPageBtn.textContent = t("next");
    }
    if (ui.undoBtn) {
      ui.undoBtn.textContent = t("undo");
    }
    if (ui.redoBtn) {
      ui.redoBtn.textContent = t("redo");
    }
    if (ui.clearPageBtn) {
      ui.clearPageBtn.textContent = t("clear_page");
    }
    if (ui.beforeAfterBtn) {
      ui.beforeAfterBtn.textContent = state.beforePreview ? t("preview_after") : t("preview_before");
    }
    if (ui.zoomControlLabel) {
      ui.zoomControlLabel.textContent = t("zoom");
    }
    if (ui.zoomFitBtn) {
      ui.zoomFitBtn.textContent = t("fit");
    }
    if (ui.dropHint) {
      ui.dropHint.textContent = t("drop_hint");
    }
    if (ui.propertiesHeading) {
      ui.propertiesHeading.textContent = t("properties");
    }
    if (ui.svgPageBtn) {
      setPanelQuickActionLabel(ui.svgPageBtn, t("svg_page"));
    }
    if (ui.splitSectionBtn) {
      setPanelQuickActionLabel(ui.splitSectionBtn, t("split_page"));
    }
    if (ui.pngJpgPageBtn) {
      setPanelQuickActionLabel(ui.pngJpgPageBtn, t("png_jpg_page"));
    }
    if (ui.labelStroke) {
      ui.labelStroke.textContent = t("stroke");
    }
    if (ui.labelFill) {
      ui.labelFill.textContent = t("fill");
    }
    if (ui.labelFillOpacity) {
      ui.labelFillOpacity.textContent = t("fill_opacity");
    }
    if (ui.labelTextColor) {
      ui.labelTextColor.textContent = t("text_color");
    }
    if (ui.labelFont) {
      ui.labelFont.textContent = t("font");
    }
    if (ui.labelStrokeWidth) {
      ui.labelStrokeWidth.textContent = t("stroke_width");
    }
    if (ui.labelFontSize) {
      ui.labelFontSize.textContent = t("font_size");
    }
    if (ui.bringFrontBtn) {
      ui.bringFrontBtn.textContent = t("bring_front");
    }
    if (ui.sendBackBtn) {
      ui.sendBackBtn.textContent = t("send_back");
    }
    if (ui.textTuneHeading) {
      ui.textTuneHeading.textContent = t("text_tune_heading");
    }
    if (ui.labelLetterSpacing) {
      ui.labelLetterSpacing.textContent = t("letter_spacing");
    }
    if (ui.autoMatchTextBtn) {
      ui.autoMatchTextBtn.textContent = t("auto_match_all");
    }
    if (ui.vectorTextExportLabel) {
      ui.vectorTextExportLabel.textContent = t("vector_text_export");
    }
    if (ui.fontInspectorHeading) {
      ui.fontInspectorHeading.textContent = t("font_inspector_heading");
    }
    if (ui.fontInspectorOriginalLabel) {
      ui.fontInspectorOriginalLabel.textContent = t("font_inspector_original");
    }
    if (ui.fontInspectorExportLabel) {
      ui.fontInspectorExportLabel.textContent = t("font_inspector_export");
    }
    if (ui.fontInspectorNote) {
      ui.fontInspectorNote.textContent = t("font_inspector_empty");
    }
    if (ui.splitHeading) {
      ui.splitHeading.textContent = t("split_heading");
    }
    if (ui.splitNote) {
      ui.splitNote.textContent = t("split_note");
    }
    if (ui.splitFromLabel) {
      ui.splitFromLabel.textContent = t("from");
    }
    if (ui.splitToLabel) {
      ui.splitToLabel.textContent = t("to");
    }
    if (ui.addSplitRangeBtn) {
      ui.addSplitRangeBtn.textContent = t("add_range");
    }
    if (ui.clearSplitRangesBtn) {
      ui.clearSplitRangesBtn.textContent = t("clear");
    }
    if (ui.mergeRangesLabel) {
      ui.mergeRangesLabel.textContent = t("merge_ranges");
    }
    if (ui.splitPdfBtn) {
      ui.splitPdfBtn.textContent = t("split_extract");
    }

    if (ui.pageCountLabel) {
      if (!state.pageEntries.length) {
        ui.pageCountLabel.textContent = t("no_file_loaded");
      } else {
        ui.pageCountLabel.textContent = t("page_count", {
          count: state.pageEntries.length,
        });
      }
    }
    updatePagePositionLabel();
    updateThumbnailLabels();
    renderSplitRanges();
    syncPropertyPanelFromSelection();
    if (state.lastStatusRaw) {
      setStatus(state.lastStatusRaw, state.lastStatusIsError);
    } else {
      setStatus("Ready. Open a PDF to start editing.");
    }
  }

  function setPanelQuickActionLabel(element, value) {
    if (!element) {
      return;
    }
    const raw = String(value || "").trim();
    if (!raw) {
      element.textContent = "";
      return;
    }
    const match = raw.match(/^(\S+)\s*(.*)$/);
    const icon = match ? match[1] : "";
    const label = match && match[2] ? match[2].trim() : "";
    let iconNode = element.querySelector(".panel-link-icon");
    let textNode = element.querySelector(".panel-link-text");
    if (!iconNode || !textNode) {
      element.textContent = "";
      iconNode = document.createElement("span");
      iconNode.className = "panel-link-icon";
      textNode = document.createElement("span");
      textNode.className = "panel-link-text";
      element.append(iconNode, textNode);
    }
    iconNode.textContent = icon;
    textNode.textContent = label || icon;
    element.setAttribute("aria-label", label || raw);
  }

  function toggleLanguage() {
    state.uiLanguage = state.uiLanguage === "ko" ? "en" : "ko";
    try {
      window.localStorage.setItem(STORAGE_LANGUAGE_KEY, state.uiLanguage);
    } catch (error) {
      // no-op if storage is unavailable
    }
    applyLanguageUI();
  }

  function updateUndoRedoButtons() {
    const entry = getCurrentEntry();
    if (!entry) {
      ui.undoBtn.disabled = true;
      ui.redoBtn.disabled = true;
      return;
    }
    ui.undoBtn.disabled = entry.historyIndex <= 0;
    ui.redoBtn.disabled = entry.historyIndex >= entry.history.length - 1;
  }

  function updateToolButtonState() {
    ui.toolButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === state.tool);
    });
  }

  function applyDrawingOptions(canvas) {
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new fabricLib.PencilBrush(canvas);
    }
    canvas.freeDrawingBrush.width = state.strokeWidth;
    canvas.freeDrawingBrush.color = state.strokeColor;
  }

  function applyToolMode(canvas) {
    const isDraw = state.tool === "draw";
    const isEditText = state.tool === "editText";
    const isSelect = state.tool === "select";
    const isCreate = CREATE_TOOLS.has(state.tool);

    canvas.isDrawingMode = isDraw;
    canvas.selection = isSelect || isEditText;
    canvas.skipTargetFind = isDraw || isCreate;
    canvas.defaultCursor = isDraw
      ? "crosshair"
      : isCreate
        ? "copy"
        : "default";

    canvas.forEachObject((object) => {
      if (object.isHelper) {
        object.selectable = Boolean(object.isInlineEditor);
        object.evented = Boolean(object.isInlineEditor);
        return;
      }
      if (isDraw || isCreate) {
        object.selectable = false;
        object.evented = false;
        return;
      }
      if (isEditText) {
        const editable = isEditableTextGroup(object);
        object.selectable = editable;
        object.evented = editable;
        if (editable) {
          object.lockMovementX = false;
          object.lockMovementY = false;
          object.lockScalingX = false;
          object.lockScalingY = false;
          object.lockRotation = true;
          object.hasControls = true;
          object.hasBorders = true;
          object.borderColor = "#1f74e8";
          object.borderDashArray = [6, 4];
          object.cornerStyle = "circle";
          object.cornerSize = 10;
          object.cornerColor = "#4f8cff";
          object.cornerStrokeColor = "#ffffff";
          object.padding = 0;
          if (object.controls && object.controls.mtr) {
            object.setControlVisible("mtr", false);
          }
          object.transparentCorners = false;
          object.hoverCursor = "move";
        }
        return;
      }
      if (isEditableTextGroup(object)) {
        object.lockMovementX = true;
        object.lockMovementY = true;
        object.lockScalingX = true;
        object.lockScalingY = true;
        object.lockRotation = true;
        object.hasControls = false;
        object.hasBorders = false;
        object.borderDashArray = null;
        object.hoverCursor = "text";
      }
      object.selectable = true;
      object.evented = true;
    });
  }

  function applyToolToAllPages() {
    state.pageEntries.forEach((entry) => {
      applyDrawingOptions(entry.fabric);
      applyToolMode(entry.fabric);
      refreshEditableVisualsForEntry(entry);
      if (state.beforePreview) {
        applyBeforePreviewToEntry(entry);
      }
      entry.fabric.requestRenderAll();
    });
  }

  function createHistorySnapshot(entry) {
    return JSON.stringify(entry.fabric.toDatalessJSON(SERIALIZED_PROPS));
  }

  function saveHistory(entry) {
    if (!entry || entry.isRestoring) {
      return;
    }
    const snapshot = createHistorySnapshot(entry);
    if (entry.history[entry.historyIndex] === snapshot) {
      return;
    }
    entry.history = entry.history.slice(0, entry.historyIndex + 1);
    entry.history.push(snapshot);
    entry.historyIndex = entry.history.length - 1;
    if (entry.index === state.currentPageIndex) {
      updateUndoRedoButtons();
    }
  }

  function restoreHistory(entry, index) {
    if (!entry || index < 0 || index >= entry.history.length) {
      return;
    }
    closeInlineEditor(entry, true);
    entry.historyIndex = index;
    entry.isRestoring = true;
    entry.fabric.loadFromJSON(entry.history[index], () => {
      entry.isRestoring = false;
      updateEntryFlagsFromObjects(entry);
      applyDrawingOptions(entry.fabric);
      applyToolMode(entry.fabric);
      refreshEditableVisualsForEntry(entry);
      entry.fabric.renderAll();
      if (entry.index === state.currentPageIndex) {
        updateUndoRedoButtons();
        syncPropertyPanelFromSelection();
      }
    });
  }

  function normalizePdfFontToken(value) {
    const raw = String(value || "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!raw) {
      return "";
    }
    const plusIndex = raw.indexOf("+");
    const withoutSubset = plusIndex >= 0 ? raw.slice(plusIndex + 1) : raw;
    return withoutSubset
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeRawFontCandidate(value) {
    return String(value || "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }

  function isGenericFontFamily(value) {
    const normalized = String(value || "").toLowerCase();
    return (
      normalized === "serif" ||
      normalized === "sans-serif" ||
      normalized === "monospace" ||
      normalized === "cursive" ||
      normalized === "fantasy" ||
      normalized === "system-ui"
    );
  }

  function quoteFontFamily(value) {
    const clean = String(value || "").trim();
    if (!clean) {
      return "";
    }
    if (/^[a-z0-9-]+$/i.test(clean)) {
      return clean;
    }
    return `'${clean.replace(/'/g, "\\'")}'`;
  }

  function isLikelyRenderableFontName(value) {
    const clean = String(value || "").trim();
    if (!clean) {
      return false;
    }
    if (isGenericFontFamily(clean)) {
      return false;
    }
    const alphaCount = (clean.match(/[a-z]/gi) || []).length;
    const digitCount = (clean.match(/[0-9]/g) || []).length;
    if (alphaCount < 4 || digitCount > alphaCount) {
      return false;
    }
    // Skip cryptic subset-ish names like "F1", "ABCD123", etc.
    if (
      /^[a-z0-9_-]+$/i.test(clean) &&
      !clean.includes(" ") &&
      !/[aeiou]/i.test(clean) &&
      alphaCount < 8
    ) {
      return false;
    }
    return true;
  }

  function isPdfJsEmbeddedFontAlias(value) {
    const clean = String(value || "").trim();
    if (!clean) {
      return false;
    }
    // pdf.js frequently exposes loaded fonts with aliases like g_d0_f1.
    return (
      /^g_[a-z0-9_]+$/i.test(clean) ||
      /^f[0-9]+$/i.test(clean) ||
      /^tt[0-9]+$/i.test(clean)
    );
  }

  function pickCanonicalFontStack(rawTokenValue) {
    const normalized = String(rawTokenValue || "").toLowerCase();
    if (!normalized) {
      return "";
    }
    if (normalized.includes("segoe ui") || normalized.includes("segoeui")) {
      return "'Segoe UI', Arial, sans-serif";
    }
    if (normalized.includes("arial")) {
      return "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    }
    if (normalized.includes("helvetica")) {
      return "'Helvetica Neue', Helvetica, Arial, sans-serif";
    }
    if (normalized.includes("calibri")) {
      return "Calibri, Arial, sans-serif";
    }
    if (normalized.includes("tahoma")) {
      return "Tahoma, 'Segoe UI', Arial, sans-serif";
    }
    if (normalized.includes("verdana")) {
      return "Verdana, Arial, sans-serif";
    }
    if (normalized.includes("trebuchet")) {
      return "'Trebuchet MS', Arial, sans-serif";
    }
    if (normalized.includes("cambria")) {
      return "Cambria, 'Times New Roman', serif";
    }
    if (
      normalized.includes("times") ||
      normalized.includes("garamond") ||
      normalized.includes("georgia")
    ) {
      return "'Times New Roman', Georgia, serif";
    }
    if (
      normalized.includes("courier") ||
      normalized.includes("consolas") ||
      normalized.includes("mono")
    ) {
      return "'Courier New', Consolas, monospace";
    }
    return "";
  }

  function mapPdfFontFamily(fontFamilyRaw, fontNameRaw) {
    const fontFamilyToken = normalizePdfFontToken(fontFamilyRaw);
    const fontNameToken = normalizePdfFontToken(fontNameRaw);
    const rawFamilyToken = normalizeRawFontCandidate(fontFamilyRaw);
    const rawNameToken = normalizeRawFontCandidate(fontNameRaw);
    const aliasCandidates = [rawFamilyToken, rawNameToken, fontFamilyToken, fontNameToken];
    for (let index = 0; index < aliasCandidates.length; index += 1) {
      const aliasCandidate = aliasCandidates[index];
      if (!isPdfJsEmbeddedFontAlias(aliasCandidate)) {
        continue;
      }
      const quotedAlias = quoteFontFamily(aliasCandidate);
      if (quotedAlias) {
        return `${quotedAlias}, 'Helvetica Neue', Arial, sans-serif`;
      }
    }
    const normalizedAll = `${fontFamilyToken} ${fontNameToken} ${rawFamilyToken} ${rawNameToken}`;
    const canonicalStack = pickCanonicalFontStack(normalizedAll);
    if (canonicalStack) {
      return canonicalStack;
    }
    const genericFamily = String(fontFamilyRaw || "").trim().toLowerCase();
    if (genericFamily === "serif") {
      return "'Times New Roman', Georgia, serif";
    }
    if (genericFamily === "sans-serif") {
      return "'Helvetica Neue', Arial, sans-serif";
    }
    if (genericFamily === "monospace") {
      return "'Courier New', Consolas, monospace";
    }
    const normalized = normalizedAll.toLowerCase();
    if (normalized.includes("mono")) {
      return "'Courier New', Consolas, monospace";
    }
    const customCandidates = [
      fontFamilyToken,
      rawFamilyToken,
      fontNameToken,
      rawNameToken,
    ];
    for (let index = 0; index < customCandidates.length; index += 1) {
      const candidate = customCandidates[index];
      if (!candidate || isGenericFontFamily(candidate)) {
        continue;
      }
      const quoted = quoteFontFamily(candidate);
      if (quoted) {
        return `${quoted}, Arial, sans-serif`;
      }
    }
    return "'Helvetica Neue', Arial, sans-serif";
  }

  function splitFontFamilyCandidates(fontFamilyValue) {
    const raw = String(fontFamilyValue || "");
    if (!raw.trim()) {
      return [];
    }
    const candidates = [];
    let chunk = "";
    let quote = "";
    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if ((char === "'" || char === '"') && (!quote || quote === char)) {
        if (quote === char) {
          quote = "";
        } else {
          quote = char;
        }
        chunk += char;
        continue;
      }
      if (char === "," && !quote) {
        if (chunk.trim()) {
          candidates.push(chunk.trim());
        }
        chunk = "";
        continue;
      }
      chunk += char;
    }
    if (chunk.trim()) {
      candidates.push(chunk.trim());
    }
    return candidates
      .map((value) => normalizeRawFontCandidate(value))
      .filter((value) => Boolean(value));
  }

  function normalizeFontLookupToken(value) {
    return String(value || "")
      .replace(/^['"]|['"]$/g, "")
      .trim()
      .toLowerCase();
  }

  function getPrimaryFontFamilyCandidate(fontFamilyValue) {
    const candidates = splitFontFamilyCandidates(fontFamilyValue);
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!candidate || isGenericFontFamily(candidate)) {
        continue;
      }
      return candidate;
    }
    return "";
  }

  function extractEmbeddableFontUrl(srcValue) {
    const src = String(srcValue || "");
    if (!src) {
      return "";
    }
    const urlRegex = /url\(([^)]+)\)/gi;
    let match = urlRegex.exec(src);
    while (match) {
      const cleaned = String(match[1] || "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (
        cleaned.startsWith("data:") ||
        cleaned.startsWith("blob:") ||
        cleaned.startsWith("http://") ||
        cleaned.startsWith("https://")
      ) {
        return cleaned;
      }
      match = urlRegex.exec(src);
    }
    return "";
  }

  function findFontFaceSourceUrl(familyName) {
    const lookup = normalizeFontLookupToken(familyName);
    if (!lookup) {
      return "";
    }
    if (cssFontFaceSrcCache.has(lookup)) {
      return cssFontFaceSrcCache.get(lookup) || "";
    }

    const fontFaceRuleType = typeof CSSRule !== "undefined" ? CSSRule.FONT_FACE_RULE : 5;
    const styleSheets = Array.from(document.styleSheets || []);
    for (let index = 0; index < styleSheets.length; index += 1) {
      const sheet = styleSheets[index];
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        rules = null;
      }
      if (!rules || !rules.length) {
        continue;
      }
      for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
        const rule = rules[ruleIndex];
        if (!rule || rule.type !== fontFaceRuleType || !rule.style) {
          continue;
        }
        const family = normalizeFontLookupToken(rule.style.getPropertyValue("font-family"));
        if (!family || family !== lookup) {
          continue;
        }
        const src = extractEmbeddableFontUrl(rule.style.getPropertyValue("src"));
        cssFontFaceSrcCache.set(lookup, src || "");
        return src || "";
      }
    }
    cssFontFaceSrcCache.set(lookup, "");
    return "";
  }

  async function loadFontFaceBytes(familyName) {
    const lookup = normalizeFontLookupToken(familyName);
    if (!lookup) {
      return null;
    }
    if (cssFontFaceBytesCache.has(lookup)) {
      return cssFontFaceBytesCache.get(lookup);
    }

    const loader = (async () => {
      const sourceUrl = findFontFaceSourceUrl(lookup);
      if (!sourceUrl) {
        return null;
      }
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          return null;
        }
        const bytes = await response.arrayBuffer();
        return new Uint8Array(bytes);
      } catch (error) {
        return null;
      }
    })();

    cssFontFaceBytesCache.set(lookup, loader);
    return loader;
  }

  function ensurePdfFontkitRegistered(pdfDoc, fontCache) {
    if (!pdfDoc || !fontCache || !pdfLibFontkit || typeof pdfDoc.registerFontkit !== "function") {
      return false;
    }
    if (fontCache.__fontkitRegistered) {
      return true;
    }
    try {
      pdfDoc.registerFontkit(pdfLibFontkit);
      fontCache.__fontkitRegistered = true;
      return true;
    } catch (error) {
      fontCache.__fontkitRegistered = false;
      return false;
    }
  }

  async function getEmbeddedFontForOperation(pdfDoc, fontCache, operation) {
    const family = getPrimaryFontFamilyCandidate(operation && operation.fontFamily);
    const canEmbedCustom = ensurePdfFontkitRegistered(pdfDoc, fontCache);
    if (family && canEmbedCustom) {
      const customCacheKey = `custom:${normalizeFontLookupToken(family)}`;
      if (!Object.prototype.hasOwnProperty.call(fontCache, customCacheKey)) {
        let embedded = null;
        const fontBytes = await loadFontFaceBytes(family);
        if (fontBytes && fontBytes.length) {
          try {
            embedded = await pdfDoc.embedFont(fontBytes, { subset: true });
          } catch (error) {
            embedded = null;
          }
        }
        fontCache[customCacheKey] = embedded;
      }
      if (fontCache[customCacheKey]) {
        return {
          font: fontCache[customCacheKey],
          descriptor: {
            label: family,
            fallbackUsed: false,
            customEmbedded: true,
          },
        };
      }
    }

    const descriptor = resolveStandardFontDescriptor(
      operation && operation.fontFamily,
      operation && operation.fontWeight,
      operation && operation.fontStyle,
    );
    const font = await getEmbeddedStandardFont(pdfDoc, fontCache, descriptor);
    return {
      font,
      descriptor,
    };
  }

  function normalizeWeightValue(weightRaw) {
    const weightText = String(weightRaw || "").toLowerCase().trim();
    const parsed = Number.parseInt(weightText, 10);
    if (Number.isFinite(parsed)) {
      return clamp(parsed, 100, 900);
    }
    if (weightText.includes("bold")) {
      return 700;
    }
    return 400;
  }

  function resolveStandardFontDescriptor(fontFamilyRaw, fontWeightRaw, fontStyleRaw) {
    const familyRaw = String(fontFamilyRaw || "").toLowerCase();
    const styleRaw = String(fontStyleRaw || "").toLowerCase();
    const weight = normalizeWeightValue(fontWeightRaw);
    const isBold = weight >= 600;
    const isItalic = styleRaw.includes("italic") || styleRaw.includes("oblique");

    let familyKey = "helvetica";
    let recognized = false;

    if (
      familyRaw.includes("times") ||
      familyRaw.includes("georgia") ||
      familyRaw.includes("cambria") ||
      familyRaw.includes("garamond") ||
      familyRaw.includes("serif")
    ) {
      familyKey = "times";
      recognized = true;
    } else if (
      familyRaw.includes("courier") ||
      familyRaw.includes("consolas") ||
      familyRaw.includes("mono") ||
      familyRaw.includes("vt323")
    ) {
      familyKey = "courier";
      recognized = true;
    } else if (
      familyRaw.includes("arial") ||
      familyRaw.includes("helvetica") ||
      familyRaw.includes("calibri") ||
      familyRaw.includes("tahoma") ||
      familyRaw.includes("verdana") ||
      familyRaw.includes("trebuchet") ||
      familyRaw.includes("gaegu") ||
      familyRaw.includes("permanent marker") ||
      familyRaw.includes("caveat") ||
      familyRaw.includes("ibm plex sans")
    ) {
      familyKey = "helvetica";
      recognized = true;
    }

    let fontName = "Helvetica";
    let label = "Helvetica";
    if (familyKey === "times") {
      if (isBold && isItalic) {
        fontName = "TimesBoldItalic";
        label = "Times Bold Italic";
      } else if (isBold) {
        fontName = "TimesBold";
        label = "Times Bold";
      } else if (isItalic) {
        fontName = "TimesItalic";
        label = "Times Italic";
      } else {
        fontName = "TimesRoman";
        label = "Times Roman";
      }
    } else if (familyKey === "courier") {
      if (isBold && isItalic) {
        fontName = "CourierBoldOblique";
        label = "Courier Bold Oblique";
      } else if (isBold) {
        fontName = "CourierBold";
        label = "Courier Bold";
      } else if (isItalic) {
        fontName = "CourierOblique";
        label = "Courier Oblique";
      } else {
        fontName = "Courier";
        label = "Courier";
      }
    } else {
      if (isBold && isItalic) {
        fontName = "HelveticaBoldOblique";
        label = "Helvetica Bold Oblique";
      } else if (isBold) {
        fontName = "HelveticaBold";
        label = "Helvetica Bold";
      } else if (isItalic) {
        fontName = "HelveticaOblique";
        label = "Helvetica Oblique";
      } else {
        fontName = "Helvetica";
        label = "Helvetica";
      }
    }

    return {
      fontName,
      label,
      fallbackUsed: !recognized,
    };
  }

  async function getEmbeddedStandardFont(pdfDoc, fontCache, descriptor) {
    const safeDescriptor = descriptor || { fontName: "Helvetica" };
    const fontName = String(safeDescriptor.fontName || "Helvetica");
    if (!fontCache[fontName]) {
      const standardFontName =
        (pdfLib.StandardFonts && pdfLib.StandardFonts[fontName]) || pdfLib.StandardFonts.Helvetica;
      fontCache[fontName] = await pdfDoc.embedFont(standardFontName);
    }
    return fontCache[fontName];
  }

  function parseColorForPdf(colorRaw) {
    const color = String(colorRaw || "").trim().toLowerCase();
    if (!color) {
      return pdfLib.rgb(0, 0, 0);
    }
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const fullHex =
        hex.length === 3
          ? hex
              .split("")
              .map((char) => char + char)
              .join("")
          : hex;
      const parsed = Number.parseInt(fullHex, 16);
      if (Number.isFinite(parsed)) {
        return pdfLib.rgb(
          ((parsed >> 16) & 255) / 255,
          ((parsed >> 8) & 255) / 255,
          (parsed & 255) / 255,
        );
      }
    }
    const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
    if (rgbMatch) {
      const channels = rgbMatch[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value));
      if (channels.length >= 3) {
        return pdfLib.rgb(
          clamp(channels[0], 0, 255) / 255,
          clamp(channels[1], 0, 255) / 255,
          clamp(channels[2], 0, 255) / 255,
        );
      }
    }
    return pdfLib.rgb(0, 0, 0);
  }

  function derivePdfFontTraits(style, item) {
    const fontFamilyRaw = style && style.fontFamily ? style.fontFamily : "";
    const fontNameRaw = item && item.fontName ? item.fontName : "";
    const value = `${fontFamilyRaw} ${fontNameRaw}`.toLowerCase();
    const styleWeightRaw = style && style.fontWeight ? String(style.fontWeight).toLowerCase() : "";
    const parsedWeight = Number.parseInt(styleWeightRaw, 10);
    const hasBold =
      value.includes("bold") ||
      styleWeightRaw === "bold" ||
      (Number.isFinite(parsedWeight) && parsedWeight >= 600);
    let fontWeight = "400";
    if (hasBold) {
      fontWeight = Number.isFinite(parsedWeight)
        ? String(clamp(parsedWeight, 100, 900))
        : "700";
    } else if (Number.isFinite(parsedWeight) && parsedWeight >= 100 && parsedWeight <= 900) {
      fontWeight = String(parsedWeight);
    }
    return {
      fontFamily: mapPdfFontFamily(fontFamilyRaw, fontNameRaw),
      fontWeight,
      fontStyle:
        value.includes("italic") || value.includes("oblique") ? "italic" : "normal",
    };
  }

  function createEditableTextGroup(config) {
    const left = Math.max(Number(config.left || 0), 0);
    const top = Math.max(Number(config.top || 0), 0);
    const width = Math.max(Number(config.width || 0), 6);
    const height = Math.max(Number(config.height || 0), 10);
    const textValue = String(config.text || "");
    const fontSize = Math.max(Number(config.fontSize || 12), 8);
    const fontFamily = String(config.fontFamily || "Arial, sans-serif");
    const fontWeight = String(config.fontWeight || "400");
    const fontStyle = String(config.fontStyle || "normal");
    const charSpacing = Number(config.charSpacing || 0);
    const originalAscent = Number.isFinite(Number(config.originalAscent))
      ? Number(config.originalAscent)
      : 0.82;
    const source = String(config.source || "pdf");
    const maskFillColor = String(config.maskFillColor || "#ffffff");
    const textFillColor = String(config.textFillColor || state.textColor);
    const fontScaleX = Math.max(Number(config.fontScaleX || 1), 0.5);
    const padX = Math.max(Number(config.paddingX ?? 0), 0);
    const padY = Math.max(Number(config.paddingY ?? 0), 0);
    const originalInkOffsetX = Number.isFinite(Number(config.originalInkOffsetX))
      ? Number(config.originalInkOffsetX)
      : 0;
    const originalInkOffsetY = Number.isFinite(Number(config.originalInkOffsetY))
      ? Number(config.originalInkOffsetY)
      : 0;

    const mask = new fabricLib.Rect({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      width,
      height,
      fill: "rgba(115, 171, 255, 0.18)",
      stroke: "#1f74e8",
      strokeWidth: 1,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      rx: 1,
      ry: 1,
      objectCaching: false,
    });

    const textNode = new fabricLib.Text(textValue, {
      left: padX,
      top: padY,
      originX: "left",
      originY: "top",
      textAlign: "left",
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle,
      charSpacing,
      fill: textFillColor,
      selectable: false,
      evented: false,
      lineHeight: 1,
      splitByGrapheme: false,
      objectCaching: false,
    });

    const group = new fabricLib.Group([mask, textNode], {
      left,
      top,
      originX: "left",
      originY: "top",
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hoverCursor: "text",
      transparentCorners: false,
      borderColor: "#1f74e8",
      cornerColor: "#1f74e8",
      objectCaching: false,
    });

    group.set({
      isTextEditGroup: true,
      textSource: source,
      originalText: textValue,
      originalComparableText: normalizeEditorCommitText(textValue),
      editedText: "",
      hasTextEdit: false,
      isDeletedText: false,
      originalFontFamily: fontFamily,
      originalFontSize: fontSize,
      originalFontWeight: fontWeight,
      originalFontStyle: fontStyle,
      originalCharSpacing: charSpacing,
      editFontFamily: fontFamily,
      editFontSize: fontSize,
      editFontWeight: fontWeight,
      editFontStyle: fontStyle,
      editCharSpacing: charSpacing,
      paddingX: padX,
      paddingY: padY,
      editingActive: false,
      maskFillColor,
      textFillColor,
      baseLeft: left,
      baseTop: top,
      baseWidth: width,
      baseHeight: height,
      fontScaleX,
      originalFontScaleX: fontScaleX,
      originalAscent: clamp(originalAscent, 0.5, 0.95),
      originalInkOffsetX: clamp(originalInkOffsetX, -4, 4),
      originalInkOffsetY: clamp(originalInkOffsetY, -3, 3),
      typographyCalibrated: false,
    });

    applyEditableVisualState(group, state.tool === "editText");
    return group;
  }

  function getComparableFontToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function hasEditableGroupStyleChanges(group) {
    if (!isEditableTextGroup(group)) {
      return false;
    }
    const familyChanged =
      getComparableFontToken(group.editFontFamily) !==
      getComparableFontToken(group.originalFontFamily);
    const sizeChanged =
      Math.abs(
        Number(group.editFontSize || group.originalFontSize || 0) -
          Number(group.originalFontSize || 0),
      ) > 0.05;
    const weightChanged =
      normalizeWeightValue(group.editFontWeight || group.originalFontWeight) !==
      normalizeWeightValue(group.originalFontWeight);
    const styleChanged =
      getComparableFontToken(group.editFontStyle || group.originalFontStyle) !==
      getComparableFontToken(group.originalFontStyle);
    const charSpacingChanged =
      Math.abs(
        Number(group.editCharSpacing ?? group.originalCharSpacing ?? 0) -
          Number(group.originalCharSpacing ?? 0),
      ) > 0.01;
    return familyChanged || sizeChanged || weightChanged || styleChanged || charSpacingChanged;
  }

  function refreshEditableGroupChangedState(group) {
    if (!isEditableTextGroup(group)) {
      return;
    }
    const editedComparable = normalizeEditorCommitText(group.editedText || "");
    const originalComparable = getOriginalComparableText(group);
    const textChanged = editedComparable !== originalComparable;
    const styleChanged = hasEditableGroupStyleChanges(group);
    const deleted = Boolean(group.isDeletedText);
    const changed = deleted || textChanged || styleChanged;
    group.hasTextEdit = changed;
    if (changed && !deleted) {
      if (!editedComparable) {
        group.editedText = group.originalText || "";
      }
    } else if (!changed) {
      group.editedText = "";
      group.isDeletedText = false;
      group.editFontFamily = group.originalFontFamily;
      group.editFontSize = group.originalFontSize;
      group.editFontWeight = group.originalFontWeight;
      group.editFontStyle = group.originalFontStyle;
      group.editCharSpacing = Number(group.originalCharSpacing || 0);
    }
  }

  function updateEditableGroupText(group, nextValue) {
    if (!isEditableTextGroup(group)) {
      return;
    }
    const normalized = normalizeEditorCommitText(nextValue);
    const originalComparableText = getOriginalComparableText(group);
    const hasVisibleText = normalized.trim().length > 0;

    if (!hasVisibleText) {
      group.hasTextEdit = true;
      group.isDeletedText = true;
      group.editedText = "";
      group.livePreviewText = null;
      group.fontScaleX = clamp(
        Number(group.originalFontScaleX || group.fontScaleX || 1),
        0.5,
        2.2,
      );
      restoreEditableGroupBaseSize(group);
      syncEditableTextGeometry(group);
      applyEditableVisualState(group, state.tool === "editText");
      return;
    }

    group.isDeletedText = false;
    group.editedText = normalized;
    group.livePreviewText = null;
    group.hasTextEdit = normalized !== originalComparableText;

    group.editFontFamily = group.originalFontFamily || state.fontFamily;
    group.editFontSize = group.originalFontSize || state.fontSize;
    group.editFontWeight = group.originalFontWeight || "400";
    group.editFontStyle = group.originalFontStyle || "normal";
    group.editCharSpacing = Number(group.originalCharSpacing || 0);
    group.fontScaleX = clamp(
      Number(group.originalFontScaleX || group.fontScaleX || 1),
      0.5,
      2.2,
    );
    refreshEditableGroupChangedState(group);
    if (group.hasTextEdit && !group.isDeletedText) {
      resizeEditableGroupMaskToText(group, group.editedText || normalized);
    } else {
      restoreEditableGroupBaseSize(group);
    }

    syncEditableTextGeometry(group);
    applyEditableVisualState(group, state.tool === "editText");
  }

  function resetEditableGroup(group) {
    if (!isEditableTextGroup(group)) {
      return;
    }
    group.editedText = "";
    group.hasTextEdit = false;
    group.isDeletedText = false;
    group.editFontFamily = group.originalFontFamily;
    group.editFontSize = group.originalFontSize;
    group.editFontWeight = group.originalFontWeight;
    group.editFontStyle = group.originalFontStyle;
    group.editCharSpacing = Number(group.originalCharSpacing || 0);
    group.fontScaleX = clamp(
      Number(group.originalFontScaleX || group.fontScaleX || 1),
      0.5,
      2.2,
    );
    group.livePreviewText = null;
    restoreEditableGroupBaseSize(group);
    syncEditableTextGeometry(group);
    applyEditableVisualState(group, state.tool === "editText");
  }

  function getEditableGroupMaskRect(group) {
    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return null;
    }
    const { mask } = nodes;
    const point = getObjectTopLeftOnCanvas(group);
    const width = Math.max(Math.round(getScaledObjectDimension(mask, "width")), 2);
    const height = Math.max(Math.round(getScaledObjectDimension(mask, "height")), 2);
    return {
      left: Math.round(Number(point.x || 0)),
      top: Math.round(Number(point.y || 0)),
      width,
      height,
    };
  }

  function buildBinaryMaskFromImageData(imageData, threshold) {
    const width = Number(imageData.width || 0);
    const height = Number(imageData.height || 0);
    const data = imageData.data || new Uint8ClampedArray(0);
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4;
      const alpha = Number(data[offset + 3] || 0) / 255;
      const r = Number(data[offset] || 255);
      const g = Number(data[offset + 1] || 255);
      const b = Number(data[offset + 2] || 255);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const darkness = (255 - luminance) * alpha;
      mask[index] = darkness > threshold ? 1 : 0;
    }
    return mask;
  }

  function scoreBinaryMasks(referenceMask, candidateMask) {
    if (!referenceMask || !candidateMask || referenceMask.length !== candidateMask.length) {
      return Number.POSITIVE_INFINITY;
    }
    let referenceCount = 0;
    let candidateCount = 0;
    let overlap = 0;
    let union = 0;
    for (let index = 0; index < referenceMask.length; index += 1) {
      const ref = referenceMask[index] > 0;
      const cand = candidateMask[index] > 0;
      if (ref) {
        referenceCount += 1;
      }
      if (cand) {
        candidateCount += 1;
      }
      if (ref && cand) {
        overlap += 1;
      }
      if (ref || cand) {
        union += 1;
      }
    }
    if (referenceCount < 8) {
      return Number.POSITIVE_INFINITY;
    }
    const iouPenalty = 1 - overlap / Math.max(union, 1);
    const densityPenalty = Math.abs(candidateCount - referenceCount) / Math.max(referenceCount, 1);
    return iouPenalty + densityPenalty * 0.35;
  }

  function findBinaryMaskBounds(mask, width, height) {
    if (!mask || !mask.length || width <= 0 || height <= 0) {
      return null;
    }
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!mask[y * width + x]) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return null;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  function renderCandidateTextMask(config) {
    const width = Math.max(Math.round(Number(config.width || 0)), 2);
    const height = Math.max(Math.round(Number(config.height || 0)), 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return new Uint8Array(width * height);
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    const textValue = String(config.text || "");
    if (!textValue.trim()) {
      const imageData = context.getImageData(0, 0, width, height);
      return buildBinaryMaskFromImageData(imageData, 12);
    }

    const fontSize = Math.max(Number(config.fontSize || 8), 1);
    const fontFamily = String(config.fontFamily || "Arial, sans-serif");
    const fontWeight = String(config.fontWeight || "400");
    const fontStyle = String(config.fontStyle || "normal");
    const padX = Number(config.padX || 0);
    const padY = Number(config.padY || 0);
    const ascentRatio = clamp(Number(config.ascent || 0.82), 0.5, 0.95);
    const fontScaleX = clamp(Number(config.fontScaleX || 1), 0.5, 2.2);
    const charSpacing = Number(config.charSpacing || 0);
    const offsetX = Number(config.offsetX || 0);
    const offsetY = Number(config.offsetY || 0);
    const trackingPx = (charSpacing / 1000) * fontSize;

    context.fillStyle = "#000000";
    context.textBaseline = "alphabetic";
    context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const baselineY = clamp(padY + offsetY + fontSize * ascentRatio, 1, height - 1);

    context.save();
    context.scale(fontScaleX, 1);
    let cursorX = (padX + offsetX) / fontScaleX;
    for (let index = 0; index < textValue.length; index += 1) {
      const glyph = textValue[index];
      context.fillText(glyph, cursorX, baselineY);
      const advance = context.measureText(glyph).width;
      cursorX += advance + trackingPx;
    }
    context.restore();

    const imageData = context.getImageData(0, 0, width, height);
    return buildBinaryMaskFromImageData(imageData, 20);
  }

  function fineTuneEditableGroupTypography(entry, group) {
    if (
      !entry ||
      !entry.backgroundCanvas ||
      !isEditableTextGroup(group) ||
      group.textSource !== "pdf" ||
      group.typographyCalibrated
    ) {
      return;
    }
    const textValue = String(group.originalText || "");
    if (!textValue.trim()) {
      group.typographyCalibrated = true;
      return;
    }
    const rect = getEditableGroupMaskRect(group);
    if (!rect) {
      group.typographyCalibrated = true;
      return;
    }

    const canvasWidth = Number(entry.backgroundCanvas.width || 0);
    const canvasHeight = Number(entry.backgroundCanvas.height || 0);
    const left = clamp(rect.left, 0, Math.max(canvasWidth - 1, 0));
    const top = clamp(rect.top, 0, Math.max(canvasHeight - 1, 0));
    const width = clamp(rect.width, 2, Math.max(canvasWidth - left, 2));
    const height = clamp(rect.height, 2, Math.max(canvasHeight - top, 2));
    const context = entry.backgroundCanvas.getContext("2d", { alpha: true });
    if (!context) {
      group.typographyCalibrated = true;
      return;
    }

    let imageData = null;
    try {
      imageData = context.getImageData(left, top, width, height);
    } catch (error) {
      group.typographyCalibrated = true;
      return;
    }
    if (!imageData) {
      group.typographyCalibrated = true;
      return;
    }

    const data = imageData.data || new Uint8ClampedArray(0);
    let sumDark = 0;
    let maxDark = 0;
    const pixels = Math.max(width * height, 1);
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * 4;
      const alpha = Number(data[offset + 3] || 0) / 255;
      const r = Number(data[offset] || 255);
      const g = Number(data[offset + 1] || 255);
      const b = Number(data[offset + 2] || 255);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const darkness = (255 - luminance) * alpha;
      sumDark += darkness;
      if (darkness > maxDark) {
        maxDark = darkness;
      }
    }
    const avgDark = sumDark / pixels;
    const threshold = clamp(avgDark + (maxDark - avgDark) * 0.42, 18, 160);
    const referenceMask = buildBinaryMaskFromImageData(imageData, threshold);
    const referenceBounds = findBinaryMaskBounds(referenceMask, width, height);
    let referenceCount = 0;
    referenceMask.forEach((value) => {
      if (value) {
        referenceCount += 1;
      }
    });
    if (referenceCount < 8 || !referenceBounds) {
      group.typographyCalibrated = true;
      return;
    }

    const baseSize = Math.max(Number(group.originalFontSize || 8), 8);
    const baseScale = clamp(Number(group.originalFontScaleX || group.fontScaleX || 1), 0.5, 2.2);
    const baseAscent = clamp(Number(group.originalAscent || 0.82), 0.5, 0.95);
    const candidateSizeFactors = [0.9, 0.94, 0.98, 1, 1.02, 1.06, 1.1];
    const candidateScaleFactors = [0.86, 0.92, 0.98, 1, 1.02, 1.08, 1.14];
    const candidateAscentOffsets = [-0.04, -0.02, 0, 0.02, 0.04];

    let best = null;
    candidateSizeFactors.forEach((sizeFactor) => {
      const candidateSize = clamp(baseSize * sizeFactor, 6, 180);
      candidateScaleFactors.forEach((scaleFactor) => {
        const candidateScale = clamp(baseScale * scaleFactor, 0.5, 2.2);
        candidateAscentOffsets.forEach((ascentOffset) => {
          const candidateAscent = clamp(baseAscent + ascentOffset, 0.5, 0.95);
          const candidateMask = renderCandidateTextMask({
            width,
            height,
            text: textValue,
            fontFamily: group.originalFontFamily || state.fontFamily,
            fontWeight: group.originalFontWeight || "400",
            fontStyle: group.originalFontStyle || "normal",
            fontSize: candidateSize,
            fontScaleX: candidateScale,
            charSpacing: Number(group.originalCharSpacing || 0),
            padX: Number(group.paddingX || 0),
            padY: Number(group.paddingY || 0),
            ascent: candidateAscent,
          });
          const score = scoreBinaryMasks(referenceMask, candidateMask);
          if (!best || score < best.score) {
            best = {
              score,
              fontSize: candidateSize,
              fontScaleX: candidateScale,
              ascent: candidateAscent,
            };
          }
        });
      });
    });

    if (best) {
      const bestMask = renderCandidateTextMask({
        width,
        height,
        text: textValue,
        fontFamily: group.originalFontFamily || state.fontFamily,
        fontWeight: group.originalFontWeight || "400",
        fontStyle: group.originalFontStyle || "normal",
        fontSize: best.fontSize,
        fontScaleX: best.fontScaleX,
        charSpacing: Number(group.originalCharSpacing || 0),
        padX: Number(group.paddingX || 0),
        padY: Number(group.paddingY || 0),
        ascent: best.ascent,
        offsetX: 0,
        offsetY: 0,
      });
      const bestBounds = findBinaryMaskBounds(bestMask, width, height);
      const offsetX = bestBounds ? clamp(referenceBounds.minX - bestBounds.minX, -3.5, 3.5) : 0;
      const offsetY = bestBounds ? clamp(referenceBounds.minY - bestBounds.minY, -2.5, 2.5) : 0;
      group.originalFontSize = best.fontSize;
      group.editFontSize = best.fontSize;
      group.originalFontScaleX = best.fontScaleX;
      group.fontScaleX = best.fontScaleX;
      group.originalAscent = best.ascent;
      group.originalInkOffsetX = offsetX;
      group.originalInkOffsetY = offsetY;
      group.editFontFamily = group.originalFontFamily;
      group.editFontWeight = group.originalFontWeight;
      group.editFontStyle = group.originalFontStyle;
      group.editCharSpacing = Number(group.originalCharSpacing || 0);
    }
    group.typographyCalibrated = true;
  }

  function closeInlineEditor(entry, commit) {
    if (!entry || !entry.inlineEditor) {
      return;
    }
    const { editor, targetGroup, isDomEditor, keyHandler, blurHandler, inputHandler } =
      entry.inlineEditor;
    entry.inlineEditor = null;

    let editorText = "";
    if (isDomEditor) {
      editorText = normalizeEditorCommitText(editor.value);
      if (keyHandler) {
        editor.removeEventListener("keydown", keyHandler);
      }
      if (blurHandler) {
        editor.removeEventListener("blur", blurHandler);
      }
      if (inputHandler) {
        editor.removeEventListener("input", inputHandler);
      }
      if (editor.parentElement) {
        editor.parentElement.removeChild(editor);
      }
    } else {
      editorText = normalizeEditorCommitText(editor.text);
      if (entry.fabric.getObjects().includes(editor)) {
        entry.isRestoring = true;
        entry.fabric.remove(editor);
        entry.isRestoring = false;
      }
    }

    if (targetGroup) {
      targetGroup.editingActive = false;
      targetGroup.livePreviewText = null;
      targetGroup.visible = true;
    }

    if (targetGroup && commit) {
      updateEditableGroupText(targetGroup, editorText);
      entry.fabric.setActiveObject(targetGroup);
      saveHistory(entry);
      setStatus(editorText.trim() ? "Text updated." : "Text deleted.");
    }

    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    if (entry.index === state.currentPageIndex) {
      syncPropertyPanelFromSelection();
    }
  }

  function closeAllInlineEditors(commit) {
    state.pageEntries.forEach((entry) => {
      closeInlineEditor(entry, commit);
    });
  }

  function openInlineEditor(entry, group) {
    if (!entry || !group || state.tool !== "editText") {
      return;
    }
    closeInlineEditor(entry, true);

    const nodes = getEditableGroupNodes(group);
    if (!nodes) {
      return;
    }
    fineTuneEditableGroupTypography(entry, group);
    recalibrateEditableGroupTypography(group);
    syncEditableTextGeometry(group);
    const { mask } = nodes;
    mask.setCoords();
    group.setCoords();
    const padX = Number(group.paddingX ?? 2);
    const padY = Number(group.paddingY ?? 1);
    const inkOffsetX = Number(group.originalInkOffsetX || 0);
    const inkOffsetY = Number(group.originalInkOffsetY || 0);
    const groupPoint = getObjectTopLeftOnCanvas(group);
    const maskWidth = Math.max(getScaledObjectDimension(mask, "width"), 8);
    const maskHeight = Math.max(getScaledObjectDimension(mask, "height"), 10);
    const wrapperRect = entry.wrapper.getBoundingClientRect();
    const canvasRect = entry.fabric.lowerCanvasEl
      ? entry.fabric.lowerCanvasEl.getBoundingClientRect()
      : null;
    const scaleX =
      canvasRect && canvasRect.width
        ? canvasRect.width / Math.max(Number(entry.fabric.getWidth() || 0), 1)
        : 1;
    const scaleY =
      canvasRect && canvasRect.height
        ? canvasRect.height / Math.max(Number(entry.fabric.getHeight() || 0), 1)
        : 1;
    const canvasOffsetX = canvasRect ? canvasRect.left - wrapperRect.left : 0;
    const canvasOffsetY = canvasRect ? canvasRect.top - wrapperRect.top : 0;
    const existingText = group.hasTextEdit
      ? group.editedText || ""
      : group.originalText || "";
    const fontFamily = group.hasTextEdit
      ? group.editFontFamily || group.originalFontFamily || state.fontFamily
      : group.originalFontFamily || state.fontFamily;
    const fontSize = group.hasTextEdit
      ? Number(group.editFontSize || group.originalFontSize || state.fontSize)
      : Number(group.originalFontSize || state.fontSize);
    const fontWeight = group.hasTextEdit
      ? group.editFontWeight || group.originalFontWeight || "400"
      : group.originalFontWeight || "400";
    const fontStyle = group.hasTextEdit
      ? group.editFontStyle || group.originalFontStyle || "normal"
      : group.originalFontStyle || "normal";
    const charSpacing = group.hasTextEdit
      ? Number(
          typeof group.editCharSpacing === "number"
            ? group.editCharSpacing
            : group.originalCharSpacing || 0,
        )
      : Number(group.originalCharSpacing || 0);

    group.editingActive = true;
    group.livePreviewText = group.isDeletedText ? "" : existingText;
    if (group.livePreviewText.trim().length > 0) {
      resizeEditableGroupMaskToText(group, group.livePreviewText);
    } else {
      restoreEditableGroupBaseSize(group);
    }
    applyEditableVisualState(group, true);

    const editor = document.createElement("input");
    editor.type = "text";
    editor.className = "inline-editor-input";
    editor.value = group.isDeletedText ? "" : existingText;
    editor.style.left = `${canvasOffsetX + (groupPoint.x + padX + inkOffsetX) * scaleX}px`;
    editor.style.top = `${canvasOffsetY + (groupPoint.y + padY + inkOffsetY) * scaleY}px`;
    editor.style.width = `${Math.max((maskWidth - padX * 2) * scaleX, 8)}px`;
    editor.style.height = `${Math.max(
      (Math.max(maskHeight - padY * 2, Math.max(fontSize * 1.25, 14)) + 2) * scaleY,
      Math.max(fontSize * 1.2 * scaleY, 16),
    )}px`;
    editor.style.fontSize = `${Math.max(fontSize * scaleY, 8)}px`;
    editor.style.fontFamily = fontFamily;
    editor.style.fontWeight = String(fontWeight);
    editor.style.fontStyle = String(fontStyle);
    editor.style.color = "transparent";
    editor.style.caretColor = group.textFillColor || state.textColor;
    editor.style.background = "transparent";
    editor.style.lineHeight = `${Math.max(fontSize * 1.12 * scaleY, 12)}px`;
    editor.style.textAlign = "left";
    editor.style.padding = "0";
    editor.style.letterSpacing = `${(Math.max(charSpacing, -500) / 1000) * fontSize * scaleX}px`;
    editor.style.transform = "translateZ(0)";
    editor.style.webkitFontSmoothing = "antialiased";
    editor.style.textRendering = "optimizeLegibility";
    editor.autocapitalize = "off";
    editor.autocomplete = "off";
    editor.autocorrect = "off";
    editor.spellcheck = false;
    editor.inputMode = "text";

    const refreshEditorBounds = () => {
      const currentNodes = getEditableGroupNodes(group);
      if (!currentNodes) {
        return;
      }
      const currentMask = currentNodes.mask;
      currentMask.setCoords();
      group.setCoords();
      const currentPoint = getObjectTopLeftOnCanvas(group);
      const currentMaskWidth = Math.max(getScaledObjectDimension(currentMask, "width"), 8);
      const currentMaskHeight = Math.max(getScaledObjectDimension(currentMask, "height"), 10);
      editor.style.left = `${canvasOffsetX + (currentPoint.x + padX + inkOffsetX) * scaleX}px`;
      editor.style.top = `${canvasOffsetY + (currentPoint.y + padY + inkOffsetY) * scaleY}px`;
      editor.style.width = `${Math.max((currentMaskWidth - padX * 2) * scaleX, 8)}px`;
      editor.style.height = `${Math.max(
        (Math.max(currentMaskHeight - padY * 2, Math.max(fontSize * 1.25, 14)) + 2) * scaleY,
        Math.max(fontSize * 1.2 * scaleY, 16),
      )}px`;
    };

    const keyHandler = (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        closeInlineEditor(entry, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeInlineEditor(entry, true);
      }
    };
    const blurHandler = () => {
      setTimeout(() => {
        if (entry.inlineEditor && entry.inlineEditor.editor === editor) {
          closeInlineEditor(entry, true);
        }
      }, 0);
    };
    const inputHandler = () => {
      const value = normalizeEditorCommitText(editor.value);
      group.livePreviewText = value;
      if (value.trim().length > 0) {
        resizeEditableGroupMaskToText(group, value);
      } else {
        restoreEditableGroupBaseSize(group);
      }
      syncEditableTextGeometry(group);
      refreshEditorBounds();
      entry.fabric.requestRenderAll();
    };
    editor.addEventListener("keydown", keyHandler);
    editor.addEventListener("blur", blurHandler);
    editor.addEventListener("input", inputHandler);
    inputHandler();

    entry.wrapper.appendChild(editor);
    entry.inlineEditor = {
      editor,
      targetGroup: group,
      isDomEditor: true,
      keyHandler,
      blurHandler,
      inputHandler,
    };

    entry.fabric.discardActiveObject();
    editor.focus({ preventScroll: true });
    editor.select();
    setStatus("Editing text: Enter or Esc to apply.");
    entry.fabric.requestRenderAll();
  }

  function createTextObject(entry, pointer) {
    const text = new fabricLib.IText("Type here", {
      left: pointer.x,
      top: pointer.y,
      fill: state.textColor,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
    });
    entry.fabric.add(text);
    entry.fabric.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    entry.fabric.requestRenderAll();
  }

  function beginShape(pointer) {
    const common = {
      stroke: state.strokeColor,
      strokeWidth: state.strokeWidth,
      fill: getFillStyle(),
    };

    if (state.tool === "line") {
      return new fabricLib.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: state.strokeColor,
        strokeWidth: state.strokeWidth,
      });
    }
    if (state.tool === "rect") {
      return new fabricLib.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 1,
        height: 1,
        ...common,
      });
    }
    if (state.tool === "ellipse") {
      return new fabricLib.Ellipse({
        left: pointer.x,
        top: pointer.y,
        originX: "center",
        originY: "center",
        rx: 1,
        ry: 1,
        ...common,
      });
    }
    return null;
  }

  function getPointer(entry, options) {
    return entry.fabric.getPointer(options.e);
  }

  function getBounds(start, end) {
    return {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  function updateShape(entry, pointer) {
    const shape = entry.pendingObject;
    if (!shape || !entry.dragStart) {
      return;
    }
    const start = entry.dragStart;

    if (state.tool === "line") {
      shape.set({ x1: start.x, y1: start.y, x2: pointer.x, y2: pointer.y });
    } else if (state.tool === "rect") {
      const bounds = getBounds(start, pointer);
      shape.set({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width || 1,
        height: bounds.height || 1,
      });
    } else if (state.tool === "ellipse") {
      const bounds = getBounds(start, pointer);
      shape.set({
        left: bounds.left + bounds.width / 2,
        top: bounds.top + bounds.height / 2,
        rx: Math.max(bounds.width / 2, 1),
        ry: Math.max(bounds.height / 2, 1),
      });
    }

    shape.setCoords();
    entry.fabric.requestRenderAll();
  }

  function finishShape(entry) {
    if (entry.pendingObject) {
      entry.pendingObject.setCoords();
      saveHistory(entry);
    }
    entry.pendingObject = null;
    entry.dragStart = null;
  }

  async function ensurePdfBoxesForEntry(entry) {
    if (!entry || entry.pdfTextReady) {
      return;
    }
    if (
      entry.fabric
        .getObjects()
        .some((object) => isEditableTextGroup(object) && object.textSource === "pdf")
    ) {
      entry.pdfTextReady = true;
      return;
    }

    const page = await state.pdfDoc.getPage(entry.index + 1);
    const textContent = await page.getTextContent();
    const styles = textContent.styles || {};
    let added = 0;

    entry.isRestoring = true;
    textContent.items.forEach((item) => {
      const rawValue = String(item.str || "");
      const value = rawValue.replace(/\u00a0/g, " ").replace(/\s+$/g, "");
      if (!value.trim()) {
        return;
      }

      const style = styles[item.fontName] || {};
      const fontTraits = derivePdfFontTraits(style, item);
      const matrix = pdfjsLib.Util.transform(entry.viewport.transform, item.transform);
      const x = Number(matrix[4] || 0);
      const y = Number(matrix[5] || 0);
      const fontHeight = Math.max(
        Math.hypot(matrix[2] || 0, matrix[3] || 0),
        Math.abs(Number(item.height || 0) * entry.viewport.scale),
        8,
      );
      const ascent = typeof style.ascent === "number" ? style.ascent : 0.82;
      const descent =
        typeof style.descent === "number" ? Math.abs(style.descent) : 0.18;

      let width = Math.abs(Number(item.width || 0) * entry.viewport.scale);
      if (!Number.isFinite(width) || width < 2) {
        width = Math.max(value.length * fontHeight * 0.45, 8);
      }
      const height = Math.max(fontHeight * (ascent + descent), fontHeight * 1.05, 9);

      const left = Math.max(Math.min(x, entry.fabric.getWidth() - 2), 0);
      const top = Math.max(Math.min(y - fontHeight * ascent, entry.fabric.getHeight() - 2), 0);
      width = Math.min(width, entry.fabric.getWidth() - left);
      const clampedHeight = Math.min(height, entry.fabric.getHeight() - top);
      if (width < 2 || clampedHeight < 2) {
        return;
      }
      const estimatedFontSize = Math.max(
        Math.min(fontHeight, clampedHeight * 0.96),
        8,
      );
      const measuredTextWidth = measureSingleLineTextWidth(
        value,
        fontTraits.fontFamily,
        estimatedFontSize,
        fontTraits.fontWeight,
        fontTraits.fontStyle,
      );
      const generousMeasuredWidth = Math.max(measuredTextWidth * 1.03 + 2, 8);
      let normalizedWidth = width;
      if (
        Number.isFinite(measuredTextWidth) &&
        measuredTextWidth > 0 &&
        normalizedWidth > generousMeasuredWidth * 1.12
      ) {
        normalizedWidth = Math.max(generousMeasuredWidth, 6);
      }
      normalizedWidth = clamp(normalizedWidth, 2, entry.fabric.getWidth() - left);

      const targetSingleLineHeight = Math.max(estimatedFontSize * 1.25 + 2, 9);
      let normalizedHeight = clampedHeight;
      if (normalizedHeight > targetSingleLineHeight * 1.45) {
        normalizedHeight = Math.max(targetSingleLineHeight, 9);
      }
      normalizedHeight = clamp(normalizedHeight, 2, entry.fabric.getHeight() - top);
      if (normalizedWidth < 2 || normalizedHeight < 2) {
        return;
      }

      const group = createEditableTextGroup({
        left,
        top,
        width: normalizedWidth,
        height: normalizedHeight,
        text: value,
        fontSize: estimatedFontSize,
        fontFamily: fontTraits.fontFamily,
        fontWeight: fontTraits.fontWeight,
        fontStyle: fontTraits.fontStyle,
        charSpacing: 0,
        originalAscent: ascent,
        fontScaleX: deriveFontScaleX(
          value,
          fontTraits.fontFamily,
          estimatedFontSize,
          fontTraits.fontWeight,
          fontTraits.fontStyle,
          Math.max(normalizedWidth - 4, 4),
        ),
        source: "pdf",
        paddingX: 0,
        paddingY: 0,
        maskFillColor: sampleMaskFillColor(
          entry.backgroundCanvas,
          left,
          top,
          normalizedWidth,
          normalizedHeight,
        ),
        textFillColor: sampleTextFillColor(
          entry.backgroundCanvas,
          left,
          top,
          normalizedWidth,
          normalizedHeight,
        ),
      });
      entry.fabric.add(group);
      added += 1;
    });
    entry.isRestoring = false;

    entry.pdfTextReady = true;
    updateEntryFlagsFromObjects(entry);
    applyToolMode(entry.fabric);
    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    if (added > 0) {
      saveHistory(entry);
    }
  }

  async function prepareEditTextMode() {
    if (!state.pageEntries.length || !state.pdfDoc || state.isPreparingTextBoxes) {
      return;
    }

    state.isPreparingTextBoxes = true;
    try {
      const total = state.pageEntries.length;
      for (let index = 0; index < total; index += 1) {
        const entry = state.pageEntries[index];
        await ensurePdfBoxesForEntry(entry);
        const editableGroups = entry.fabric
          .getObjects()
          .filter((object) => isEditableTextGroup(object));
        editableGroups.forEach((group) => {
          recalibrateEditableGroupTypography(group);
          syncEditableTextGeometry(group);
        });
        refreshEditableVisualsForEntry(entry);
        entry.fabric.requestRenderAll();
        setStatus(`Edit Text scan ${index + 1}/${total}`);
      }

      const boxCount = state.pageEntries.reduce((sum, entry) => {
        return (
          sum +
          entry.fabric
            .getObjects()
            .filter((object) => isEditableTextGroup(object)).length
        );
      }, 0);

      if (boxCount === 0) {
        setStatus("No embedded text found. Use OCR for scanned PDFs.", true);
      } else {
        setStatus(
          "Edit Text ready. Double-click to edit, drag to move, arrow keys nudge, Delete removes text.",
        );
      }
      syncPropertyPanelFromSelection();
    } catch (error) {
      console.error(error);
      setStatus("Failed to detect text boxes.", true);
    } finally {
      state.isPreparingTextBoxes = false;
      applyToolToAllPages();
    }
  }

  async function ensureOcrBoxesForEntry(entry, lang, pageIndex, totalPages) {
    if (!entry || !entry.backgroundCanvas) {
      return 0;
    }
    if (entry.ocrLanguages[lang]) {
      return 0;
    }

    const imageData = entry.backgroundCanvas.toDataURL("image/png");
    let lastReported = -1;
    const result = await tesseractLib.recognize(imageData, lang, {
      logger: (message) => {
        if (
          message.status === "recognizing text" &&
          typeof message.progress === "number"
        ) {
          const percent = Math.round(message.progress * 100);
          if (percent !== lastReported && percent % 5 === 0) {
            lastReported = percent;
            setStatus(`OCR ${pageIndex + 1}/${totalPages}: ${percent}%`);
          }
        }
      },
    });

    const words = result && result.data && Array.isArray(result.data.words)
      ? result.data.words
      : [];
    let added = 0;

    entry.isRestoring = true;
    words.forEach((word) => {
      const text = String(word.text || "").trim();
      const conf = Number(word.confidence || word.conf || 0);
      const bbox = word.bbox || {};
      const width = Number((bbox.x1 || 0) - (bbox.x0 || 0));
      const height = Number((bbox.y1 || 0) - (bbox.y0 || 0));
      if (!text || width < 4 || height < 4 || conf < 35) {
        return;
      }

      const left = Math.max(Math.min(Number(bbox.x0 || 0), entry.fabric.getWidth() - 2), 0);
      const top = Math.max(Math.min(Number(bbox.y0 || 0), entry.fabric.getHeight() - 2), 0);
      const clampedWidth = Math.min(width, entry.fabric.getWidth() - left);
      const clampedHeight = Math.min(height, entry.fabric.getHeight() - top);
      if (clampedWidth < 2 || clampedHeight < 2) {
        return;
      }

      const group = createEditableTextGroup({
        left,
        top,
        width: clampedWidth,
        height: clampedHeight,
        text,
        fontSize: Math.max(clampedHeight * 0.78, 8),
        fontFamily: "Arial, sans-serif",
        fontWeight: "400",
        fontStyle: "normal",
        charSpacing: 0,
        originalAscent: 0.82,
        fontScaleX: 1,
        source: "ocr",
        paddingX: 0,
        paddingY: 0,
        maskFillColor: sampleMaskFillColor(
          entry.backgroundCanvas,
          left,
          top,
          clampedWidth,
          clampedHeight,
        ),
        textFillColor: sampleTextFillColor(
          entry.backgroundCanvas,
          left,
          top,
          clampedWidth,
          clampedHeight,
        ),
      });
      entry.fabric.add(group);
      added += 1;
    });
    entry.isRestoring = false;

    entry.ocrLanguages[lang] = true;
    updateEntryFlagsFromObjects(entry);
    applyToolMode(entry.fabric);
    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    if (added > 0) {
      saveHistory(entry);
    }
    return added;
  }

  async function runOcr() {
    if (!state.pageEntries.length) {
      setStatus("Open a PDF first.", true);
      return;
    }
    if (!tesseractLib) {
      setStatus("OCR library is not loaded.", true);
      return;
    }
    if (state.isRunningOcr) {
      return;
    }

    closeAllInlineEditors(true);
    state.isRunningOcr = true;
    updateActionButtons();
    const lang = state.ocrLanguage;

    try {
      let totalAdded = 0;
      for (let index = 0; index < state.pageEntries.length; index += 1) {
        const entry = state.pageEntries[index];
        setStatus(`OCR scanning page ${index + 1}/${state.pageEntries.length}`);
        totalAdded += await ensureOcrBoxesForEntry(
          entry,
          lang,
          index,
          state.pageEntries.length,
        );
      }

      if (state.tool !== "editText") {
        setTool("editText");
      } else {
        applyToolToAllPages();
      }

      if (totalAdded > 0) {
        setStatus(`OCR complete. Added ${totalAdded} editable text boxes.`);
      } else {
        setStatus("OCR complete. No new text boxes detected.", true);
      }
    } catch (error) {
      console.error(error);
      setStatus("OCR failed. Try a smaller file or different OCR language.", true);
    } finally {
      state.isRunningOcr = false;
      updateActionButtons();
    }
  }

  function setTool(toolName) {
    closeAllInlineEditors(true);
    state.pageEntries.forEach((entry) => {
      entry.editDrag = null;
    });
    state.tool = toolName;
    updateToolButtonState();
    applyToolToAllPages();

    if (toolName === "editText") {
      if (!state.pageEntries.length) {
        setStatus("Open a PDF first.", true);
        return;
      }
      setStatus("Detecting text boxes...");
      prepareEditTextMode();
      syncPropertyPanelFromSelection();
      return;
    }

    syncPropertyPanelFromSelection();
    setStatus(`Tool: ${toolName}`);
  }

  function removeObject(entry, object) {
    if (!object) {
      return false;
    }
    if (isEditableTextGroup(object)) {
      updateEditableGroupText(object, "");
      return true;
    }
    entry.fabric.remove(object);
    return true;
  }

  function deleteSelectedObject() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    closeInlineEditor(entry, true);

    const active = entry.fabric.getActiveObject();
    if (!active) {
      setStatus("Nothing selected.");
      return;
    }
    if (active.isInlineEditor) {
      return;
    }

    let changed = false;
    entry.isRestoring = true;
    if (active.type === "activeSelection") {
      const objects = [...active.getObjects()];
      entry.fabric.discardActiveObject();
      objects.forEach((object) => {
        changed = removeObject(entry, object) || changed;
      });
    } else {
      changed = removeObject(entry, active);
    }
    entry.isRestoring = false;

    if (!changed) {
      return;
    }
    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
    syncPropertyPanelFromSelection();
    setStatus("Selection deleted.");
  }

  function duplicateSelectedObject() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    closeInlineEditor(entry, true);

    const active = entry.fabric.getActiveObject();
    if (!active) {
      setStatus("Select an object to duplicate.", true);
      return;
    }
    if (
      isEditableTextGroup(active) ||
      (active.type === "activeSelection" &&
        active.getObjects().some((object) => isEditableTextGroup(object)))
    ) {
      setStatus("Detected text boxes cannot be duplicated.", true);
      return;
    }

    active.clone((clone) => {
      clone.set({
        left: Number(active.left || 0) + 24,
        top: Number(active.top || 0) + 24,
      });
      entry.fabric.add(clone);
      entry.fabric.setActiveObject(clone);
      entry.fabric.requestRenderAll();
      setStatus("Duplicated selection.");
    });
  }

  function bringSelectionToFront() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    closeInlineEditor(entry, true);

    const active = entry.fabric.getActiveObject();
    if (!active || active.isInlineEditor) {
      return;
    }
    entry.fabric.bringToFront(active);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
  }

  function sendSelectionToBack() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    closeInlineEditor(entry, true);

    const active = entry.fabric.getActiveObject();
    if (!active || active.isInlineEditor) {
      return;
    }
    entry.fabric.sendToBack(active);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
  }

  function clearCurrentPage() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    closeInlineEditor(entry, true);

    const confirmMessage =
      state.uiLanguage === "ko"
        ? "이 페이지의 모든 편집을 지우시겠습니까?"
        : "Clear all edits on this page?";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    let changed = false;
    entry.isRestoring = true;
    const objects = [...entry.fabric.getObjects()];
    objects.forEach((object) => {
      if (isEditableTextGroup(object)) {
        if (
          object.hasTextEdit ||
          object.isDeletedText ||
          isEditableGroupMoved(object)
        ) {
          object.set({
            left: Number(
              typeof object.baseLeft === "number" ? object.baseLeft : object.left || 0,
            ),
            top: Number(
              typeof object.baseTop === "number" ? object.baseTop : object.top || 0,
            ),
          });
          resetEditableGroup(object);
          changed = true;
        }
      } else if (!object.isHelper) {
        entry.fabric.remove(object);
        changed = true;
      }
    });
    entry.isRestoring = false;

    if (!changed) {
      setStatus("Page already clean.");
      return;
    }

    refreshEditableVisualsForEntry(entry);
    entry.fabric.discardActiveObject();
    entry.fabric.requestRenderAll();
    saveHistory(entry);
    setStatus("Page cleared.");
  }

  function undo() {
    const entry = getCurrentEntry();
    if (!entry || entry.historyIndex <= 0) {
      return;
    }
    restoreHistory(entry, entry.historyIndex - 1);
    syncPropertyPanelFromSelection();
    setStatus("Undo");
  }

  function redo() {
    const entry = getCurrentEntry();
    if (!entry || entry.historyIndex >= entry.history.length - 1) {
      return;
    }
    restoreHistory(entry, entry.historyIndex + 1);
    syncPropertyPanelFromSelection();
    setStatus("Redo");
  }

  function hasExportableObjects(entry) {
    return entry.fabric.getObjects().some((object) => {
      if (object.isHelper) {
        return false;
      }
      if (isEditableTextGroup(object)) {
        return Boolean(object.hasTextEdit || isEditableGroupMoved(object));
      }
      return true;
    });
  }

  function prepareEntryForExport(entry, options) {
    const exportOptions = options || {};
    const skipEditableText = Boolean(exportOptions.skipEditableText);
    if (entry && entry.fabric && typeof entry.fabric.discardActiveObject === "function") {
      entry.fabric.discardActiveObject();
    }

    const restoreRecords = [];
    const tempObjects = [];
    entry.fabric.getObjects().forEach((object) => {
      restoreRecords.push({
        object,
        visible: object.visible,
      });

      if (object.isHelper) {
        object.visible = false;
        return;
      }
      if (isEditableTextGroup(object)) {
        if (skipEditableText) {
          object.visible = false;
          return;
        }
        const moved = isEditableGroupMoved(object);
        const changed = Boolean(object.hasTextEdit || moved);
        if (changed) {
          const nodes = getEditableGroupNodes(object);
          if (!nodes) {
            object.visible = false;
            return;
          }
          const { mask, text } = nodes;
          object.visible = true;
          const maskWidth = Math.max(getScaledObjectDimension(mask, "width"), 2);
          const maskHeight = Math.max(getScaledObjectDimension(mask, "height"), 2);
          const baseMaskWidth = getEditableGroupBaseDimension(object, mask, "width");
          const baseMaskHeight = getEditableGroupBaseDimension(object, mask, "height");
          const baseLeft = Number(
            typeof object.baseLeft === "number" ? object.baseLeft : object.left || 0,
          );
          const baseTop = Number(
            typeof object.baseTop === "number" ? object.baseTop : object.top || 0,
          );
          mask.set({
            fill: object.hasTextEdit ? object.maskFillColor || "#ffffff" : "transparent",
            stroke: "transparent",
            strokeWidth: 0,
            strokeDashArray: null,
          });
          const showEditedText = Boolean(object.hasTextEdit && !object.isDeletedText);
          text.set({
            fill: object.textFillColor || state.textColor,
            visible: showEditedText,
          });

          if (moved) {
            const oldMask = new fabricLib.Rect({
              left: baseLeft,
              top: baseTop,
              originX: "left",
              originY: "top",
              width: baseMaskWidth,
              height: baseMaskHeight,
              fill: object.maskFillColor || "#ffffff",
              stroke: "transparent",
              strokeWidth: 0,
              selectable: false,
              evented: false,
              objectCaching: false,
            });
            oldMask.set({
              isExportTemp: true,
            });
            entry.isRestoring = true;
            entry.fabric.add(oldMask);
            entry.fabric.sendToBack(oldMask);
            entry.isRestoring = false;
            tempObjects.push(oldMask);

            if (!object.hasTextEdit && !object.isDeletedText) {
              const cropCanvas = document.createElement("canvas");
              cropCanvas.width = Math.max(Math.round(maskWidth), 2);
              cropCanvas.height = Math.max(Math.round(maskHeight), 2);
              const cropContext = cropCanvas.getContext("2d", { alpha: true });
              if (cropContext) {
                cropContext.drawImage(
                  entry.backgroundCanvas,
                  Math.round(baseLeft),
                  Math.round(baseTop),
                  Math.round(maskWidth),
                  Math.round(maskHeight),
                  0,
                  0,
                  cropCanvas.width,
                  cropCanvas.height,
                );
                const movedPoint = getObjectTopLeftOnCanvas(object);
                const movedSnapshot = new fabricLib.Image(cropCanvas, {
                  left: Number(movedPoint.x || object.left || 0),
                  top: Number(movedPoint.y || object.top || 0),
                  originX: "left",
                  originY: "top",
                  selectable: false,
                  evented: false,
                  objectCaching: false,
                });
                movedSnapshot.set({
                  isExportTemp: true,
                });
                entry.isRestoring = true;
                entry.fabric.add(movedSnapshot);
                entry.isRestoring = false;
                tempObjects.push(movedSnapshot);
              }
            }
          }
        } else {
          object.visible = false;
        }
      }
    });

    entry.fabric.discardActiveObject();
    entry.fabric.renderAll();
    return { restoreRecords, tempObjects };
  }

  function collectVectorTextOperations(entry) {
    if (!entry || !entry.fabric) {
      return [];
    }
    const operations = [];
    entry.fabric.getObjects().forEach((object) => {
      if (!isEditableTextGroup(object)) {
        return;
      }
      const moved = isEditableGroupMoved(object);
      const changed = Boolean(object.hasTextEdit || moved);
      if (!changed) {
        return;
      }
      const nodes = getEditableGroupNodes(object);
      if (!nodes) {
        return;
      }
      const { mask } = nodes;
      const baseLeft = Number(
        typeof object.baseLeft === "number" ? object.baseLeft : object.left || 0,
      );
      const baseTop = Number(
        typeof object.baseTop === "number" ? object.baseTop : object.top || 0,
      );
      const baseWidth = Math.max(getEditableGroupBaseDimension(object, mask, "width"), 2);
      const baseHeight = Math.max(getEditableGroupBaseDimension(object, mask, "height"), 2);
      const movedPoint = getObjectTopLeftOnCanvas(object);
      const currentLeft = Number(movedPoint.x || object.left || 0);
      const currentTop = Number(movedPoint.y || object.top || 0);
      const currentWidth = Math.max(getScaledObjectDimension(mask, "width"), 2);
      const currentHeight = Math.max(getScaledObjectDimension(mask, "height"), 2);
      const textValue = object.isDeletedText
        ? ""
        : object.hasTextEdit
          ? object.editedText || object.originalText || ""
          : object.originalText || "";
      const fontFamily = object.hasTextEdit
        ? object.editFontFamily || object.originalFontFamily || state.fontFamily
        : object.originalFontFamily || state.fontFamily;
      const fontSize = object.hasTextEdit
        ? Number(object.editFontSize || object.originalFontSize || state.fontSize)
        : Number(object.originalFontSize || state.fontSize);
      const fontWeight = object.hasTextEdit
        ? object.editFontWeight || object.originalFontWeight || "400"
        : object.originalFontWeight || "400";
      const fontStyle = object.hasTextEdit
        ? object.editFontStyle || object.originalFontStyle || "normal"
        : object.originalFontStyle || "normal";
      const charSpacing = object.hasTextEdit
        ? Number(
            typeof object.editCharSpacing === "number"
              ? object.editCharSpacing
              : object.originalCharSpacing || 0,
          )
        : Number(object.originalCharSpacing || 0);
      const fontScaleX = clamp(
        Number(object.fontScaleX || object.originalFontScaleX || 1),
        0.5,
        2.2,
      );
      operations.push({
        eraseRects: [
          {
            left: baseLeft,
            top: baseTop,
            width: baseWidth,
            height: baseHeight,
            fillColor: object.maskFillColor || "#ffffff",
          },
          {
            left: currentLeft,
            top: currentTop,
            width: currentWidth,
            height: currentHeight,
            fillColor: object.maskFillColor || "#ffffff",
          },
        ],
        left: currentLeft,
        top: currentTop,
        padX: Number(object.paddingX ?? 0),
        padY: Number(object.paddingY ?? 0),
        inkOffsetX: Number(object.originalInkOffsetX || 0),
        inkOffsetY: Number(object.originalInkOffsetY || 0),
        text: textValue,
        textColor: object.textFillColor || state.textColor,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        charSpacing,
        fontScaleX,
        ascent: clamp(Number(object.originalAscent || 0.82), 0.5, 0.95),
      });
    });
    return operations;
  }

  async function drawVectorTextEditsOnPage(pdfDoc, page, entry, operations, fontCache) {
    if (!operations || !operations.length || !entry || !entry.viewport) {
      return;
    }
    const pageWidth = Number(page.getWidth() || 0);
    const pageHeight = Number(page.getHeight() || 0);
    const sourceWidth = Math.max(Number(entry.viewport.width || 1), 1);
    const sourceHeight = Math.max(Number(entry.viewport.height || 1), 1);
    const scaleX = pageWidth / sourceWidth;
    const scaleY = pageHeight / sourceHeight;
    const drawnEraseRects = new Set();

    operations.forEach((op) => {
      (op.eraseRects || []).forEach((rect) => {
        const x = Number(rect.left || 0) * scaleX;
        const y = pageHeight - (Number(rect.top || 0) + Number(rect.height || 0)) * scaleY;
        const width = Math.max(Number(rect.width || 0) * scaleX, 0.2);
        const height = Math.max(Number(rect.height || 0) * scaleY, 0.2);
        const key = `${Math.round(x * 10)}:${Math.round(y * 10)}:${Math.round(
          width * 10,
        )}:${Math.round(height * 10)}`;
        if (drawnEraseRects.has(key)) {
          return;
        }
        drawnEraseRects.add(key);
        page.drawRectangle({
          x,
          y,
          width,
          height,
          color: parseColorForPdf(rect.fillColor),
          borderWidth: 0,
        });
      });
    });

    for (let index = 0; index < operations.length; index += 1) {
      const op = operations[index];
      const textValue = String(op.text || "");
      if (!textValue.trim()) {
        continue;
      }
      const embeddedFont = await getEmbeddedFontForOperation(pdfDoc, fontCache, op);
      const font = embeddedFont.font;
      const textColor = parseColorForPdf(op.textColor);
      const pxFontSize = Math.max(Number(op.fontSize || 8), 1);
      const drawSize = Math.max(pxFontSize * scaleY, 1);
      const ascent = clamp(Number(op.ascent || 0.82), 0.5, 0.95);
      const inkOffsetX = Number(op.inkOffsetX || 0);
      const inkOffsetY = Number(op.inkOffsetY || 0);
      const drawY =
        pageHeight -
        (Number(op.top || 0) + Number(op.padY || 0) + inkOffsetY + pxFontSize * ascent) * scaleY;
      let drawX = (Number(op.left || 0) + Number(op.padX || 0) + inkOffsetX) * scaleX;
      const tracking = Number(op.charSpacing || 0) / 1000;
      const horizontalScale = clamp(Number(op.fontScaleX || 1), 0.5, 2.2);
      const needsGlyphPlacement =
        Math.abs(tracking) > 0.001 || Math.abs(horizontalScale - 1) > 0.015;

      if (!needsGlyphPlacement) {
        page.drawText(textValue, {
          x: drawX,
          y: drawY,
          size: drawSize,
          font,
          color: textColor,
          lineHeight: drawSize * 1.06,
        });
        continue;
      }

      for (let charIndex = 0; charIndex < textValue.length; charIndex += 1) {
        const glyph = textValue[charIndex];
        page.drawText(glyph, {
          x: drawX,
          y: drawY,
          size: drawSize,
          font,
          color: textColor,
          lineHeight: drawSize * 1.06,
        });
        const glyphAdvance = font.widthOfTextAtSize(glyph, drawSize);
        drawX += (glyphAdvance + tracking * drawSize) * horizontalScale;
      }
    }
  }

  function restoreEntryAfterExport(entry, preparedState) {
    const stateForEntry = preparedState || {};
    const restoreRecords = Array.isArray(stateForEntry.restoreRecords)
      ? stateForEntry.restoreRecords
      : [];
    const tempObjects = Array.isArray(stateForEntry.tempObjects)
      ? stateForEntry.tempObjects
      : [];

    if (tempObjects.length) {
      entry.isRestoring = true;
      tempObjects.forEach((tempObject) => {
        if (entry.fabric.getObjects().includes(tempObject)) {
          entry.fabric.remove(tempObject);
        }
      });
      entry.isRestoring = false;
    }

    restoreRecords.forEach((record) => {
      record.object.visible = record.visible;
    });
    applyToolMode(entry.fabric);
    refreshEditableVisualsForEntry(entry);
    entry.fabric.renderAll();
  }

  function downloadPdfBytes(outputBytes, fileName) {
    if (!outputBytes || !outputBytes.length) {
      throw new Error("Export produced empty PDF bytes.");
    }
    const blob = new Blob([outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName || `${state.currentFileName}-edited.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function bytesToBase64(bytes) {
    const safeBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!safeBytes.length) {
      return "";
    }
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < safeBytes.length; offset += chunkSize) {
      const chunk = safeBytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }

  function base64ToBytes(base64Value) {
    const raw = String(base64Value || "");
    if (!raw) {
      return new Uint8Array();
    }
    const binary = window.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function collectExactBackendTextOps() {
    const operations = [];
    state.pageEntries.forEach((entry) => {
      if (!entry || !entry.fabric) {
        return;
      }
      const sourceWidth = Math.max(Number(entry.viewport && entry.viewport.width ? entry.viewport.width : 1), 1);
      const sourceHeight = Math.max(
        Number(entry.viewport && entry.viewport.height ? entry.viewport.height : 1),
        1,
      );
      entry.fabric.getObjects().forEach((object) => {
        if (!isEditableTextGroup(object)) {
          return;
        }
        const moved = isEditableGroupMoved(object);
        const changed = Boolean(object.hasTextEdit || moved);
        if (!changed) {
          return;
        }
        const nodes = getEditableGroupNodes(object);
        if (!nodes) {
          return;
        }
        const { mask } = nodes;
        const baseLeft = Number(
          typeof object.baseLeft === "number" ? object.baseLeft : object.left || 0,
        );
        const baseTop = Number(
          typeof object.baseTop === "number" ? object.baseTop : object.top || 0,
        );
        const baseWidth = Math.max(getEditableGroupBaseDimension(object, mask, "width"), 2);
        const baseHeight = Math.max(getEditableGroupBaseDimension(object, mask, "height"), 2);
        const movedPoint = getObjectTopLeftOnCanvas(object);
        const currentLeft = Number(movedPoint.x || object.left || 0);
        const currentTop = Number(movedPoint.y || object.top || 0);
        const currentWidth = Math.max(getScaledObjectDimension(mask, "width"), 2);
        const currentHeight = Math.max(getScaledObjectDimension(mask, "height"), 2);
        const textValue = object.isDeletedText
          ? ""
          : object.hasTextEdit
            ? object.editedText || object.originalText || ""
            : object.originalText || "";
        const fontFamily = object.hasTextEdit
          ? object.editFontFamily || object.originalFontFamily || state.fontFamily
          : object.originalFontFamily || state.fontFamily;
        const fontSize = object.hasTextEdit
          ? Number(object.editFontSize || object.originalFontSize || state.fontSize)
          : Number(object.originalFontSize || state.fontSize);
        const fontWeight = object.hasTextEdit
          ? object.editFontWeight || object.originalFontWeight || "400"
          : object.originalFontWeight || "400";
        const fontStyle = object.hasTextEdit
          ? object.editFontStyle || object.originalFontStyle || "normal"
          : object.originalFontStyle || "normal";
        const charSpacing = object.hasTextEdit
          ? Number(
              typeof object.editCharSpacing === "number"
                ? object.editCharSpacing
                : object.originalCharSpacing || 0,
            )
          : Number(object.originalCharSpacing || 0);
        operations.push({
          pageIndex: Number(entry.index || 0),
          sourceWidth,
          sourceHeight,
          originalText: String(object.originalText || ""),
          baseRect: {
            left: baseLeft,
            top: baseTop,
            width: baseWidth,
            height: baseHeight,
          },
          currentRect: {
            left: currentLeft,
            top: currentTop,
            width: currentWidth,
            height: currentHeight,
          },
          padX: Number(object.paddingX ?? 0),
          padY: Number(object.paddingY ?? 0),
          inkOffsetX: Number(object.originalInkOffsetX || 0),
          inkOffsetY: Number(object.originalInkOffsetY || 0),
          text: textValue,
          fontFamily,
          fontSize,
          fontWeight,
          fontStyle,
          charSpacing,
          fontScaleX: clamp(Number(object.fontScaleX || object.originalFontScaleX || 1), 0.5, 2.2),
          ascent: clamp(Number(object.originalAscent || 0.82), 0.5, 0.95),
          textColor: object.textFillColor || state.textColor,
          maskFillColor: object.maskFillColor || "#ffffff",
          strictFit: true,
          microCalibration: true,
        });
      });
    });
    return operations;
  }

  async function refreshExactExportAvailability(forceRefresh) {
    if (!forceRefresh && typeof state.exactExportAvailable === "boolean") {
      return state.exactExportAvailable;
    }
    try {
      const response = await fetch(EXACT_EXPORT_HEALTH_URL, {
        method: "GET",
      });
      const ok = Boolean(response && response.ok);
      state.exactExportAvailable = ok;
      return ok;
    } catch (error) {
      state.exactExportAvailable = false;
      return false;
    }
  }

  async function applyExactTextExportBackend() {
    const textOps = collectExactBackendTextOps();
    if (!textOps.length) {
      return {
        usedBackend: false,
        bytes: state.originalPdfBytes,
      };
    }
    const backendAvailable = await refreshExactExportAvailability(true);
    if (!backendAvailable) {
      return {
        usedBackend: false,
        bytes: state.originalPdfBytes,
      };
    }

    const payload = {
      fileName: state.currentFileName,
      pdfBase64: bytesToBase64(state.originalPdfBytes),
      operations: textOps,
    };
    const response = await fetch(EXACT_EXPORT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Exact export backend failed with status ${response.status}`);
    }
    const data = await response.json();
    const outputBase64 = data && typeof data.pdfBase64 === "string" ? data.pdfBase64 : "";
    if (!outputBase64) {
      throw new Error("Exact export backend returned empty PDF payload.");
    }
    return {
      usedBackend: true,
      bytes: base64ToBytes(outputBase64),
    };
  }

  async function buildEditedPdfBytes() {
    try {
      try {
        const backendResult = await applyExactTextExportBackend();
        if (backendResult.usedBackend) {
          setStatus("Exact text backend applied. Finishing export...");
          return await exportPdfViaOriginal({
            basePdfBytes: backendResult.bytes,
            forceSkipEditableText: true,
            forceDisableVectorText: true,
          });
        }
      } catch (backendError) {
        console.error(backendError);
        state.exactExportAvailable = false;
      }
      return await exportPdfViaOriginal();
    } catch (primaryError) {
      console.error(primaryError);
      setStatus("Primary export failed. Running compatibility export...");
      return exportPdfViaRasterFallback();
    }
  }

  async function splitPdfByRanges() {
    if (!state.pageEntries.length || !state.originalPdfBytes) {
      setStatus("Open a PDF before splitting.", true);
      return;
    }
    if (!state.splitRanges.length) {
      setStatus("Add at least one split range.", true);
      return;
    }
    if (state.beforePreview) {
      setBeforePreview(false);
    }
    closeAllInlineEditors(true);

    try {
      setStatus("Building edited PDF for split...");
      const baseBytes = await buildEditedPdfBytes();
      const sourcePdf = await pdfLib.PDFDocument.load(baseBytes);
      const totalPages = sourcePdf.getPageCount();
      const ranges = state.splitRanges
        .map((range) => sanitizeSplitRange(range.from, range.to, totalPages))
        .filter((range) => Boolean(range));
      if (!ranges.length) {
        setStatus("No valid split ranges.", true);
        return;
      }

      const merge = Boolean(ui.mergeSplitRangesInput && ui.mergeSplitRangesInput.checked);
      if (merge) {
        const outputPdf = await pdfLib.PDFDocument.create();
        for (const range of ranges) {
          for (let page = range.from; page <= range.to; page += 1) {
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [page - 1]);
            outputPdf.addPage(copiedPage);
          }
        }
        const bytes = await outputPdf.save();
        const nameSuffix = ranges.map((range) => `${range.from}-${range.to}`).join("_");
        downloadPdfBytes(bytes, `${state.currentFileName}-split-${nameSuffix}.pdf`);
        setStatus("Split export complete.");
        return;
      }

      for (const range of ranges) {
        const outputPdf = await pdfLib.PDFDocument.create();
        for (let page = range.from; page <= range.to; page += 1) {
          const [copiedPage] = await outputPdf.copyPages(sourcePdf, [page - 1]);
          outputPdf.addPage(copiedPage);
        }
        const bytes = await outputPdf.save();
        downloadPdfBytes(bytes, `${state.currentFileName}-pages-${range.from}-${range.to}.pdf`);
      }
      setStatus(`Split export complete (${ranges.length} files).`);
    } catch (error) {
      console.error(error);
      setStatus("Failed to split PDF.", true);
    }
  }

  async function exportPdfViaOriginal(options) {
    const exportOptions = options || {};
    const basePdfBytes = exportOptions.basePdfBytes || state.originalPdfBytes;
    const forceSkipEditableText = Boolean(exportOptions.forceSkipEditableText);
    const forceDisableVectorText = Boolean(exportOptions.forceDisableVectorText);
    const pdfDoc = await pdfLib.PDFDocument.load(basePdfBytes);
    const pages = pdfDoc.getPages();
    const standardFontCache = {};

    for (let index = 0; index < pages.length; index += 1) {
      const entry = state.pageEntries[index];
      if (!entry || !hasExportableObjects(entry)) {
        continue;
      }

      const useVectorText = state.vectorTextExport && !forceDisableVectorText;
      const vectorTextOps = useVectorText ? collectVectorTextOperations(entry) : [];
      const preparedState = prepareEntryForExport(entry, {
        skipEditableText: forceSkipEditableText || useVectorText,
      });
      try {
        const overlayPng = entry.fabric.toDataURL({
          format: "png",
          multiplier: EXPORT_OVERLAY_MULTIPLIER,
          enableRetinaScaling: false,
        });
        const image = await pdfDoc.embedPng(overlayPng);
        const page = pages[index];
        const size = page.getSize();
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
        });
        if (useVectorText && vectorTextOps.length) {
          await drawVectorTextEditsOnPage(pdfDoc, page, entry, vectorTextOps, standardFontCache);
        }
      } finally {
        restoreEntryAfterExport(entry, preparedState);
      }
    }

    return pdfDoc.save();
  }

  async function exportPdfViaRasterFallback() {
    const pdfDoc = await pdfLib.PDFDocument.create();
    for (let index = 0; index < state.pageEntries.length; index += 1) {
      const entry = state.pageEntries[index];
      if (!entry) {
        continue;
      }
      setStatus(`Exporting page ${index + 1}/${state.pageEntries.length}...`);
      const preparedState = prepareEntryForExport(entry);
      try {
        const mergedCanvas = document.createElement("canvas");
        mergedCanvas.width = entry.backgroundCanvas.width;
        mergedCanvas.height = entry.backgroundCanvas.height;
        const ctx = mergedCanvas.getContext("2d", { alpha: false });
        if (!ctx) {
          continue;
        }
        ctx.drawImage(entry.backgroundCanvas, 0, 0);
        ctx.drawImage(
          entry.fabric.lowerCanvasEl,
          0,
          0,
          entry.backgroundCanvas.width,
          entry.backgroundCanvas.height,
        );

        const mergedPng = mergedCanvas.toDataURL("image/png");
        const image = await pdfDoc.embedPng(mergedPng);
        const viewportScale = Math.max(Number(entry.viewport.scale || state.renderScale || 1), 0.01);
        const pageWidth = Number(entry.viewport.width || entry.backgroundCanvas.width) / viewportScale;
        const pageHeight = Number(entry.viewport.height || entry.backgroundCanvas.height) / viewportScale;
        const page = pdfDoc.addPage([
          pageWidth,
          pageHeight,
        ]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight(),
        });
      } finally {
        restoreEntryAfterExport(entry, preparedState);
      }
    }

    return pdfDoc.save();
  }

  async function exportPdf() {
    if (!state.originalPdfBytes || !state.pageEntries.length) {
      return;
    }
    if (state.beforePreview) {
      setBeforePreview(false);
    }
    closeAllInlineEditors(true);

    try {
      setStatus("Preparing export...");
      const outputBytes = await buildEditedPdfBytes();
      downloadPdfBytes(outputBytes);
      setStatus("Export complete.");
    } catch (error) {
      console.error(error);
      setStatus("Failed to export PDF.", true);
    }
  }

  function applyPropertiesToObject(object) {
    if (!object) {
      return;
    }
    if (isEditableTextGroup(object)) {
      const nodes = getEditableGroupNodes(object);
      if (!nodes) {
        return;
      }
      object.textFillColor = state.textColor;
      nodes.text.set("fill", state.textColor);
      syncEditableTextGeometry(object);
      applyEditableVisualState(object, state.tool === "editText");
      return;
    }

    if ("stroke" in object) {
      object.set("stroke", state.strokeColor);
      object.set("strokeWidth", state.strokeWidth);
    }
    if (
      object.type === "rect" ||
      object.type === "ellipse" ||
      object.type === "triangle" ||
      object.type === "polygon"
    ) {
      object.set("fill", getFillStyle());
    }
    if (
      object.type === "i-text" ||
      object.type === "text" ||
      object.type === "textbox"
    ) {
      object.set("fill", state.textColor);
      object.set("fontSize", state.fontSize);
      object.set("fontFamily", state.fontFamily);
    }
  }

  function applyPropertiesToActiveSelection() {
    const entry = getCurrentEntry();
    if (!entry) {
      return;
    }
    const active = entry.fabric.getActiveObject();
    if (!active || active.isInlineEditor) {
      return;
    }

    if (active.type === "activeSelection") {
      active.getObjects().forEach((object) => {
        applyPropertiesToObject(object);
      });
    } else {
      applyPropertiesToObject(active);
    }

    refreshEditableVisualsForEntry(entry);
    entry.fabric.requestRenderAll();
    saveHistory(entry);
    syncPropertyPanelFromSelection();
  }

  function hookCanvasEvents(entry) {
    entry.fabric.on("object:added", (event) => {
      if (entry.isRestoring || (event.target && event.target.isHelper)) {
        return;
      }
      saveHistory(entry);
      updateUndoRedoButtons();
    });

    entry.fabric.on("object:removed", (event) => {
      if (entry.isRestoring || (event.target && event.target.isHelper)) {
        return;
      }
      saveHistory(entry);
      updateUndoRedoButtons();
    });

    entry.fabric.on("object:modified", () => {
      if (entry.isRestoring) {
        return;
      }
      refreshEditableVisualsForEntry(entry);
      entry.fabric.requestRenderAll();
      saveHistory(entry);
      updateUndoRedoButtons();
      if (entry.index === state.currentPageIndex) {
        syncPropertyPanelFromSelection();
      }
    });

    entry.fabric.on("object:moving", (event) => {
      if (
        entry.index !== state.currentPageIndex ||
        state.tool !== "editText" ||
        entry.isRestoring
      ) {
        return;
      }
      const target = event && event.target ? event.target : null;
      if (isEditableTextGroup(target)) {
        target.lockMovementX = false;
        target.lockMovementY = false;
        target.setCoords();
        refreshEditableVisualsForEntry(entry);
        entry.fabric.requestRenderAll();
        return;
      }
      if (
        target &&
        target.type === "activeSelection" &&
        typeof target.getObjects === "function"
      ) {
        target.setCoords();
        const editableObjects = target.getObjects().filter((object) => isEditableTextGroup(object));
        if (!editableObjects.length) {
          return;
        }
        editableObjects.forEach((object) => {
          object.lockMovementX = false;
          object.lockMovementY = false;
          object.setCoords();
        });
        refreshEditableVisualsForEntry(entry);
        entry.fabric.requestRenderAll();
      }
      if (!target) {
        return;
      }
    });

    entry.fabric.on("object:scaling", (event) => {
      if (
        entry.index !== state.currentPageIndex ||
        state.tool !== "editText" ||
        entry.isRestoring
      ) {
        return;
      }
      const target = event && event.target ? event.target : null;
      if (!isEditableTextGroup(target)) {
        return;
      }
      const nodes = getEditableGroupNodes(target);
      if (!nodes) {
        return;
      }
      const { mask } = nodes;
      const width = Math.max(
        Number(mask.width || 0) * Math.max(Number(target.scaleX || 1), 0.2),
        6,
      );
      const height = Math.max(
        Number(mask.height || 0) * Math.max(Number(target.scaleY || 1), 0.2),
        10,
      );
      mask.set({
        width,
        height,
        scaleX: 1,
        scaleY: 1,
      });
      target.set({
        scaleX: 1,
        scaleY: 1,
      });
      syncEditableTextGeometry(target);
      refreshEditableVisualsForEntry(entry);
      target.setCoords();
      entry.fabric.requestRenderAll();
    });

    entry.fabric.on("path:created", () => {
      if (entry.isRestoring) {
        return;
      }
      saveHistory(entry);
      updateUndoRedoButtons();
    });

    entry.fabric.on("selection:created", () => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      syncPropertyPanelFromSelection();
    });

    entry.fabric.on("selection:updated", () => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      syncPropertyPanelFromSelection();
    });

    entry.fabric.on("selection:cleared", () => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      syncPropertyPanelFromSelection();
    });

    entry.fabric.on("mouse:dblclick", (options) => {
      if (entry.index !== state.currentPageIndex || state.tool !== "editText") {
        return;
      }
      const target = options.target;
      if (isEditableTextGroup(target)) {
        openInlineEditor(entry, target);
      }
    });

    entry.fabric.on("mouse:down", (options) => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      const target = options && options.target ? options.target : null;
      const pointer = getPointer(entry, options);

      if (state.tool === "editText") {
        if (entry.inlineEditor) {
          const editorObject = entry.inlineEditor.editor;
          const clickedInlineEditor = target && target === editorObject;
          if (!clickedInlineEditor) {
            closeInlineEditor(entry, true);
          }
        }
        if (isEditableTextGroup(target)) {
          target.lockMovementX = false;
          target.lockMovementY = false;
          target.hasBorders = true;
          target.borderColor = "#1f74e8";
          target.borderDashArray = [6, 4];
          entry.editDrag = {
            target,
            pointerX: Number(pointer.x || 0),
            pointerY: Number(pointer.y || 0),
            startLeft: Number(target.left || 0),
            startTop: Number(target.top || 0),
            moved: false,
          };
          entry.fabric.setActiveObject(target);
          entry.fabric.requestRenderAll();
        } else {
          entry.editDrag = null;
        }
        return;
      }
      if (
        state.tool === "select" ||
        state.tool === "draw"
      ) {
        return;
      }
      closeInlineEditor(entry, true);

      if (state.tool === "text") {
        createTextObject(entry, pointer);
        return;
      }

      entry.dragStart = pointer;
      entry.pendingObject = beginShape(pointer);
      if (entry.pendingObject) {
        entry.fabric.add(entry.pendingObject);
      }
    });

    entry.fabric.on("mouse:move", (options) => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      if (state.tool === "editText" && entry.editDrag && isEditableTextGroup(entry.editDrag.target)) {
        const target = entry.editDrag.target;
        const pointer = getPointer(entry, options);
        const dx = Number(pointer.x || 0) - Number(entry.editDrag.pointerX || 0);
        const dy = Number(pointer.y || 0) - Number(entry.editDrag.pointerY || 0);
        const isMoveNow = Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2;
        if (isMoveNow) {
          entry.editDrag.moved = true;
        }
        target.set({
          left: Number(entry.editDrag.startLeft || 0) + dx,
          top: Number(entry.editDrag.startTop || 0) + dy,
        });
        target.setCoords();
        if (entry.editDrag.moved) {
          refreshEditableVisualsForEntry(entry);
        }
        entry.fabric.requestRenderAll();
        return;
      }
      if (!entry.pendingObject || !entry.dragStart) {
        return;
      }
      updateShape(entry, getPointer(entry, options));
    });

    entry.fabric.on("mouse:up", () => {
      if (entry.index !== state.currentPageIndex) {
        return;
      }
      if (state.tool === "editText" && entry.editDrag) {
        const moved = Boolean(entry.editDrag.moved);
        entry.editDrag = null;
        if (moved) {
          refreshEditableVisualsForEntry(entry);
          entry.fabric.requestRenderAll();
          saveHistory(entry);
          updateUndoRedoButtons();
        }
        return;
      }
      if (!entry.pendingObject || !entry.dragStart) {
        return;
      }
      finishShape(entry);
    });
  }

  function createThumbnail(index, backgroundCanvas) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thumbnail-item";

    const thumbCanvas = document.createElement("canvas");
    const maxWidth = 180;
    const scale = maxWidth / backgroundCanvas.width;
    thumbCanvas.width = maxWidth;
    thumbCanvas.height = Math.round(backgroundCanvas.height * scale);
    const ctx = thumbCanvas.getContext("2d");
    ctx.drawImage(backgroundCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

    const label = document.createElement("span");
    label.className = "thumb-label";
    label.textContent = t("thumb_page", { index: index + 1 });

    button.appendChild(thumbCanvas);
    button.appendChild(label);
    button.addEventListener("click", () => {
      showPage(index);
    });
    ui.thumbnailList.appendChild(button);
  }

  function highlightCurrentThumbnail() {
    const thumbs = Array.from(ui.thumbnailList.querySelectorAll(".thumbnail-item"));
    thumbs.forEach((thumb, index) => {
      thumb.classList.toggle("active", index === state.currentPageIndex);
    });
  }

  function showPage(index) {
    if (index < 0 || index >= state.pageEntries.length) {
      return;
    }
    closeAllInlineEditors(true);

    state.currentPageIndex = index;
    state.pageEntries.forEach((entry, entryIndex) => {
      entry.wrapper.style.display = entryIndex === index ? "block" : "none";
      if (entryIndex === index && entry.fabric && typeof entry.fabric.calcOffset === "function") {
        entry.fabric.calcOffset();
      }
    });

    highlightCurrentThumbnail();
    updatePagePositionLabel();
    updatePageButtons();
    updateUndoRedoButtons();
    applyBeforePreviewToEntry(getCurrentEntry());
    syncPropertyPanelFromSelection();
    setStatus(`Viewing page ${index + 1}`);
  }

  async function loadPdf(file) {
    try {
      setStatus("Reading PDF...");
      const bytes = new Uint8Array(await file.arrayBuffer());
      clearWorkspace();

      state.originalPdfBytes = bytes;
      state.currentFileName = normalizeFileName(file.name);
      state.pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
      state.renderScale = await determineAutoRenderScale(state.pdfDoc);
      state.pageZoom = 1;
      updateZoomControls();

      const totalPages = state.pdfDoc.numPages;
      ui.pageCountLabel.textContent = t("page_count", { count: totalPages });
      state.splitRanges = [];
      if (ui.splitFromInput) {
        ui.splitFromInput.value = "1";
      }
      if (ui.splitToInput) {
        ui.splitToInput.value = String(totalPages);
      }
      syncSplitInputBounds();
      renderSplitRanges();

      for (let index = 0; index < totalPages; index += 1) {
        const pageNumber = index + 1;
        setStatus(`Rendering page ${pageNumber}/${totalPages}...`);

        const page = await state.pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: state.renderScale });

        const wrapper = document.createElement("div");
        wrapper.className = "pdf-page";
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;

        const backgroundCanvas = document.createElement("canvas");
        backgroundCanvas.className = "bg-canvas";
        backgroundCanvas.width = viewport.width;
        backgroundCanvas.height = viewport.height;

        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.className = "draw-canvas";
        overlayCanvas.width = viewport.width;
        overlayCanvas.height = viewport.height;

        wrapper.appendChild(backgroundCanvas);
        wrapper.appendChild(overlayCanvas);
        ui.pageStage.appendChild(wrapper);

        const context = backgroundCanvas.getContext("2d", { alpha: false });
        await page.render({ canvasContext: context, viewport }).promise;

        const fabricCanvas = new fabricLib.Canvas(overlayCanvas, {
          preserveObjectStacking: true,
          selection: true,
          stopContextMenu: true,
          enableRetinaScaling: false,
        });
        fabricCanvas.setWidth(viewport.width);
        fabricCanvas.setHeight(viewport.height);
        applyDrawingOptions(fabricCanvas);

        const entry = {
          index,
          wrapper,
          backgroundCanvas,
          viewport,
          fabric: fabricCanvas,
          dragStart: null,
          pendingObject: null,
          editDrag: null,
          history: [],
          historyIndex: -1,
          isRestoring: false,
          inlineEditor: null,
          pdfTextReady: false,
          ocrReady: false,
          ocrLanguages: {},
        };

        applyZoomToEntry(entry);
        hookCanvasEvents(entry);
        state.pageEntries.push(entry);
        createThumbnail(index, backgroundCanvas);
        saveHistory(entry);
      }

      ui.dropHint.classList.add("hidden");
      updateActionButtons();
      updatePageButtons();
      applyToolToAllPages();
      applyZoomToAllPages();
      showPage(0);
      setStatus(`Loaded ${totalPages} pages.`);
    } catch (error) {
      console.error(error);
      setStatus("Could not open this PDF.", true);
    }
  }

  function setupPropertyInputs() {
    ui.strokeColorInput.addEventListener("change", (event) => {
      state.strokeColor = event.target.value;
      applyToolToAllPages();
      applyPropertiesToActiveSelection();
    });

    ui.fillColorInput.addEventListener("change", (event) => {
      state.fillColor = event.target.value;
      applyPropertiesToActiveSelection();
    });

    ui.fillOpacityInput.addEventListener("input", (event) => {
      state.fillOpacity = Number(event.target.value);
      applyPropertiesToActiveSelection();
    });

    ui.textColorInput.addEventListener("change", (event) => {
      state.textColor = event.target.value;
      applyToolToAllPages();
      applyPropertiesToActiveSelection();
    });

    ui.fontFamilySelect.addEventListener("change", (event) => {
      state.fontFamily = event.target.value;
      applyPropertiesToActiveSelection();
    });

    ui.strokeWidthInput.addEventListener("input", (event) => {
      state.strokeWidth = Number(event.target.value);
      applyToolToAllPages();
      applyPropertiesToActiveSelection();
    });

    ui.fontSizeInput.addEventListener("input", (event) => {
      state.fontSize = Number(event.target.value);
      applyPropertiesToActiveSelection();
    });

    if (ui.letterSpacingInput) {
      ui.letterSpacingInput.addEventListener("input", (event) => {
        applyLetterSpacingToSelection(event.target.value);
      });
    }
    if (ui.autoMatchTextBtn) {
      ui.autoMatchTextBtn.addEventListener("click", autoMatchAllEditableText);
    }
    if (ui.vectorTextExportInput) {
      ui.vectorTextExportInput.checked = Boolean(state.vectorTextExport);
      ui.vectorTextExportInput.addEventListener("change", (event) => {
        state.vectorTextExport = Boolean(event.target.checked);
      });
    }
  }

  function setupDragDrop() {
    function hasFileDrag(event) {
      const dataTransfer = event && event.dataTransfer ? event.dataTransfer : null;
      if (!dataTransfer) {
        return false;
      }
      const types = Array.from(dataTransfer.types || []);
      if (types.includes("Files") || types.includes("public.file-url")) {
        return true;
      }
      return Number((dataTransfer.files && dataTransfer.files.length) || 0) > 0;
    }

    function pickPdfFile(dataTransfer) {
      const files = Array.from((dataTransfer && dataTransfer.files) || []);
      if (!files.length) {
        return null;
      }
      const byMime = files.find((file) => file && file.type === "application/pdf");
      if (byMime) {
        return byMime;
      }
      return files.find((file) => file && /\.pdf$/i.test(String(file.name || ""))) || null;
    }

    function hideDropHintWhenReady() {
      if (state.pageEntries.length) {
        ui.dropHint.classList.add("hidden");
      }
    }

    function onDragEnterOrOver(event) {
      if (!hasFileDrag(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      ui.dropHint.classList.remove("hidden");
    }

    function onDragLeave(event) {
      if (!hasFileDrag(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hideDropHintWhenReady();
    }

    function onDrop(event) {
      if (!hasFileDrag(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hideDropHintWhenReady();

      const file = pickPdfFile(event.dataTransfer);
      if (!file) {
        setStatus("Please drop a valid PDF file.", true);
        return;
      }
      loadPdf(file);
    }

    [ui.dropHint, ui.stageScroller, ui.pageStage, document.body].forEach((target) => {
      if (!target) {
        return;
      }
      target.addEventListener("dragenter", onDragEnterOrOver);
      target.addEventListener("dragover", onDragEnterOrOver);
      target.addEventListener("dragleave", onDragLeave);
      target.addEventListener("drop", onDrop);
    });
  }

  function setupKeyboardShortcuts() {
    function nudgeEditableSelection(entry, dx, dy) {
      if (!entry || (dx === 0 && dy === 0)) {
        return 0;
      }
      const selected = entry.fabric
        .getActiveObjects()
        .filter((object) => isEditableTextGroup(object));
      if (!selected.length) {
        return 0;
      }

      entry.fabric.discardActiveObject();
      selected.forEach((object) => {
        object.set({
          left: Number(object.left || 0) + dx,
          top: Number(object.top || 0) + dy,
        });
        object.setCoords();
      });
      refreshEditableVisualsForEntry(entry);

      if (selected.length === 1) {
        entry.fabric.setActiveObject(selected[0]);
      } else {
        const selection = new fabricLib.ActiveSelection(selected, {
          canvas: entry.fabric,
        });
        entry.fabric.setActiveObject(selection);
      }

      entry.fabric.requestRenderAll();
      saveHistory(entry);
      updateUndoRedoButtons();
      return selected.length;
    }

    document.addEventListener("keydown", (event) => {
      const entry = getCurrentEntry();
      const active = entry ? entry.fabric.getActiveObject() : null;

      if (active && active.isInlineEditor && active.isEditing) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          closeInlineEditor(entry, true);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeInlineEditor(entry, true);
          return;
        }
        return;
      }
      if (active && active.isEditing) {
        return;
      }
      if (isInputFocused(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (meta && key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if ((meta && key === "z") || (meta && key === "y")) {
        event.preventDefault();
        if (key === "z") {
          undo();
        } else {
          redo();
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedObject();
        return;
      }

      if (
        state.tool === "editText" &&
        entry &&
        !meta &&
        !event.altKey &&
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight")
      ) {
        const step = event.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowUp") {
          dy = -step;
        } else if (event.key === "ArrowDown") {
          dy = step;
        } else if (event.key === "ArrowLeft") {
          dx = -step;
        } else if (event.key === "ArrowRight") {
          dx = step;
        }
        const movedCount = nudgeEditableSelection(entry, dx, dy);
        if (movedCount > 0) {
          event.preventDefault();
          setStatus(`Moved ${movedCount} text box${movedCount > 1 ? "es" : ""}.`);
          return;
        }
      }

      if (event.key === "Enter" && state.tool === "editText") {
        if (entry && isEditableTextGroup(active)) {
          event.preventDefault();
          openInlineEditor(entry, active);
        }
        return;
      }
      if (event.key === "Escape") {
        closeAllInlineEditors(true);
        return;
      }

      if (key === "v") {
        setTool("select");
      } else if (key === "d") {
        setTool("draw");
      } else if (key === "t") {
        setTool("text");
      } else if (key === "r") {
        setTool("editText");
      } else if (key === "o") {
        runOcr();
      }
    });
  }

  function bindEvents() {
    if (ui.langToggleBtn) {
      ui.langToggleBtn.addEventListener("click", toggleLanguage);
    }
    ui.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      if (file.type !== "application/pdf") {
        setStatus("Please choose a PDF file.", true);
        return;
      }
      loadPdf(file);
      ui.fileInput.value = "";
    });

    ui.ocrLangSelect.addEventListener("change", (event) => {
      state.ocrLanguage = event.target.value;
    });
    ui.ocrBtn.addEventListener("click", runOcr);
    ui.exportBtn.addEventListener("click", exportPdf);
    ui.prevPageBtn.addEventListener("click", () => {
      showPage(state.currentPageIndex - 1);
    });
    ui.nextPageBtn.addEventListener("click", () => {
      showPage(state.currentPageIndex + 1);
    });
    ui.undoBtn.addEventListener("click", undo);
    ui.redoBtn.addEventListener("click", redo);
    ui.clearPageBtn.addEventListener("click", clearCurrentPage);
    if (ui.beforeAfterBtn) {
      ui.beforeAfterBtn.addEventListener("click", () => {
        setBeforePreview(!state.beforePreview);
      });
    }
    if (ui.zoomOutBtn) {
      ui.zoomOutBtn.addEventListener("click", () => {
        nudgePageZoom(-1);
      });
    }
    if (ui.zoomInBtn) {
      ui.zoomInBtn.addEventListener("click", () => {
        nudgePageZoom(1);
      });
    }
    if (ui.zoomResetBtn) {
      ui.zoomResetBtn.addEventListener("click", () => {
        setPageZoomFromPercent(100, false);
      });
    }
    if (ui.zoomFitBtn) {
      ui.zoomFitBtn.addEventListener("click", fitPageToViewportWidth);
    }
    if (ui.zoomRangeInput) {
      ui.zoomRangeInput.addEventListener("input", (event) => {
        setPageZoomFromPercent(event.target.value, true);
      });
      ui.zoomRangeInput.addEventListener("change", (event) => {
        setPageZoomFromPercent(event.target.value, false);
      });
    }
    ui.deleteSelectionBtn.addEventListener("click", deleteSelectedObject);
    ui.duplicateSelectionBtn.addEventListener("click", duplicateSelectedObject);
    ui.bringFrontBtn.addEventListener("click", bringSelectionToFront);
    ui.sendBackBtn.addEventListener("click", sendSelectionToBack);
    if (ui.addSplitRangeBtn) {
      ui.addSplitRangeBtn.addEventListener("click", addSplitRange);
    }
    if (ui.clearSplitRangesBtn) {
      ui.clearSplitRangesBtn.addEventListener("click", clearSplitRanges);
    }
    if (ui.splitPdfBtn) {
      ui.splitPdfBtn.addEventListener("click", splitPdfByRanges);
    }
    if (ui.splitSectionBtn) {
      ui.splitSectionBtn.addEventListener("click", focusSplitPanelSection);
    }
    if (ui.splitFromInput) {
      ui.splitFromInput.addEventListener("input", syncSplitInputBounds);
      ui.splitFromInput.addEventListener("change", syncSplitInputBounds);
      ui.splitFromInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addSplitRange();
        }
      });
    }
    if (ui.splitToInput) {
      ui.splitToInput.addEventListener("input", syncSplitInputBounds);
      ui.splitToInput.addEventListener("change", syncSplitInputBounds);
      ui.splitToInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addSplitRange();
        }
      });
    }

    ui.toolButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setTool(button.dataset.tool);
      });
    });

    setupPropertyInputs();
    setupDragDrop();
    setupKeyboardShortcuts();
  }

  function initialize() {
    if (ui.fontFamilySelect) {
      state.fontFamily = ui.fontFamilySelect.value;
    }
    if (ui.ocrLangSelect) {
      state.ocrLanguage = ui.ocrLangSelect.value;
    }
    if (ui.vectorTextExportInput) {
      state.vectorTextExport = Boolean(ui.vectorTextExportInput.checked);
    }
    syncSplitInputBounds();
    renderSplitRanges();
    updateZoomControls();
    setLetterSpacingUiValue(0);
    bindEvents();
    applyLanguageUI();
    updateToolButtonState();
    updateActionButtons();
    updateFontInspector();
    refreshExactExportAvailability(true).catch(() => {
      state.exactExportAvailable = false;
    });
    setStatus("Ready. Open a PDF to start editing.");
  }

  initialize();
})();
