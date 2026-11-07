export const register = (navi) => {
  function compactLine(line) {
    const text = String(line?.text || "").trim();
    if (!text) return null;
    const out = { text, confidence: line.confidence ?? null };
    if (line.bbox) {
      out.bbox = {
        x0: line.bbox.x0,
        y0: line.bbox.y0,
        x1: line.bbox.x1,
        y1: line.bbox.y1,
      };
    }
    return out;
  }

  function extractFields(section, lineText) {
    const m = lineText.match(/^([^:]{2,48}):\s*(.+)$/);
    if (m) {
      section.fields.push({ key: m[1].trim(), value: m[2].trim() });
    }
  }

  function finishSection(section) {
    return {
      label: section.label || null,
      lines: [...section.lines],
      fields: [...section.fields],
    };
  }

  function looksLikeHeader(text) {
    if (!text || text.length > 72) return false;
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (letters.length < 3) return false;
    return text === text.toUpperCase();
  }

  function verticalGap(prevLine, line) {
    if (!prevLine?.bbox || !line?.bbox) return 0;
    return line.bbox.y0 - prevLine.bbox.y1;
  }

  const parse = {
    /** Turn Tesseract layout + text into demo structured parse (layout_v1). */
    layoutFromOcr(ocrResult) {
      const layout = ocrResult?.layout || { blocks: [] };
      const allLines = [];

      for (const block of layout.blocks || []) {
        for (const para of block.paragraphs || []) {
          for (const line of para.lines || []) {
            const compact = compactLine(line);
            if (compact) allLines.push(compact);
          }
        }
      }

      allLines.sort((a, b) => {
        const dy = (a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0);
        if (Math.abs(dy) > 6) return dy;
        return (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0);
      });

      const sections = [];
      let current = { label: null, lines: [], fields: [] };

      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        const prev = allLines[i - 1];
        const gap = verticalGap(prev, line);
        const isHeader = looksLikeHeader(line.text);
        const bigGap = gap > 28;

        if ((isHeader || bigGap) && (current.lines.length || current.fields.length)) {
          sections.push(finishSection(current));
          current = {
            label: isHeader ? line.text : null,
            lines: isHeader ? [] : [line.text],
            fields: [],
          };
          if (!isHeader) extractFields(current, line.text);
          continue;
        }

        if (isHeader && !current.lines.length && !current.label) {
          current.label = line.text;
          continue;
        }

        current.lines.push(line.text);
        extractFields(current, line.text);
      }

      if (current.lines.length || current.label || current.fields.length) {
        sections.push(finishSection(current));
      }

      if (!sections.length && ocrResult?.text) {
        sections.push({
          label: null,
          lines: ocrResult.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
          fields: [],
        });
      }

      const notes = sections
        .map((s) => {
          const head = s.label ? `${s.label}\n` : "";
          return head + s.lines.join("\n");
        })
        .filter(Boolean)
        .join("\n\n");

      const title =
        ocrResult?.suggestedTitle ||
        sections.find((s) => s.label)?.label ||
        sections[0]?.lines?.[0]?.slice(0, 80) ||
        "Parsed document";

      return {
        version: "layout_v1",
        parser: "avh_parse",
        parserVersion: "0.1.0",
        title,
        notes,
        sections,
        stats: {
          blockCount: (layout.blocks || []).length,
          lineCount: allLines.length,
          sectionCount: sections.length,
          confidence: ocrResult?.confidence ?? null,
        },
      };
    },
  };

  return {
    name: "avh_parse",
    version: "0.1.0",
    description: "Layout pass / demo parser for OCR output (shoppable artifact)",

    moduleInfo: {
      name: "avh_parse",
      version: "0.1.0",
      description: "Layout pass / demo parser for OCR output (shoppable artifact)",
    },

    parse,

    onMount: async () => {
      navi.callout("[avh_parse] layout parser ready");
    },
  };
};
