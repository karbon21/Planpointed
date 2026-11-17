(function (root, factory) {
  const geom =
    typeof require === "function"
      ? require("./geometry.js")
      : root && root.PlanpointedGeometry;
  const api = factory(geom);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlanpointedCodec = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (geom) {
  "use strict";

  const DEFAULT_COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#8b5cf6",
    "#06b6d4",
    "#ef4444",
    "#84cc16",
  ];

  function buildEdgesFallback(len) {
    if (geom && geom.buildEdges) return geom.buildEdges(len);
    if (len < 2) return [];
    const edges = [];
    for (let i = 0; i < len; i++) {
      edges.push([i, (i + 1) % len]);
    }
    return edges;
  }

  function roundNum(val) {
    if (geom && geom.roundCoord) return geom.roundCoord(val, 2);
    return Math.round(val * 100) / 100;
  }

  function escapeJsString(str) {
    return JSON.stringify(String(str));
  }

  /**
   * Generate a clean, valid .js file containing `planMeta` and `const rooms = { ... }`.
   */
  function generateRoomsJs(options) {
    const {
      rooms = [],
      planMeta = {},
      embedImage = true,
      includeCommonJsExport = true,
      previewTruncateImage = false,
      generatedAt = new Date().toISOString(),
    } = options || {};

    const imageName = planMeta.imageName || "floor-plan";
    const imageWidth = Number.isFinite(planMeta.imageWidth) ? planMeta.imageWidth : 0;
    const imageHeight = Number.isFinite(planMeta.imageHeight) ? planMeta.imageHeight : 0;

    const lines = [];
    lines.push("// Planpointed Building Plan Export");
    lines.push(
      `// Image: ${imageName} (${imageWidth}x${imageHeight} px, origin: top-left)`
    );
    lines.push(`// Rooms: ${rooms.length}`);
    lines.push(`// Generated: ${generatedAt}`);
    lines.push("");

    // Emit planMeta
    lines.push("const planMeta = {");
    lines.push(`  version: 1,`);
    lines.push(`  imageName: ${escapeJsString(imageName)},`);
    lines.push(`  imageWidth: ${imageWidth},`);
    lines.push(`  imageHeight: ${imageHeight},`);
    lines.push(`  coordinateOrigin: "top-left",`);
    lines.push(`  units: "px",`);
    if (embedImage && planMeta.imageDataUrl) {
      const dataUrl = previewTruncateImage
        ? `${planMeta.imageDataUrl.slice(0, 72)}... /* truncated in preview (${planMeta.imageDataUrl.length} chars) */`
        : planMeta.imageDataUrl;
      if (previewTruncateImage) {
        lines.push(`  imageDataUrl: ${escapeJsString(planMeta.imageDataUrl.slice(0, 72) + "...")}, // full base64 included on download/copy`);
      } else {
        lines.push(`  imageDataUrl: ${escapeJsString(dataUrl)},`);
      }
    }
    lines.push("};");
    lines.push("");

    // Ensure unique dictionary keys in `rooms`
    const usedKeys = new Set();
    lines.push("const rooms = {");
    rooms.forEach((room, idx) => {
      const rawName = (room.name || `Room ${idx + 1}`).trim() || `Room ${idx + 1}`;
      let key = rawName;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${rawName} (${suffix++})`;
      }
      usedKeys.add(key);

      const pts = (room.points || []).map((p) => ({
        x: roundNum(Number(p.x) || 0),
        y: roundNum(Number(p.y) || 0),
      }));
      const edges = buildEdgesFallback(pts.length);
      const color = room.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
      const id = room.id || `room_${idx + 1}`;

      lines.push(`  ${escapeJsString(key)}: {`);
      lines.push(`    id: ${escapeJsString(id)},`);
      lines.push(`    name: ${escapeJsString(key)},`);
      lines.push(`    color: ${escapeJsString(color)},`);
      lines.push(`    closed: true,`);
      lines.push(`    points: [`);
      pts.forEach((pt, pIdx) => {
        const comma = pIdx < pts.length - 1 ? "," : "";
        lines.push(`      { x: ${pt.x}, y: ${pt.y} }${comma}`);
      });
      lines.push(`    ],`);
      lines.push(`    edges: [`);
      edges.forEach((edge, eIdx) => {
        const comma = eIdx < edges.length - 1 ? "," : "";
        lines.push(`      [${edge[0]}, ${edge[1]}]${comma}`);
      });
      lines.push(`    ]`);
      const roomComma = idx < rooms.length - 1 ? "," : "";
      lines.push(`  }${roomComma}`);
    });
    lines.push("};");

    if (includeCommonJsExport) {
      lines.push("");
      lines.push('if (typeof module !== "undefined" && module.exports) {');
      lines.push("  module.exports = { planMeta, rooms };");
      lines.push("}");
    }
    lines.push("");

    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Safe JS Literal Tokenizer & Recursive-Descent Parser (no eval / Function)
  // ---------------------------------------------------------------------------

  function createScanner(source) {
    let pos = 0;
    const len = source.length;

    function skipTrivia() {
      while (pos < len) {
        const ch = source[pos];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
          pos++;
          continue;
        }
        if (ch === "/" && source[pos + 1] === "/") {
          pos += 2;
          while (pos < len && source[pos] !== "\n") pos++;
          continue;
        }
        if (ch === "/" && source[pos + 1] === "*") {
          pos += 2;
          while (pos < len && !(source[pos] === "*" && source[pos + 1] === "/")) {
            pos++;
          }
          pos += 2;
          continue;
        }
        break;
      }
    }

    function peek() {
      skipTrivia();
      return source[pos];
    }

    function readIdentifier() {
      skipTrivia();
      const start = pos;
      if (!/[A-Za-z_$]/.test(source[pos] || "")) {
        throw new Error(`Expected identifier at offset ${pos}`);
      }
      pos++;
      while (pos < len && /[A-Za-z0-9_$]/.test(source[pos])) {
        pos++;
      }
      return source.slice(start, pos);
    }

    function readString() {
      skipTrivia();
      const quote = source[pos];
      if (quote !== '"' && quote !== "'" && quote !== "`") {
        throw new Error(`Expected string at offset ${pos}`);
      }
      pos++;
      let out = "";
      while (pos < len) {
        const ch = source[pos++];
        if (ch === quote) {
          return out;
        }
        if (ch === "\\") {
          if (pos >= len) throw new Error("Unterminated escape sequence");
          const esc = source[pos++];
          switch (esc) {
            case "n":
              out += "\n";
              break;
            case "r":
              out += "\r";
              break;
            case "t":
              out += "\t";
              break;
            case "b":
              out += "\b";
              break;
            case "f":
              out += "\f";
              break;
            case "\\":
              out += "\\";
              break;
            case '"':
              out += '"';
              break;
            case "'":
              out += "'";
              break;
            case "`":
              out += "`";
              break;
            case "u": {
              if (source[pos] === "{") {
                const close = source.indexOf("}", pos + 1);
                if (close === -1) throw new Error("Invalid unicode escape");
                const hex = source.slice(pos + 1, close);
                out += String.fromCodePoint(parseInt(hex, 16));
                pos = close + 1;
              } else {
                const hex = source.slice(pos, pos + 4);
                out += String.fromCharCode(parseInt(hex, 16));
                pos += 4;
              }
              break;
            }
            case "x": {
              const hex = source.slice(pos, pos + 2);
              out += String.fromCharCode(parseInt(hex, 16));
              pos += 2;
              break;
            }
            default:
              out += esc;
          }
        } else {
          out += ch;
        }
      }
      throw new Error("Unterminated string literal");
    }

    function readNumber() {
      skipTrivia();
      const slice = source.slice(pos);
      const match = slice.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) {
        throw new Error(`Invalid number at offset ${pos}`);
      }
      pos += match[0].length;
      const num = Number(match[0]);
      if (!Number.isFinite(num)) {
        throw new Error(`Non-finite number: ${match[0]}`);
      }
      return num;
    }

    function readValue() {
      const ch = peek();
      if (ch === undefined) {
        throw new Error("Unexpected end of input while reading value");
      }
      if (ch === "{") return readObject();
      if (ch === "[") return readArray();
      if (ch === '"' || ch === "'" || ch === "`") return readString();
      if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) {
        return readNumber();
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const ident = readIdentifier();
        if (ident === "true") return true;
        if (ident === "false") return false;
        if (ident === "null") return null;
        if (ident === "undefined") return undefined;
        throw new Error(`Unsupported identifier value "${ident}" at offset ${pos}`);
      }
      throw new Error(`Unexpected token "${ch}" at offset ${pos}`);
    }

    function readArray() {
      skipTrivia();
      if (source[pos] !== "[") throw new Error(`Expected '[' at offset ${pos}`);
      pos++;
      const arr = [];
      while (true) {
        const ch = peek();
        if (ch === undefined) throw new Error("Unterminated array");
        if (ch === "]") {
          pos++;
          return arr;
        }
        arr.push(readValue());
        const next = peek();
        if (next === ",") {
          pos++;
        } else if (next !== "]") {
          throw new Error(`Expected ',' or ']' in array at offset ${pos}`);
        }
      }
    }

    function readObject() {
      skipTrivia();
      if (source[pos] !== "{") throw new Error(`Expected '{' at offset ${pos}`);
      pos++;
      const obj = {};
      while (true) {
        const ch = peek();
        if (ch === undefined) throw new Error("Unterminated object");
        if (ch === "}") {
          pos++;
          return obj;
        }
        let key;
        if (ch === '"' || ch === "'" || ch === "`") {
          key = readString();
        } else if (/[A-Za-z_$]/.test(ch)) {
          key = readIdentifier();
        } else if (ch >= "0" && ch <= "9") {
          key = String(readNumber());
        } else {
          throw new Error(`Invalid object key starting with "${ch}" at offset ${pos}`);
        }

        const colon = peek();
        if (colon !== ":") {
          throw new Error(`Expected ':' after key "${key}" at offset ${pos}`);
        }
        pos++;
        obj[key] = readValue();

        const next = peek();
        if (next === ",") {
          pos++;
        } else if (next !== "}") {
          throw new Error(`Expected ',' or '}' in object at offset ${pos}`);
        }
      }
    }

    return {
      get pos() {
        return pos;
      },
      set pos(v) {
        pos = v;
      },
      peek,
      skipTrivia,
      readValue,
    };
  }

  /**
   * Extract named top-level declarations like `const rooms = { ... }` without executing JS.
   */
  function extractDeclarations(source) {
    const found = {};
    const declRegex =
      /(?:^|[;\n\r])\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;

    let match;
    while ((match = declRegex.exec(source)) !== null) {
      const varName = match[1];
      if (varName !== "rooms" && varName !== "planMeta" && varName !== "planImage") {
        continue;
      }
      const scanner = createScanner(source);
      scanner.pos = declRegex.lastIndex;
      found[varName] = scanner.readValue();
    }

    // Fallback: raw JSON or object literal file representing rooms directly
    if (!found.rooms) {
      const trimmed = source.trim();
      if (trimmed.startsWith("{")) {
        const scanner = createScanner(source);
        const parsed = scanner.readValue();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          if (parsed.rooms && typeof parsed.rooms === "object") {
            found.rooms = parsed.rooms;
            if (parsed.planMeta) found.planMeta = parsed.planMeta;
          } else {
            found.rooms = parsed;
          }
        }
      }
    }

    return found;
  }

  function orderPointsByEdges(points, edges) {
    if (!Array.isArray(edges) || edges.length !== points.length) {
      return points;
    }
    // Check if edges are already canonical [[0,1], [1,2], ...]
    let isCanonical = true;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (!Array.isArray(e) || e[0] !== i || e[1] !== (i + 1) % points.length) {
        isCanonical = false;
        break;
      }
    }
    if (isCanonical) return points;

    // Try walking directed edges from 0
    const nextMap = new Map();
    for (const e of edges) {
      if (!Array.isArray(e) || e.length < 2) return points;
      const from = Number(e[0]);
      const to = Number(e[1]);
      if (
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 0 ||
        from >= points.length ||
        to < 0 ||
        to >= points.length
      ) {
        return points;
      }
      nextMap.set(from, to);
    }

    const ordered = [];
    const visited = new Set();
    let curr = 0;
    while (!visited.has(curr) && ordered.length < points.length) {
      visited.add(curr);
      ordered.push(points[curr]);
      if (!nextMap.has(curr)) break;
      curr = nextMap.get(curr);
    }
    return ordered.length === points.length ? ordered : points;
  }

  function normalizePoint(raw) {
    if (Array.isArray(raw) && raw.length >= 2) {
      const x = Number(raw[0]);
      const y = Number(raw[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    } else if (raw && typeof raw === "object") {
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
    return null;
  }

  /**
   * Parse an exported `.js` file (or raw `const rooms = {...}` snippet) safely.
   */
  function parseRoomsJs(source) {
    if (typeof source !== "string" || !source.trim()) {
      throw new Error("The selected file is empty.");
    }

    const decls = extractDeclarations(source);
    if (!decls.rooms || typeof decls.rooms !== "object") {
      throw new Error(
        'Could not find `const rooms = { ... }` in the loaded .js file.'
      );
    }

    const warnings = [];
    const normalizedRooms = [];
    const rawRooms = decls.rooms;

    const entries = Array.isArray(rawRooms)
      ? rawRooms.map((r, i) => [r && r.name ? r.name : `Room ${i + 1}`, r])
      : Object.entries(rawRooms);

    entries.forEach(([key, rawRoom], idx) => {
      if (!rawRoom || typeof rawRoom !== "object") {
        warnings.push(`Skipped invalid room entry "${key}".`);
        return;
      }

      const rawPoints = Array.isArray(rawRoom.points) ? rawRoom.points : [];
      const points = rawPoints.map(normalizePoint).filter(Boolean);
      if (points.length < 3) {
        warnings.push(
          `Skipped room "${key}" because it has fewer than 3 valid points.`
        );
        return;
      }

      const orderedPoints = orderPointsByEdges(points, rawRoom.edges);
      const name = String(rawRoom.name || key || `Room ${idx + 1}`).trim();
      const color =
        typeof rawRoom.color === "string" && rawRoom.color.trim()
          ? rawRoom.color.trim()
          : DEFAULT_COLORS[normalizedRooms.length % DEFAULT_COLORS.length];

      normalizedRooms.push({
        id: String(rawRoom.id || `room_${idx + 1}`),
        name,
        color,
        closed: true,
        visible: true,
        points: orderedPoints,
        edges: buildEdgesFallback(orderedPoints.length),
      });
    });

    const rawMeta = decls.planMeta && typeof decls.planMeta === "object" ? decls.planMeta : {};
    const imageDataUrl =
      typeof rawMeta.imageDataUrl === "string" && rawMeta.imageDataUrl.startsWith("data:image/")
        ? rawMeta.imageDataUrl
        : typeof decls.planImage === "string" && decls.planImage.startsWith("data:image/")
          ? decls.planImage
          : null;

    // Infer dimensions if planMeta omitted them
    let maxX = 0;
    let maxY = 0;
    for (const r of normalizedRooms) {
      for (const p of r.points) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const planMeta = {
      version: Number(rawMeta.version) || 1,
      imageName: rawMeta.imageName ? String(rawMeta.imageName) : "imported-plan",
      imageWidth:
        Number.isFinite(Number(rawMeta.imageWidth)) && Number(rawMeta.imageWidth) > 0
          ? Number(rawMeta.imageWidth)
          : Math.max(800, Math.ceil(maxX + 80)),
      imageHeight:
        Number.isFinite(Number(rawMeta.imageHeight)) && Number(rawMeta.imageHeight) > 0
          ? Number(rawMeta.imageHeight)
          : Math.max(600, Math.ceil(maxY + 80)),
      coordinateOrigin: rawMeta.coordinateOrigin || "top-left",
      units: rawMeta.units || "px",
      imageDataUrl,
    };

    if (!imageDataUrl) {
      warnings.push(
        "No embedded floor plan image found in this .js file. Rooms were loaded onto a blank sized canvas — you can upload the original floor plan image to overlay them."
      );
    }

    return {
      planMeta,
      rooms: normalizedRooms,
      warnings,
    };
  }

  return {
    DEFAULT_COLORS,
    generateRoomsJs,
    parseRoomsJs,
  };
});
