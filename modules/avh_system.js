export const register = (navi) => {
  const catalog = {
    clinic: {
      title: "Clinic",
      hint: "Applies to every folder layout in this demo.",
      mount(root, prefs) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "system-section";
        fieldset.dataset.section = "clinic";
        fieldset.innerHTML = `
          <legend>Clinic</legend>
          <p class="section-hint">Applies to every folder layout in this demo.</p>
          <div class="field-group">
            <p class="group-label">Scan presentation</p>
            <label><input type="radio" name="scanPresentation" value="sheet" /> Separate sheet screen (navigate away)</label>
            <label><input type="radio" name="scanPresentation" value="overlay" /> Overlay on folder (stay in folder)</label>
          </div>
          <div class="field-group">
            <p class="group-label">Folder layout</p>
            <label><input type="radio" name="folderSectionOrder" value="pets_first" /> Pets above documents</label>
            <label><input type="radio" name="folderSectionOrder" value="docs_first" /> Documents above pets</label>
          </div>
          <div class="field-group">
            <p class="group-label">Documents</p>
            <label><input type="checkbox" id="virtualEnabled" /> Show virtual records in folder</label>
            <label><input type="checkbox" id="parseEnabled" /> Offer parse on capture review</label>
            <label><input type="checkbox" id="virtualEditEnabled" /> Allow edit and delete on virtual records</label>
          </div>
        `;
        root.appendChild(fieldset);
        const presentation = prefs.scanPresentation || "sheet";
        const radio = fieldset.querySelector(`input[name="scanPresentation"][value="${presentation}"]`);
        if (radio) radio.checked = true;
        fieldset.querySelector("#virtualEnabled").checked = prefs.virtualEnabled !== false;
        fieldset.querySelector("#parseEnabled").checked = prefs.parseEnabled !== false;
        fieldset.querySelector("#virtualEditEnabled").checked = prefs.virtualEditEnabled !== false;
        const order = prefs.folderSectionOrder || "pets_first";
        const orderRadio = fieldset.querySelector(`input[name="folderSectionOrder"][value="${order}"]`);
        if (orderRadio) orderRadio.checked = true;
      },
      read(root) {
        const section = root.querySelector('[data-section="clinic"]');
        if (!section) return {};
        return {
          scanPresentation:
            section.querySelector('input[name="scanPresentation"]:checked')?.value || "sheet",
          folderSectionOrder:
            section.querySelector('input[name="folderSectionOrder"]:checked')?.value || "pets_first",
          virtualEnabled: section.querySelector("#virtualEnabled").checked,
          parseEnabled: section.querySelector("#parseEnabled").checked,
          virtualEditEnabled: section.querySelector("#virtualEditEnabled").checked,
        };
      },
    },

    folder_scan_pages: {
      title: "Page-turn folder",
      hint: "Only applies when using the tap page-turn folder layout.",
      mount(root, prefs) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "system-section";
        fieldset.dataset.section = "folder_scan_pages";
        fieldset.innerHTML = `
          <legend>Page-turn folder</legend>
          <p class="section-hint">Only applies when using the tap page-turn folder layout.</p>
          <label><input type="checkbox" id="scanPageInline" /> Show scan image on each scan page</label>
          <p class="section-hint">When on, the photo appears on the page. Tap the image or View full size for overlay or sheet.</p>
          <label><input type="checkbox" id="virtualPageInline" /> Show virtual record content on each record page</label>
          <p class="section-hint">When on, fields and sections render on the page. Open full record for edit and linked scan.</p>
        `;
        root.appendChild(fieldset);
        fieldset.querySelector("#scanPageInline").checked = !!prefs.scanPageInline;
        fieldset.querySelector("#virtualPageInline").checked = !!prefs.virtualPageInline;
      },
      read(root) {
        const section = root.querySelector('[data-section="folder_scan_pages"]');
        if (!section) return {};
        return {
          scanPageInline: section.querySelector("#scanPageInline").checked,
          virtualPageInline: section.querySelector("#virtualPageInline").checked,
        };
      },
    },

    capabilities: {
      title: "Capabilities",
      hint: "On-device libraries used by capture and parse.",
      mount(root) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "system-section";
        fieldset.dataset.section = "capabilities";
        fieldset.innerHTML = `
          <legend>Capabilities</legend>
          <p class="section-hint">Warm up OCR here before parse review - automatic text fill only runs when the worker shows ready.</p>
          <div id="cap-status" class="cap-status">Checking...</div>
          <div class="cap-actions">
            <button type="button" id="cap-refresh-btn">Refresh status</button>
            <button type="button" id="cap-warm-ocr-btn">Warm up OCR</button>
          </div>
        `;
        root.appendChild(fieldset);

        const statusEl = fieldset.querySelector("#cap-status");
        const mgr = navi.mod.avh_manager?.manager;

        function row(label, value, tone) {
          return `<div class="cap-row${tone ? ` cap-${tone}` : ""}"><span class="cap-label">${label}</span><span class="cap-value">${value}</span></div>`;
        }

        async function refresh() {
          const lines = [];
          lines.push(row("Capture module", navi.mod.avh_capture?.capture ? "loaded" : "not loaded"));
          lines.push(row("OCR module", navi.mod.avh_ocr?.ocr ? "loaded" : "not loaded - tap Warm up OCR"));

          if (navi.mod.avh_ocr?.ocr?.getStatus) {
            const st = navi.mod.avh_ocr.ocr.getStatus();
            const tone = st.state === "ready" ? "ok" : st.state === "error" ? "err" : "";
            lines.push(row("Tesseract worker", `${st.state} - ${st.detail}`, tone));
            if (st.lastError) lines.push(row("Last error", st.lastError, "err"));
          } else if (mgr) {
            lines.push(row("Tesseract worker", "idle - tap Warm up OCR to preload", ""));
          }

          statusEl.innerHTML = lines.join("");
        }

        fieldset.querySelector("#cap-refresh-btn").addEventListener("click", () => {
          refresh().catch((e) => {
            statusEl.innerHTML = row("Error", e.message, "err");
          });
        });

        fieldset.querySelector("#cap-warm-ocr-btn").addEventListener("click", async () => {
          if (!mgr) throw new Error("Manager not loaded");
          statusEl.innerHTML = row("Tesseract worker", "loading...", "");
          const mod = await mgr.ensureOcrModule();
          await mod.ocr.warmup();
          await refresh();
        });

        refresh().catch((e) => {
          statusEl.innerHTML = row("Error", e.message, "err");
        });
      },
      read() {
        return {};
      },
    },
  };

  return {
    name: "avh_system",
    version: "0.1.1",
    description: "Composable system sections for avh_record_viewer system host",

    moduleInfo: {
      name: "avh_system",
      version: "0.1.1",
      description: "Composable system sections for avh_record_viewer system host",
    },

    catalog,
    sectionIds: Object.keys(catalog),

    onMount: async () => {
      navi.callout("[avh_system] system section catalog ready");
    },
  };
};
