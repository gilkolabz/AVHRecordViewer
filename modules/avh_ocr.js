export const register = (navi) => {
  // TEMP (Phase 5b): vendored Tesseract on flowerpot — cross-origin Worker blocked on foobarch.net.
  // Phase 7 MUST undo: remove lib/tesseract vendoring; use navi worker pipe + controlled asset delivery.
  // See GOALS.md Phase 7 — "OCR vendor workaround (UNDO)".
  const LIB_BASE = "/torus/devops/AVHRecordViewer/lib/tesseract";
  const CORE_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0";
  const LANG_CDN = "https://tessdata.projectnaptha.com/4.0.0";

  let workerPromise = null;
  let status = {
    state: "idle",
    detail: "Module loaded — worker starts on first use",
    lastError: null,
    progress: null,
  };
  const progressListeners = new Set();

  function formatError(err) {
    if (!err) return "unknown error";
    if (typeof err === "string") return err;
    if (err instanceof Error && err.message) return err.message;
    if (err.message) return String(err.message);
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function setStatus(state, detail, lastError = null) {
    status = {
      ...status,
      state,
      detail,
      lastError: lastError ? formatError(lastError) : null,
    };
  }

  function emitProgress(message) {
    for (const fn of progressListeners) {
      try {
        fn(message);
      } catch {
        /* ignore */
      }
    }
  }

  async function loadTesseractScript() {
    if (globalThis.Tesseract?.createWorker) return globalThis.Tesseract;
    setStatus("loading", "Loading Tesseract.js from hostpark…");
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-avh_record_viewer-tesseract="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Tesseract.js script failed")), {
          once: true,
        });
        if (globalThis.Tesseract?.createWorker) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = `${LIB_BASE}/tesseract.min.js`;
      script.async = true;
      script.dataset.avh_record_viewerTesseract = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load Tesseract.js from ${LIB_BASE}`));
      document.head.appendChild(script);
    });
    if (!globalThis.Tesseract?.createWorker) {
      throw new Error("Tesseract.js loaded but createWorker is missing");
    }
    return globalThis.Tesseract;
  }

  async function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        const Tesseract = await loadTesseractScript();
        setStatus("loading", "Starting OCR worker (first run may take 15–30s)…");
        const worker = await Tesseract.createWorker("eng", 1, {
          workerPath: `${LIB_BASE}/worker.min.js`,
          corePath: CORE_CDN,
          langPath: LANG_CDN,
          workerBlobURL: false,
          logger: (m) => {
            if (m.status === "recognizing text") {
              status.progress = Math.round((m.progress || 0) * 100);
            } else if (m.status) {
              status.detail = m.status;
            }
            emitProgress(m);
          },
        });
        status.progress = null;
        setStatus("ready", "OCR worker ready");
        return worker;
      })().catch((err) => {
        workerPromise = null;
        setStatus("error", "OCR worker failed to start", err);
        throw err;
      });
    }
    return workerPromise;
  }

  const ocr = {
    getStatus() {
      return { ...status };
    },

    onProgress(fn) {
      progressListeners.add(fn);
      return () => progressListeners.delete(fn);
    },

    async warmup() {
      await getWorker();
      return this.getStatus();
    },

    async recognizeBase64(base64, mime = "image/jpeg") {
      const worker = await getWorker();
      setStatus("busy", "Recognizing text…");
      try {
        const { data } = await worker.recognize(`data:${mime};base64,${base64}`);
        const text = String(data.text || "").trim();
        const layout = extractLayout(data);
        setStatus("ready", "OCR worker ready");
        return {
          text,
          confidence: data.confidence,
          layout,
          suggestedTitle:
            text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .find(Boolean)
              ?.slice(0, 80) || "",
        };
      } catch (err) {
        setStatus("error", "Recognition failed", err);
        throw err;
      }
    },
  };

  function extractLayout(data) {
    const blocks = (data.blocks || [])
      .map((block) => ({
        bbox: block.bbox
          ? { x0: block.bbox.x0, y0: block.bbox.y0, x1: block.bbox.x1, y1: block.bbox.y1 }
          : null,
        paragraphs: (block.paragraphs || [])
          .map((para) => ({
            bbox: para.bbox
              ? { x0: para.bbox.x0, y0: para.bbox.y0, x1: para.bbox.x1, y1: para.bbox.y1 }
              : null,
            lines: (para.lines || [])
              .map((line) => {
                const text = String(line.text || "").trim();
                if (!text) return null;
                return {
                  text,
                  confidence: line.confidence ?? null,
                  bbox: line.bbox
                    ? { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 }
                    : null,
                };
              })
              .filter(Boolean),
          }))
          .filter((p) => p.lines.length),
      }))
      .filter((b) => b.paragraphs.length);
    return { blocks };
  }

  return {
    name: "avh_ocr",
    version: "0.1.3",
    description: "On-device OCR for scan parse (L7, Tesseract.js)",

    moduleInfo: {
      name: "avh_ocr",
      version: "0.1.3",
      description: "On-device OCR for scan parse (L7, Tesseract.js)",
    },

    ocr,

    onMount: async () => {
      navi.callout("[avh_ocr] OCR module ready (flowerpot lib/tesseract)");
    },

    onUnmount: async () => {
      if (workerPromise) {
        try {
          const worker = await workerPromise;
          await worker.terminate();
        } catch {
          /* ignore */
        }
        workerPromise = null;
      }
      setStatus("idle", "Module unloaded");
    },
  };
};
