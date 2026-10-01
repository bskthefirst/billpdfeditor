(function initPdfRasterPage() {
  "use strict";

  const pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  const JSZip = window.JSZip;
  const STORAGE_LANGUAGE_KEY = "stickerPdfLabLang";

  if (!pdfjsLib) {
    window.alert("PDF.js did not load.");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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
      brand_subtitle: "Convert PDF pages into PNG or JPG files.",
      back_editor: "⬅ Back to Editor",
      heading: "🖼️ PNG/JPG Converter",
      note: "Upload a PDF and export all pages as PNG or JPG.",
      drop_hint: "Drop PDF here or click to upload",
      format: "Format",
      page: "Page",
      jpg_quality: "JPG Quality",
      convert: "⚡ Convert Pages",
      download: "⬇ Download Image",
      download_all_zip: "📦 Download All ZIP",
      file: "File",
      pages: "Pages",
      meta_format: "Format",
      meta_page: "Selected Page",
      preview: "Preview",
      preview_pages: "Converted Pages",
      ready: "Ready.",
      choose_pdf: "Please choose a valid PDF file.",
      loading: "Loading PDF...",
      load_fail: "Could not open this PDF.",
      converting: "Converting page {current}/{total}...",
      convert_done: "Conversion complete. Image download ready.",
      convert_fail: "Failed to convert PDF.",
      no_pdf: "Open a PDF first.",
      no_images: "Convert pages first.",
      choose_page: "Choose a page first.",
      download_ready: "Image downloaded.",
      download_zip_ready: "ZIP downloaded.",
      jpg_quality_value: "{value}",
      pages_value: "{count}",
      page_option: "Page {page}",
    },
    ko: {
      brand_title: "스티커 PDF 랩",
      brand_subtitle: "PDF 페이지를 PNG 또는 JPG 파일로 변환합니다.",
      back_editor: "⬅ 편집기로 돌아가기",
      heading: "🖼️ PNG/JPG 변환기",
      note: "PDF를 업로드하고 모든 페이지를 PNG 또는 JPG로 내보내세요.",
      drop_hint: "여기에 PDF를 놓거나 클릭해서 업로드",
      format: "포맷",
      page: "페이지",
      jpg_quality: "JPG 품질",
      convert: "⚡ 페이지 변환",
      download: "⬇ 이미지 다운로드",
      download_all_zip: "📦 전체 ZIP 다운로드",
      file: "파일",
      pages: "페이지",
      meta_format: "포맷",
      meta_page: "선택 페이지",
      preview: "미리보기",
      preview_pages: "변환된 페이지",
      ready: "준비됨.",
      choose_pdf: "올바른 PDF 파일을 선택해주세요.",
      loading: "PDF를 불러오는 중...",
      load_fail: "PDF를 열 수 없습니다.",
      converting: "{current}/{total} 페이지 변환 중...",
      convert_done: "변환 완료. 이미지 다운로드 준비됨.",
      convert_fail: "PDF 변환 실패.",
      no_pdf: "먼저 PDF를 열어주세요.",
      no_images: "먼저 페이지를 변환하세요.",
      choose_page: "먼저 페이지를 선택해주세요.",
      download_ready: "이미지 다운로드 완료.",
      download_zip_ready: "ZIP 다운로드 완료.",
      jpg_quality_value: "{value}",
      pages_value: "{count}",
      page_option: "{page} 페이지",
    },
  };

  const state = {
    language: initialLanguage,
    file: null,
    pdfDoc: null,
    outputItems: [],
    converting: false,
  };

  const ui = {
    langToggleBtn: document.getElementById("langToggleBtn"),
    brandTitle: document.getElementById("brandTitle"),
    brandSubtitle: document.getElementById("brandSubtitle"),
    backEditorBtn: document.getElementById("backEditorBtn"),
    heading: document.getElementById("rasterHeading"),
    note: document.getElementById("rasterNote"),
    dropzone: document.getElementById("rasterDropzone"),
    dropHint: document.getElementById("rasterDropHint"),
    fileInput: document.getElementById("rasterFileInput"),
    formatLabel: document.getElementById("formatLabel"),
    formatSelect: document.getElementById("formatSelect"),
    pageLabel: document.getElementById("pageLabel"),
    pageSelect: document.getElementById("pageSelect"),
    jpgQualityLabel: document.getElementById("jpgQualityLabel"),
    jpgQualityInput: document.getElementById("jpgQualityInput"),
    jpgQualityValue: document.getElementById("jpgQualityValue"),
    convertBtn: document.getElementById("convertBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    downloadAllBtn: document.getElementById("downloadAllBtn"),
    metaFileLabel: document.getElementById("metaFileLabel"),
    metaFileValue: document.getElementById("metaFileValue"),
    metaPagesLabel: document.getElementById("metaPagesLabel"),
    metaPagesValue: document.getElementById("metaPagesValue"),
    metaFormatLabel: document.getElementById("metaFormatLabel"),
    metaFormatValue: document.getElementById("metaFormatValue"),
    metaPageLabel: document.getElementById("metaPageLabel"),
    metaPageValue: document.getElementById("metaPageValue"),
    previewHeading: document.getElementById("previewHeading"),
    pagePreviewTitle: document.getElementById("pagePreviewTitle"),
    previewGrid: document.getElementById("previewGrid"),
    statusLine: document.getElementById("rasterStatusLine"),
  };

  function t(key, vars) {
    const dictionary = I18N[state.language] || I18N.en;
    const template = dictionary[key] || I18N.en[key] || key;
    if (!vars) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (_, token) =>
      Object.prototype.hasOwnProperty.call(vars, token) ? String(vars[token]) : "",
    );
  }

  function setStatus(message, isError) {
    ui.statusLine.textContent = message;
    ui.statusLine.style.color = isError ? "#c62828" : "";
  }

  function revokeOutputUrls() {
    state.outputItems.forEach((item) => {
      if (item && item.url) {
        URL.revokeObjectURL(item.url);
      }
    });
    state.outputItems = [];
  }

  function updateButtons() {
    const hasPdf = Boolean(state.pdfDoc);
    ui.convertBtn.disabled = !hasPdf || state.converting;
    ui.downloadBtn.disabled = !state.outputItems.length || state.converting;
    ui.downloadAllBtn.disabled = !state.outputItems.length || state.converting;
    ui.pageSelect.disabled = !state.outputItems.length || state.converting;
  }

  function updateMeta() {
    ui.metaFileValue.textContent = state.file ? state.file.name : "-";
    ui.metaPagesValue.textContent = state.pdfDoc ? t("pages_value", { count: state.pdfDoc.numPages }) : "-";
    ui.metaFormatValue.textContent = String(ui.formatSelect.value || "png").toUpperCase();
    const pageValue = Number(ui.pageSelect.value || 1);
    ui.metaPageValue.textContent = state.outputItems.length
      ? t("page_option", { page: pageValue })
      : "-";
  }

  function rebuildPageOptions() {
    ui.pageSelect.innerHTML = "";
    state.outputItems.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.page);
      option.textContent = t("page_option", { page: item.page });
      ui.pageSelect.appendChild(option);
    });
    if (state.outputItems.length) {
      ui.pageSelect.value = String(state.outputItems[0].page);
    }
  }

  function renderPreviews() {
    ui.previewGrid.innerHTML = "";
    state.outputItems.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "raster-preview-item";
      const image = document.createElement("img");
      image.src = item.url;
      image.alt = `Page ${index + 1}`;
      const label = document.createElement("span");
      label.textContent = `Page ${index + 1}`;
      card.appendChild(image);
      card.appendChild(label);
      ui.previewGrid.appendChild(card);
    });
  }

  function clearConvertedOutputs() {
    revokeOutputUrls();
    ui.pageSelect.innerHTML = "";
    renderPreviews();
    updateButtons();
    updateMeta();
  }

  async function loadPdf(file) {
    if (!file || file.type !== "application/pdf") {
      setStatus(t("choose_pdf"), true);
      return;
    }
    revokeOutputUrls();
    renderPreviews();
    updateButtons();
    setStatus(t("loading"));
    try {
      const buffer = await file.arrayBuffer();
      state.pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
      state.file = file;
      updateMeta();
      updateButtons();
      setStatus(t("ready"));
    } catch (error) {
      console.error(error);
      state.pdfDoc = null;
      state.file = null;
      updateMeta();
      updateButtons();
      setStatus(t("load_fail"), true);
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to build image blob."));
          }
        },
        type,
        quality,
      );
    });
  }

  async function convertPages() {
    if (!state.pdfDoc) {
      setStatus(t("no_pdf"), true);
      return;
    }
    state.converting = true;
    updateButtons();
    revokeOutputUrls();
    renderPreviews();

    const format = String(ui.formatSelect.value || "png").toLowerCase();
    const imageType = format === "jpg" ? "image/jpeg" : "image/png";
    const extension = format === "jpg" ? "jpg" : "png";
    const quality = Number(ui.jpgQualityInput.value || 95) / 100;
    const scale = 1;

    try {
      for (let pageNumber = 1; pageNumber <= state.pdfDoc.numPages; pageNumber += 1) {
        setStatus(t("converting", { current: pageNumber, total: state.pdfDoc.numPages }));
        const page = await state.pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: format !== "jpg" });
        canvas.width = Math.max(Math.round(viewport.width), 1);
        canvas.height = Math.max(Math.round(viewport.height), 1);
        if (format === "jpg") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await canvasToBlob(canvas, imageType, quality);
        const url = URL.createObjectURL(blob);
        state.outputItems.push({
          page: pageNumber,
          name: `page-${String(pageNumber).padStart(3, "0")}.${extension}`,
          blob,
          url,
        });
      }
      rebuildPageOptions();
      renderPreviews();
      updateButtons();
      updateMeta();
      setStatus(t("convert_done"));
    } catch (error) {
      console.error(error);
      setStatus(t("convert_fail"), true);
    } finally {
      state.converting = false;
      updateButtons();
    }
  }

  async function downloadImage() {
    if (!state.outputItems.length) {
      setStatus(t("no_images"), true);
      return;
    }
    const selectedPage = Number(ui.pageSelect.value || 0);
    if (!selectedPage) {
      setStatus(t("choose_page"), true);
      return;
    }
    const selected = state.outputItems.find((item) => item.page === selectedPage);
    if (!selected) {
      setStatus(t("choose_page"), true);
      return;
    }
    const baseName = ((state.file ? state.file.name : "converted").replace(/\.pdf$/i, "").trim() ||
      "converted");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(selected.blob);
    link.download = `${baseName}-page-${String(selected.page).padStart(3, "0")}.${String(
      ui.formatSelect.value || "png",
    ).toLowerCase()}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setStatus(t("download_ready"));
  }

  async function downloadAllZip() {
    if (!state.outputItems.length) {
      setStatus(t("no_images"), true);
      return;
    }
    if (!JSZip) {
      setStatus("JSZip not available.", true);
      return;
    }
    const baseName = ((state.file ? state.file.name : "converted").replace(/\.pdf$/i, "").trim() ||
      "converted");
    const zip = new JSZip();
    state.outputItems.forEach((item) => {
      zip.file(item.name, item.blob);
    });
    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = `${baseName}-${String(ui.formatSelect.value || "png").toLowerCase()}-all-pages.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setStatus(t("download_zip_ready"));
  }

  function applyLanguageUI() {
    document.documentElement.lang = state.language === "ko" ? "ko" : "en";
    ui.langToggleBtn.dataset.lang = state.language;
    ui.brandTitle.textContent = t("brand_title");
    ui.brandSubtitle.textContent = t("brand_subtitle");
    ui.backEditorBtn.textContent = t("back_editor");
    ui.heading.textContent = t("heading");
    ui.note.textContent = t("note");
    ui.dropHint.textContent = t("drop_hint");
    ui.formatLabel.textContent = t("format");
    ui.pageLabel.textContent = t("page");
    ui.jpgQualityLabel.textContent = t("jpg_quality");
    ui.convertBtn.textContent = t("convert");
    ui.downloadBtn.textContent = t("download");
    ui.downloadAllBtn.textContent = t("download_all_zip");
    ui.metaFileLabel.textContent = t("file");
    ui.metaPagesLabel.textContent = t("pages");
    ui.metaFormatLabel.textContent = t("meta_format");
    ui.metaPageLabel.textContent = t("meta_page");
    ui.previewHeading.textContent = t("preview");
    ui.pagePreviewTitle.textContent = t("preview_pages");
    rebuildPageOptions();
    if (!state.converting && !state.pdfDoc && !state.outputItems.length) {
      setStatus(t("ready"));
    }
  }

  function toggleLanguage() {
    state.language = state.language === "ko" ? "en" : "ko";
    try {
      window.localStorage.setItem(STORAGE_LANGUAGE_KEY, state.language);
    } catch (error) {
      // Ignore storage failures.
    }
    applyLanguageUI();
    updateMeta();
  }

  function bindDropzone() {
    const onDragOver = (event) => {
      event.preventDefault();
      ui.dropzone.classList.add("active");
    };
    const onDragLeave = (event) => {
      event.preventDefault();
      ui.dropzone.classList.remove("active");
    };
    const onDrop = (event) => {
      event.preventDefault();
      ui.dropzone.classList.remove("active");
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      loadPdf(file);
    };
    ui.dropzone.addEventListener("dragover", onDragOver);
    ui.dropzone.addEventListener("dragleave", onDragLeave);
    ui.dropzone.addEventListener("drop", onDrop);
  }

  function bindEvents() {
    ui.langToggleBtn.addEventListener("click", toggleLanguage);
    ui.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        loadPdf(file);
      }
      ui.fileInput.value = "";
    });
    ui.formatSelect.addEventListener("change", () => {
      clearConvertedOutputs();
      setStatus(t("ready"));
    });
    ui.pageSelect.addEventListener("change", updateMeta);
    ui.jpgQualityInput.addEventListener("input", () => {
      ui.jpgQualityValue.textContent = t("jpg_quality_value", {
        value: ui.jpgQualityInput.value,
      });
    });
    ui.convertBtn.addEventListener("click", convertPages);
    ui.downloadBtn.addEventListener("click", downloadImage);
    ui.downloadAllBtn.addEventListener("click", downloadAllZip);
    bindDropzone();
  }

  function initialize() {
    ui.jpgQualityValue.textContent = t("jpg_quality_value", { value: ui.jpgQualityInput.value });
    bindEvents();
    applyLanguageUI();
    updateMeta();
    updateButtons();
  }

  initialize();
})();
