export const register = (navi) => {
  const templates = {
    layout_v1: {
      id: "layout_v1",
      title: "Layout parse view",
      render(root, content) {
        const layout = content?.parseLayout;
        if (!layout?.sections?.length) return false;

        const meta = document.createElement("p");
        meta.className = "view-meta";
        const parts = [];
        if (layout.stats?.sectionCount != null) parts.push(`${layout.stats.sectionCount} sections`);
        if (layout.stats?.lineCount != null) parts.push(`${layout.stats.lineCount} lines`);
        if (layout.stats?.confidence != null) parts.push(`${Math.round(layout.stats.confidence)}% conf`);
        meta.textContent = parts.join(" · ");
        root.appendChild(meta);

        for (const section of layout.sections) {
          const block = document.createElement("section");
          block.className = "layout-section";

          if (section.label) {
            const h = document.createElement("h3");
            h.textContent = section.label;
            block.appendChild(h);
          }

          if (section.fields?.length) {
            const dl = document.createElement("dl");
            dl.className = "layout-fields";
            for (const f of section.fields) {
              const dt = document.createElement("dt");
              dt.textContent = f.key;
              const dd = document.createElement("dd");
              dd.textContent = f.value;
              dl.appendChild(dt);
              dl.appendChild(dd);
            }
            block.appendChild(dl);
          }

          if (section.lines?.length) {
            const body = document.createElement("div");
            body.className = "layout-lines";
            for (const line of section.lines) {
              const p = document.createElement("p");
              p.textContent = line;
              body.appendChild(p);
            }
            block.appendChild(body);
          }

          root.appendChild(block);
        }

        if (content.notes && content.notes !== layout.notes) {
          const edited = document.createElement("section");
          edited.className = "layout-section edited-notes";
          edited.innerHTML = "<h3>Edited notes</h3>";
          const pre = document.createElement("pre");
          pre.textContent = content.notes;
          edited.appendChild(pre);
          root.appendChild(edited);
        }

        return true;
      },
    },

    pet_details: {
      id: "pet_details",
      title: "Pet details",
      render(root, content) {
        const rows = [
          ["Name", content?.name],
          ["Species", content?.species],
          ["Sex", content?.sex],
          ["Age", content?.age],
          ["Misc", content?.misc],
        ];
        for (const [label, val] of rows) {
          if (val == null || val === "") continue;
          const row = document.createElement("div");
          row.className = "field";
          if (label === "Misc") {
            row.innerHTML = `<label>${label}</label><pre style="margin:0;white-space:pre-wrap;font-family:inherit">${String(val)}</pre>`;
          } else {
            row.innerHTML = `<label>${label}</label>${String(val)}`;
          }
          root.appendChild(row);
        }
        return true;
      },
    },

    default: {
      id: "default",
      title: "Flat fields",
      render(root, content, hiddenKeys) {
        if (!content || typeof content !== "object") {
          root.innerHTML = "<p class='field'>No structured content</p>";
          return true;
        }
        const skip = new Set(["recordKind", ...(hiddenKeys || [])]);
        for (const [key, val] of Object.entries(content)) {
          if (skip.has(key)) continue;
          if (val != null && typeof val === "object") continue;
          const row = document.createElement("div");
          row.className = "field";
          row.innerHTML = `<label>${key}</label>${String(val)}`;
          root.appendChild(row);
        }
        return true;
      },
    },
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Editable form for a layout_v1 parse (sections → label, fields, lines).
  const layoutEditor = {
    mount(root, layout) {
      root.innerHTML = "";
      root.classList.add("layout-editor");
      const sections = Array.isArray(layout?.sections) ? layout.sections : [];
      const list = el("div", "le-sections");
      root.appendChild(list);
      for (const section of sections) this._addSection(list, section);

      const addSectionBtn = el("button", "le-add-section", "+ Add section");
      addSectionBtn.type = "button";
      addSectionBtn.addEventListener("click", () =>
        this._addSection(list, { label: "", fields: [], lines: [] })
      );
      root.appendChild(addSectionBtn);
    },

    _addSection(list, section) {
      const wrap = el("div", "le-section");

      const labelInput = el("input", "le-label");
      labelInput.type = "text";
      labelInput.placeholder = "Section label (optional)";
      labelInput.value = section.label || "";
      wrap.appendChild(labelInput);

      const fieldsWrap = el("div", "le-fields");
      wrap.appendChild(fieldsWrap);
      for (const f of section.fields || []) this._addField(fieldsWrap, f);

      const addFieldBtn = el("button", "le-add-field", "+ field");
      addFieldBtn.type = "button";
      addFieldBtn.addEventListener("click", () =>
        this._addField(fieldsWrap, { key: "", value: "" })
      );
      wrap.appendChild(addFieldBtn);

      const linesArea = el("textarea", "le-lines");
      linesArea.rows = Math.min(8, Math.max(2, (section.lines || []).length));
      linesArea.placeholder = "Body lines";
      linesArea.value = (section.lines || []).join("\n");
      wrap.appendChild(linesArea);

      const removeBtn = el("button", "le-remove", "Remove section");
      removeBtn.type = "button";
      removeBtn.addEventListener("click", () => wrap.remove());
      wrap.appendChild(removeBtn);

      list.appendChild(wrap);
    },

    _addField(fieldsWrap, field) {
      const row = el("div", "le-field-row");
      const key = el("input", "le-field-key");
      key.type = "text";
      key.placeholder = "key";
      key.value = field.key || "";
      const val = el("input", "le-field-val");
      val.type = "text";
      val.placeholder = "value";
      val.value = field.value || "";
      const del = el("button", "le-field-del", "×");
      del.type = "button";
      del.title = "Remove field";
      del.addEventListener("click", () => row.remove());
      row.appendChild(key);
      row.appendChild(val);
      row.appendChild(del);
      fieldsWrap.appendChild(row);
    },

    read(root, baseLayout) {
      const sections = [];
      for (const wrap of root.querySelectorAll(".le-section")) {
        const label = wrap.querySelector(".le-label")?.value.trim() || null;
        const fields = [];
        for (const row of wrap.querySelectorAll(".le-field-row")) {
          const key = row.querySelector(".le-field-key")?.value.trim();
          const value = row.querySelector(".le-field-val")?.value.trim();
          if (key) fields.push({ key, value: value || "" });
        }
        const lines = (wrap.querySelector(".le-lines")?.value || "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (label || fields.length || lines.length) {
          sections.push({ label, fields, lines });
        }
      }
      const notes = sections
        .map((s) => (s.label ? `${s.label}\n` : "") + s.lines.join("\n"))
        .filter(Boolean)
        .join("\n\n");
      const layout = {
        ...(baseLayout || {}),
        version: baseLayout?.version || "layout_v1",
        sections,
        notes,
        stats: {
          ...(baseLayout?.stats || {}),
          sectionCount: sections.length,
          lineCount: sections.reduce((n, s) => n + s.lines.length, 0),
        },
      };
      return { layout, notes };
    },
  };

  const virtualView = {
    resolveTemplateId(content) {
      if (content?.recordKind === "pet_details") return "pet_details";
      if (content?.viewTemplate) return content.viewTemplate;
      if (content?.parseLayout?.version === "layout_v1") return "layout_v1";
      if (content?.parseArtifact === "layout_v1") return "layout_v1";
      return "default";
    },

    render(root, content, options = {}) {
      root.innerHTML = "";
      const hiddenKeys = options.hiddenKeys || new Set();
      const id = this.resolveTemplateId(content);
      const tpl = templates[id] || templates.default;
      const ok = tpl.render(root, content, hiddenKeys);
      if (!ok && id !== "default") {
        return templates.default.render(root, content, hiddenKeys);
      }
      return id;
    },
  };

  return {
    name: "avh_virtual_view",
    version: "0.1.1",
    description: "Virtual record view templates + layout editor (separate from parse pipeline)",

    moduleInfo: {
      name: "avh_virtual_view",
      version: "0.1.1",
      description: "Virtual record view templates + layout editor (separate from parse pipeline)",
    },

    templates,
    virtualView,
    layoutEditor,

    onMount: async () => {
      navi.callout("[avh_virtual_view] view templates ready");
    },
  };
};
