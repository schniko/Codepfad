const defaultHtml = `<h1>Meine Webseite</h1>`;

const defaultCss = `h1 {
  color: red
}`;

const HTML_VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);
const HTML_RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

function findHtmlTagEnd(source, start) {
  let quote = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === "<") return -1;
    else if (character === ">") return index;
  }
  return -1;
}

function hasValidHtmlAttributes(source) {
  const attributeNames = new Set();
  let cursor = 0;

  while (cursor < source.length) {
    if (!/\s/.test(source[cursor])) return false;
    while (/\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) return true;

    const nameMatch = source.slice(cursor).match(/^[^\s"'<>\/=]+/);
    if (!nameMatch) return false;
    const attributeName = nameMatch[0].toLowerCase();
    if (attributeNames.has(attributeName)) return false;
    attributeNames.add(attributeName);
    cursor += nameMatch[0].length;

    const endOfName = cursor;
    while (/\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== "=") {
      if (cursor >= source.length) return true;
      cursor = endOfName;
      continue;
    }
    cursor += 1;
    while (/\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) return false;

    const quote = source[cursor];
    if (quote === "\"" || quote === "'") {
      const valueEnd = source.indexOf(quote, cursor + 1);
      if (valueEnd < 0) return false;
      cursor = valueEnd + 1;
      continue;
    }

    const valueMatch = source.slice(cursor).match(/^[^\s"'=<>`]+/);
    if (!valueMatch) return false;
    cursor += valueMatch[0].length;
  }

  return true;
}

function isValidHtml(source) {
  const openTags = [];
  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf("<", cursor);
    if (tagStart < 0) break;

    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4);
      if (commentEnd < 0) return false;
      cursor = commentEnd + 3;
      continue;
    }

    const nextCharacter = source[tagStart + 1] || "";
    if (!/[A-Za-z!/?]/.test(nextCharacter)) {
      cursor = tagStart + 1;
      continue;
    }

    const tagEnd = findHtmlTagEnd(source, tagStart);
    if (tagEnd < 0) return false;
    const token = source.slice(tagStart, tagEnd + 1);

    if (/^<!doctype\b[^>]*>$/i.test(token)) {
      cursor = tagEnd + 1;
      continue;
    }
    if (token.startsWith("<!") || token.startsWith("<?")) return false;

    const closingTag = token.match(/^<\/([A-Za-z][\w:-]*)\s*>$/);
    if (closingTag) {
      const tagName = closingTag[1].toLowerCase();
      if (openTags.pop() !== tagName) return false;
      cursor = tagEnd + 1;
      continue;
    }

    const openingTag = token.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)>$/);
    if (!openingTag) return false;
    const tagName = openingTag[1].toLowerCase();
    const selfClosing = /\/\s*$/.test(openingTag[2]);
    const attributes = selfClosing ? openingTag[2].replace(/\/\s*$/, "") : openingTag[2];
    if (!hasValidHtmlAttributes(attributes)) return false;
    cursor = tagEnd + 1;

    if (selfClosing || HTML_VOID_ELEMENTS.has(tagName)) continue;

    if (HTML_RAW_TEXT_ELEMENTS.has(tagName)) {
      const closingPattern = new RegExp(`<\\/${tagName}\\s*>`, "ig");
      closingPattern.lastIndex = cursor;
      const rawClosingTag = closingPattern.exec(source);
      if (!rawClosingTag) return false;
      cursor = rawClosingTag.index + rawClosingTag[0].length;
      continue;
    }

    openTags.push(tagName);
  }

  return openTags.length === 0;
}

function hasBalancedCssSyntax(source) {
  const brackets = [];
  const matchingBracket = { ")": "(", "]": "[", "}": "{" };
  let quote = "";
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (inComment) {
      if (character === "*" && nextCharacter === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      inComment = true;
      index += 1;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if ("({[".includes(character)) {
      brackets.push(character);
    } else if (")}]".includes(character) && brackets.pop() !== matchingBracket[character]) {
      return false;
    }
  }

  return !quote && !inComment && brackets.length === 0;
}

function withoutCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
}

function findCssDelimiter(source, start) {
  let quote = "";
  let parentheses = 0;
  let brackets = 0;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (!parentheses && !brackets && ";{}".includes(character)) return index;
  }
  return source.length;
}

function isValidCssDeclaration(source) {
  const colon = source.indexOf(":");
  if (colon < 1) return false;
  const property = source.slice(0, colon).trim();
  const value = source.slice(colon + 1).trim();
  if (!/^(?:--[\w-]+|-?[A-Za-z_][\w-]*)$/.test(property) || !value) return false;
  if (property.startsWith("--") || typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  const valueWithoutPriority = value.replace(/\s*!important\s*$/i, "").trim();
  return Boolean(valueWithoutPriority) && CSS.supports(property, valueWithoutPriority);
}

function cssBlockMode(prelude) {
  const atRule = prelude.match(/^@([\w-]+)/);
  if (!atRule) return "declarations";
  if (/^(font-face|page|property|counter-style)$/i.test(atRule[1])) return "declarations";
  if (/^(keyframes|-webkit-keyframes)$/i.test(atRule[1])) return "keyframes";
  return "rules";
}

function splitCssSelectorList(source) {
  const selectors = [];
  let start = 0;
  let quote = "";
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "," && !parentheses && !brackets) {
      const selector = source.slice(start, index).trim();
      if (!selector) return [];
      selectors.push(selector);
      start = index + 1;
    }
  }

  const lastSelector = source.slice(start).trim();
  if (!lastSelector) return [];
  selectors.push(lastSelector);
  return selectors;
}

function isValidCssRulePrelude(prelude, mode) {
  if (prelude.startsWith("@")) return /^@[\w-]+(?:\s+[\s\S]+)?$/.test(prelude);
  if (mode === "keyframes") {
    return prelude.split(",").every(part => /^(?:from|to|(?:\d+(?:\.\d+)?)%)$/i.test(part.trim()));
  }
  const selectors = splitCssSelectorList(prelude);
  if (!selectors.length || selectors.some(selector => /^[>+~]|[>+~]\s*$/.test(selector))) return false;
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return selectors.every(selector => CSS.supports(`selector(${selector})`));
}

function isValidCssContent(source, position, mode, closesWithBrace) {
  let segmentStart = position.index;

  while (position.index < source.length) {
    const delimiterIndex = findCssDelimiter(source, position.index);
    const delimiter = source[delimiterIndex] || "";
    const segment = source.slice(segmentStart, delimiterIndex).trim();
    position.index = delimiterIndex;

    if (delimiter === ";") {
      const validStatement = !segment
        || (mode === "declarations" ? isValidCssDeclaration(segment) || segment.startsWith("@") : segment.startsWith("@"));
      if (!validStatement) return false;
      position.index += 1;
      segmentStart = position.index;
      continue;
    }

    if (delimiter === "{") {
      if (!segment || !isValidCssRulePrelude(segment, mode)) return false;
      const childMode = mode === "keyframes" ? "declarations" : cssBlockMode(segment);
      position.index += 1;
      if (!isValidCssContent(source, position, childMode, true)) return false;
      segmentStart = position.index;
      continue;
    }

    if (delimiter === "}") {
      if (!closesWithBrace) return false;
      if (segment && (mode !== "declarations" || !isValidCssDeclaration(segment))) return false;
      position.index += 1;
      return true;
    }

    if (closesWithBrace) return false;
    return segment.length === 0;
  }

  return !closesWithBrace && source.slice(segmentStart).trim().length === 0;
}

function isValidCss(source) {
  if (!hasBalancedCssSyntax(source)) return false;
  return isValidCssContent(withoutCssComments(source), { index: 0 }, "rules", false);
}

const $ = selector => document.querySelector(selector);
const htmlEditor = $("#html-code");
const cssEditor = $("#css-code");
const preview = $("#preview");
const workspace = $("#workspace");
const assets = new Map();
let cssEnabled = false;
let dirty = false;
let suggestedProjectName = "webprojekt";
let learningPath = null;
let learningPathStep = 0;
let learningPathLevel = "advanced";
let learningPathStates = [];
let learningPathVisited = new Set();
let learningPathInitialAssets = [];
let learningPathCatalog = new Map();
let activeCatalogPath = null;
let selectedCatalogPath = null;
let saveClickCount = 0;
let pathImageClickCount = 0;
let pathImageClickTimer;
let saveClickTimer = null;
let toastTimer;

htmlEditor.value = defaultHtml;
cssEditor.value = defaultCss;

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 1900);
}

function highlightHtmlAttributes(text) {
  let result = "";
  let cursor = 0;
  const pattern = /([^\s=\/]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s]+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    result += escapeHtml(text.slice(cursor, match.index));
    result += `<span class="tok-attr">${escapeHtml(match[1])}</span>`;
    result += `<span class="tok-punc">${escapeHtml(match[2])}</span>`;
    result += `<span class="tok-string">${escapeHtml(match[3])}</span>`;
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(cursor));
}

function highlightHtmlTag(tag) {
  if (tag.startsWith("<!--")) return `<span class="tok-comment">${escapeHtml(tag)}</span>`;
  if (/^<!doctype/i.test(tag)) return `<span class="tok-doctype">${escapeHtml(tag)}</span>`;
  const match = tag.match(/^<(\/?)((?:[A-Za-z][\w-]*))([\s\S]*?)(\/?)>$/);
  if (!match) return escapeHtml(tag);
  return `<span class="tok-punc">&lt;${match[1]}</span><span class="tok-tag">${escapeHtml(match[2])}</span>${highlightHtmlAttributes(match[3])}<span class="tok-punc">${match[4]}&gt;</span>`;
}

function highlightHtmlLine(line) {
  let result = "";
  let cursor = 0;
  const pattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[A-Za-z][^>]*>/gi;
  let match;
  while ((match = pattern.exec(line))) {
    result += escapeHtml(line.slice(cursor, match.index));
    result += highlightHtmlTag(match[0]);
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(line.slice(cursor));
}

const JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends", "finally",
  "for", "from", "function", "if", "import", "in", "instanceof", "let", "new",
  "of", "return", "static", "super", "switch", "this", "throw", "try", "typeof",
  "var", "void", "while", "with", "yield"
]);
const JS_BUILTINS = new Set(["document", "window", "console", "Math", "JSON", "Number", "String", "Boolean", "Array", "Object", "Date"]);
const JS_TOKEN_PATTERN = new RegExp([
  String.raw`(?<comment>//[^\n]*|/\*[\s\S]*?(?:\*/|$))`,
  String.raw`(?<string>"(?:\\[\s\S]|[^"\\\n])*(?:"|(?=\n|$))|'(?:\\[\s\S]|[^'\\\n])*(?:'|(?=\n|$))|\x60(?:\\[\s\S]|[^\x60\\])*(?:\x60|$))`,
  String.raw`(?<number>\b(?:0[xX][\da-fA-F]+n?|0[bB][01]+n?|0[oO][0-7]+n?|\d+n|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\b|\.\d+(?:[eE][+-]?\d+)?\b)`,
  String.raw`(?<identifier>[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*)`,
  String.raw`(?<operator>[+*/%=!<>?&|^~:\-]+)`,
  String.raw`(?<punctuation>[{}()[\].,;])`
].join("|"), "gu");

function highlightJavaScript(source, append) {
  let cursor = 0;
  for (const match of source.matchAll(JS_TOKEN_PATTERN)) {
    append(source.slice(cursor, match.index));
    const value = match[0];
    let type = Object.keys(match.groups).find(key => match.groups[key] !== undefined);
    if (type === "identifier") {
      if (JS_KEYWORDS.has(value)) type = "keyword";
      else if (["true", "false", "null", "undefined", "NaN", "Infinity"].includes(value)) type = "literal";
      else if (/^\s*\(/.test(source.slice(match.index + value.length))) type = "function";
      else if (JS_BUILTINS.has(value)) type = "builtin";
      else if (/\.\s*$/.test(source.slice(0, match.index))) type = "property";
      else type = "";
    }
    append(value, type ? `tok-${type === "punctuation" ? "punc" : type}` : "");
    cursor = match.index + value.length;
  }
  append(source.slice(cursor));
}

function highlightHtmlSource(source) {
  const lines = [""];
  // Close each token on its own line so wrapping and line numbers stay aligned.
  const append = (text, tokenClass = "", markup = false) => {
    text.split("\n").forEach((part, index) => {
      if (index) lines.push("");
      const escaped = markup ? highlightHtmlLine(part) : escapeHtml(part);
      lines[lines.length - 1] += tokenClass && part ? `<span class="${tokenClass}">${escaped}</span>` : escaped;
    });
  };
  // Consume comments and complete tags before looking for a real script block.
  const tags = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/g;
  let cursor = 0;
  let match;
  while ((match = tags.exec(source))) {
    append(source.slice(cursor, match.index), "", true);
    const tag = match[0];
    append(tag, tag.startsWith("<!--") ? "tok-comment" : "", !tag.startsWith("<!--"));
    cursor = tags.lastIndex;
    const rawTag = tag.match(/^<(script|style|textarea|title)\b/i);
    if (!rawTag) continue;
    const closing = new RegExp(`<\\/${rawTag[1]}\\s*>`, "ig");
    closing.lastIndex = cursor;
    const end = closing.exec(source);
    const content = source.slice(cursor, end ? end.index : source.length);
    if (rawTag[1].toLowerCase() === "script") highlightJavaScript(content, append);
    else append(content);
    if (end) append(end[0], "", true);
    cursor = end ? closing.lastIndex : source.length;
    tags.lastIndex = cursor;
  }
  append(source.slice(cursor), "", true);
  return lines;
}

function highlightCssLine(line) {
  if (/^\s*\/\*/.test(line) || /^\s*\*/.test(line)) return `<span class="tok-comment">${escapeHtml(line)}</span>`;
  const selector = line.match(/^(\s*)([^{}]+)(\s*\{\s*)$/);
  if (selector) return `${escapeHtml(selector[1])}<span class="tok-selector">${escapeHtml(selector[2])}</span><span class="tok-punc">${escapeHtml(selector[3])}</span>`;
  if (/^\s*}\s*$/.test(line)) return `<span class="tok-punc">${escapeHtml(line)}</span>`;
  const declaration = line.match(/^(\s*)(--[-\w]+|[-a-zA-Z]+)(\s*:\s*)(.*?)(;?\s*)$/);
  if (declaration) return `${escapeHtml(declaration[1])}<span class="tok-property">${escapeHtml(declaration[2])}</span><span class="tok-punc">${escapeHtml(declaration[3])}</span><span class="tok-value">${escapeHtml(declaration[4])}</span><span class="tok-punc">${escapeHtml(declaration[5])}</span>`;
  return escapeHtml(line);
}

function updateEditorView(editor, highlighted, gutter, highlighter) {
  const lines = highlighter(editor.value);
  highlighted.innerHTML = lines.map(line => `<span class="code-line">${line || "&#8203;"}</span>`).join("");
  const heights = [...highlighted.querySelectorAll(".code-line")].map(line => line.getBoundingClientRect().height);
  gutter.innerHTML = heights.map((height, index) => `<span class="line-no" style="height:${height}px">${index + 1}</span>`).join("");
  highlighted.scrollTop = editor.scrollTop;
  highlighted.scrollLeft = editor.scrollLeft;
  gutter.scrollTop = editor.scrollTop;
}

function refreshEditors() {
  updateEditorView(htmlEditor, $("#html-highlight"), $("#html-lines"), highlightHtmlSource);
  updateEditorView(cssEditor, $("#css-highlight"), $("#css-lines"), source => source.split("\n").map(highlightCssLine));
}

function replaceAllLiteral(text, search, replacement) {
  return text.split(search).join(replacement);
}

function resolveAssets(text) {
  let resolved = text;
  for (const [path, asset] of assets) {
    if (!resolved.includes(path)) continue;
    // Blob URLs from the editor are inaccessible in an opaque-origin iframe.
    // Cache a self-contained image URL for previews, including file:// usage.
    if (!asset.previewUrl) {
      let binary = "";
      for (let offset = 0; offset < asset.bytes.length; offset += 32768) {
        binary += String.fromCharCode(...asset.bytes.subarray(offset, offset + 32768));
      }
      asset.previewUrl = `data:${asset.type};base64,${btoa(binary)}`;
    }
    resolved = replaceAllLiteral(resolved, `./${path}`, asset.previewUrl);
    resolved = replaceAllLiteral(resolved, path, asset.previewUrl);
  }
  return resolved;
}

// The marker lets imported editor exports hide the directive again without
// removing a directive written by the learner.
const STRICT_MODE_MARKER = '\n"use strict"; // Web-Editor: Strict Mode\n';

function prepareInlineScripts(source, addStrictMode) {
  let result = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      if (end < 0) break;
      result += source.slice(cursor, end + 3);
      cursor = end + 3;
      continue;
    }
    const end = findHtmlTagEnd(source, start);
    if (end < 0) {
      result += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }
    const tag = source.slice(start, end + 1);
    const raw = tag.match(/^<(script|style|textarea|title)\b/i);
    if (!raw) {
      result += source.slice(cursor, end + 1);
      cursor = end + 1;
      continue;
    }
    const closing = new RegExp(`<\\/${raw[1]}\\s*>`, "ig");
    closing.lastIndex = end + 1;
    const match = closing.exec(source);
    if (!match) break;
    result += source.slice(cursor, end + 1);
    let content = source.slice(end + 1, match.index);
    if (raw[1].toLowerCase() === "script") {
      const template = document.createElement("template");
      template.innerHTML = `${tag}</script>`;
      const script = template.content.querySelector("script");
      const type = (script?.getAttribute("type") || "").trim().toLowerCase();
      const isClassicJavaScript = !type || /^(?:text|application)\/(?:java|ecma)script$/.test(type);
      if (script && !script.hasAttribute("src") && isClassicJavaScript) {
        if (content.startsWith(STRICT_MODE_MARKER)) content = content.slice(STRICT_MODE_MARKER.length);
        if (addStrictMode) content = STRICT_MODE_MARKER + content;
      }
    }
    result += content + match[0];
    cursor = match.index + match[0].length;
  }
  return result + source.slice(cursor);
}

function buildPreviewDocument() {
  const html = prepareInlineScripts(resolveAssets(htmlEditor.value), true);
  const baseCss = learningPath ? resolveAssets(learningPath.baseCss) : "";
  const editableCss = cssEnabled ? resolveAssets(cssEditor.value) : "";
  const css = [baseCss, editableCss].filter(Boolean).join("\n");
  // Keep errors inside the opaque-origin sandbox; learner code cannot access the editor.
  const errorReporter = `<script>
    window.addEventListener("error", function (event) {
      if (!event.message) return;
      function showError() {
        const message = document.createElement("pre");
        message.setAttribute("role", "alert");
        message.style.cssText = "white-space:pre-wrap;padding:12px;background:#fff0ed;color:#8b241c;border:1px solid #d98f84;font:14px monospace";
        message.textContent = "JavaScript-Fehler: " + event.message + "\\nPrüfe Namen, Anführungszeichen und Klammern im Skript.";
        document.body.append(message);
      }
      if (document.body) showError();
      else document.addEventListener("DOMContentLoaded", showError, { once: true });
    });
  <\/script>`;
  const consoleReporter = learningPath?.showConsole ? `<script>
    console.log = function (...values) {
      parent.postMessage({ type: "mint-preview-log", text: values.map(value => value instanceof Element ? value.outerHTML : String(value)).join(" ") }, "*");
    };
  <\/script>` : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><base target="_blank"><style>${css}</style>${errorReporter}${consoleReporter}</head><body>${html}</body></html>`;
}

window.addEventListener("message", event => {
  if (event.source !== preview.contentWindow || !learningPath?.showConsole || event.data?.type !== "mint-preview-log" || typeof event.data.text !== "string") return;
  const output = $("#preview-console-output");
  output.textContent += (output.textContent ? "\n" : "") + event.data.text.slice(0, 2000);
  output.parentElement.scrollTop = output.parentElement.scrollHeight;
});

function updateValidationStatus(status, editor, valid) {
  status.hidden = valid;
  editor.setAttribute("aria-invalid", String(!valid));
}

function updatePreview() {
  const htmlValid = isValidHtml(htmlEditor.value);
  const cssValid = isValidCss(cssEditor.value);
  updateValidationStatus($("#html-status"), htmlEditor, htmlValid);
  updateValidationStatus($("#css-status"), cssEditor, cssValid);

  const previewPaused = !htmlValid || !cssValid;
  $("#live-state").classList.toggle("paused", previewPaused);
  $(".preview-pane").classList.toggle("paused", previewPaused);
  $("#live-state").textContent = previewPaused ? "Vorschau pausiert" : (cssEnabled ? "● live" : "CSS aus");
  if (previewPaused) return;

  $("#preview-console-output").textContent = "";
  preview.srcdoc = buildPreviewDocument();
}

function setCssMode(enabled) {
  cssEnabled = enabled;
  $("#toggle-css").classList.toggle("active", cssEnabled);
  $("#toggle-css").setAttribute("aria-pressed", String(cssEnabled));
  $("#toggle-css").lastChild.textContent = cssEnabled ? "CSS an" : "CSS aus";
  workspace.classList.toggle("css-off", !cssEnabled);
  updatePreview();
  requestAnimationFrame(refreshEditors);
}

function markChanged() {
  dirty = true;
  if (learningPath) setLearningPathState(learningPathStep, { html: htmlEditor.value, css: cssEditor.value });
  refreshEditors();
  updatePreview();
}

function bindEditor(editor, highlighted, gutter) {
  editor.addEventListener("input", markChanged);
  editor.addEventListener("scroll", () => {
    highlighted.scrollTop = editor.scrollTop;
    highlighted.scrollLeft = editor.scrollLeft;
    gutter.scrollTop = editor.scrollTop;
  });
  editor.addEventListener("keydown", event => {
    if (event.key !== "Tab" || editor.readOnly) return;
    event.preventDefault();
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    markChanged();
  });
}

function mimeFromPath(path) {
  const extension = path.split(".").pop().toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif" })[extension] || "application/octet-stream";
}

function safeFilename(name) {
  return name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim() || "bild.png";
}

function uniqueAssetPath(filename) {
  const safe = safeFilename(filename);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  let path = safe;
  let number = 2;
  while (assets.has(path)) path = `${stem}-${number++}${extension}`;
  return path;
}

function addAssetBytes(path, bytes, type = mimeFromPath(path)) {
  const normalizedPath = uniqueAssetPath(path.split("/").pop());
  const old = assets.get(normalizedPath);
  if (old) URL.revokeObjectURL(old.url);
  const blob = new Blob([bytes], { type });
  assets.set(normalizedPath, { bytes: new Uint8Array(bytes), type, url: URL.createObjectURL(blob) });
}

function clearAssets() {
  for (const asset of assets.values()) URL.revokeObjectURL(asset.url);
  assets.clear();
}

function renderAssets() {
  $("#asset-count").textContent = String(assets.size);
  $("#path-asset-count").textContent = String(assets.size);
  if (!assets.size) {
    $("#asset-list").innerHTML = `<p class="asset-empty">Noch keine Bilder hochgeladen.</p>`;
    return;
  }
  $("#asset-list").innerHTML = [...assets].map(([path, asset]) => `<article class="asset"><img src="${asset.url}" alt=""><div class="asset-info"><code title="${escapeHtml(path)}">${escapeHtml(path)}</code></div><button class="remove-asset" type="button" data-remove-path="${escapeHtml(path)}" aria-label="${escapeHtml(path)} entfernen">×</button></article>`).join("");
}

function setAssetDrawer(open) {
  $("#asset-drawer").hidden = !open;
  $("#show-assets").setAttribute("aria-expanded", String(open));
  $("#path-show-assets").setAttribute("aria-expanded", String(open));
  workspace.classList.toggle("assets-open", open);
  requestAnimationFrame(refreshEditors);
}

async function addUploadedImages(fileList) {
  for (const file of fileList) {
    const path = uniqueAssetPath(file.name);
    addAssetBytes(path, new Uint8Array(await file.arrayBuffer()), file.type || mimeFromPath(path));
  }
  renderAssets();
  updatePreview();
  dirty = true;
  if (fileList.length) showToast(fileList.length === 1 ? "Bild hinzugefügt" : `${fileList.length} Bilder hinzugefügt`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { time, date } = dosDateTime();
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + name.length + bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("Komprimierte ZIP-Dateien werden von diesem Browser nicht unterstützt.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let endOffset = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { endOffset = index; break; }
  }
  if (endOffset < 0) throw new Error("Die Datei ist kein lesbares ZIP-Projekt.");

  const count = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();

  for (let entry = 0; entry < count; entry += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error("Das ZIP-Verzeichnis ist beschädigt.");
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed);
    else throw new Error(`ZIP-Komprimierung ${method} wird nicht unterstützt.`);
    if (!name.endsWith("/")) files.set(name.replace(/^\.\//, ""), content);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function htmlForArchive(source) {
  return `<!doctype html>\n<html lang="de">\n<head>\n  <meta charset="utf-8">\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${prepareInlineScripts(source, true)}\n</body>\n</html>`;
}

function bodyContentFromArchive(source) {
  const match = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) return source;
  return prepareInlineScripts(match[1].replace(/^\s*\n/, "").replace(/\n\s*$/, ""), false);
}

function cleanProjectName(name) {
  return name.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim() || "webprojekt";
}

function sanitizeLessonHtml(source) {
  const template = document.createElement("template");
  template.innerHTML = source;
  const allowedTags = new Set(["P", "DIV", "H2", "UL", "OL", "LI", "PRE", "CODE", "STRONG", "EM", "BR", "A"]);

  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!allowedTags.has(element.tagName) || (element.tagName === "DIV" && !element.classList.contains("task"))) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") : "";
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (element.tagName === "DIV") element.className = "task";
    if (element.tagName === "A" && /^(?:https?:|mailto:)/i.test(href || "")) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  }

  return template.innerHTML;
}

function normalizeLearningPath(source) {
  if (!source || typeof source !== "object" || source.format !== "mint-lernpfad" || source.version !== 1) {
    throw new Error("Die Lernpfad-Datei hat ein unbekanntes Format.");
  }
  if (typeof source.title !== "string" || !source.title.trim() || !Array.isArray(source.steps) || !source.steps.length) {
    throw new Error("Im Lernpfad fehlen Titel oder Schritte.");
  }
  if (source.baseCss !== undefined && typeof source.baseCss !== "string") throw new Error("Das Basis-CSS des Lernpfads ist ungültig.");
  if (!isValidCss(source.baseCss || "")) throw new Error("Das Basis-CSS des Lernpfads ist ungültig.");
  if (source.defaultLevel !== undefined && !["basic", "advanced"].includes(source.defaultLevel)) {
    throw new Error("Das Standardniveau des Lernpfads ist ungültig.");
  }

  const steps = source.steps.map((step, index) => {
    if (!step || typeof step !== "object" || typeof step.title !== "string" || !step.title.trim()) {
      throw new Error(`Schritt ${index + 1} hat keinen gültigen Titel.`);
    }
    for (const field of ["intro", "note", "html", "css"]) {
      if (step[field] !== undefined && typeof step[field] !== "string") throw new Error(`Schritt ${index + 1} enthält ungültige Inhalte.`);
    }
    const variants = {};
    if (step.variants !== undefined) {
      if (!step.variants || typeof step.variants !== "object" || Array.isArray(step.variants)) {
        throw new Error(`Schritt ${index + 1} enthält ungültige Niveau-Varianten.`);
      }
      const unknownLevel = Object.keys(step.variants).find(level => !["basic", "advanced"].includes(level));
      if (unknownLevel) throw new Error(`Schritt ${index + 1} enthält ein unbekanntes Niveau.`);
      for (const level of ["basic", "advanced"]) {
        const variant = step.variants[level];
        if (variant === undefined) continue;
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
          throw new Error(`Schritt ${index + 1} enthält eine ungültige Niveau-Variante.`);
        }
        for (const field of ["title", "intro", "note", "html", "css"]) {
          if (variant[field] !== undefined && typeof variant[field] !== "string") {
            throw new Error(`Schritt ${index + 1} enthält ungültige Inhalte im Niveau.`);
          }
        }
        if (variant.title !== undefined && !variant.title.trim()) {
          throw new Error(`Schritt ${index + 1} enthält einen ungültigen Titel im Niveau.`);
        }
        variants[level] = {};
        for (const field of ["title", "intro", "note", "html", "css", "htmlEditable", "cssEditable", "colorLab"]) {
          if (variant[field] !== undefined) variants[level][field] = field === "title" ? variant[field].trim() : variant[field];
        }
      }
    }
    return {
      title: step.title.trim(),
      intro: step.intro || "",
      note: step.note || "",
      html: step.html || "",
      solutionHtml: step.solutionHtml,
      css: step.css || "",
      htmlEditable: step.htmlEditable !== false,
      cssEditable: step.cssEditable !== false,
      inheritPrevious: step.inheritPrevious === true,
      goalPreview: ["slotmachine", "zahlenraten", "passwort", "sterne", "tictactoe"].includes(step.goalPreview) ? step.goalPreview : "",
      goalOnly: step.goalOnly === true,
      colorLab: step.colorLab === true,
      variants
    };
  });

  return {
    format: source.format,
    version: source.version,
    title: source.title.trim(),
    subject: typeof source.subject === "string" && source.subject.trim() ? source.subject.trim() : "Lernpfad",
    showCss: source.showCss !== false,
    showConsole: source.showConsole === true,
    baseCss: source.baseCss || "",
    defaultLevel: source.defaultLevel === "basic" ? "basic" : "advanced",
    singleLevel: source.singleLevel === true,
    steps
  };
}

function resolveLearningPathStep(step, level = learningPathLevel) {
  return { ...step, ...(step.variants[level] || {}) };
}

function hasLearningPathVariants(step) {
  return Object.keys(step.variants).length > 0;
}

function createLearningPathStates(definition) {
  return definition.steps.map(step => {
    if (!hasLearningPathVariants(step)) return { shared: { html: step.html, css: step.css } };
    const basic = resolveLearningPathStep(step, "basic");
    const advanced = resolveLearningPathStep(step, "advanced");
    return {
      basic: { html: basic.html, css: basic.css },
      advanced: { html: advanced.html, css: advanced.css }
    };
  });
}

function getLearningPathState(index) {
  const states = learningPathStates[index];
  return states.shared || states[learningPathLevel];
}

function setLearningPathState(index, state) {
  const states = learningPathStates[index];
  if (states.shared) states.shared = state;
  else states[learningPathLevel] = state;
}

function setLearningPathLevel(level) {
  if (!learningPath || learningPath.singleLevel || !["basic", "advanced"].includes(level) || level === learningPathLevel) return;
  learningPathLevel = level;
  renderLearningPathStep();
  showToast(level === "basic" ? "Grundlegendes Niveau" : "Erweitertes Niveau");
}

function setEditorReadonly(editor, pane, state, readonly, editableLabel) {
  editor.readOnly = readonly;
  pane.classList.toggle("is-readonly", readonly);
  state.textContent = readonly ? "Gesperrt" : editableLabel;
}

function renderLearningPathColorLab() {
  const colors = [
    ["red", "#ff0000"], ["blue", "#0000ff"], ["green", "#008000"], ["tomato", "#ff6347"],
    ["gold", "#ffd700"], ["turquoise", "#40e0d0"], ["hotpink", "#ff69b4"], ["crimson", "#dc143c"]
  ];
  const lab = document.createElement("div");
  lab.className = "path-color-lab";
  lab.innerHTML = `<label>Farbe auswählen <input class="path-color-picker" type="color" value="#ff6347"></label><div class="path-color-values"><span>Hex <code class="path-color-hex"></code></span><span>RGB <code class="path-color-rgb"></code></span></div><div class="path-color-words">${colors.map(([name, value]) => `<button class="path-color-word" type="button" data-color="${value}">${name}</button>`).join("")}</div>`;
  $("#path-intro").prepend(lab);
  const picker = lab.querySelector(".path-color-picker");
  const showColor = value => {
    const number = Number.parseInt(value.slice(1), 16);
    picker.value = value;
    lab.querySelector(".path-color-hex").textContent = value.toUpperCase();
    lab.querySelector(".path-color-rgb").textContent = `rgb(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255})`;
  };
  picker.addEventListener("input", () => showColor(picker.value));
  lab.addEventListener("click", event => {
    const button = event.target.closest("[data-color]");
    if (button) showColor(button.dataset.color);
  });
  showColor(picker.value);
}

function renderLearningPathSteps() {
  $("#path-steps").innerHTML = learningPath.steps.map((sourceStep, index) => {
    const step = resolveLearningPathStep(sourceStep);
    return `<button class="path-step ${index === learningPathStep ? "active" : ""} ${learningPathVisited.has(index) ? "done" : ""}" data-path-step="${index}" type="button"><span class="path-step-number">${learningPathVisited.has(index) && index !== learningPathStep ? "✓" : index + 1}</span><span class="path-step-name">${escapeHtml(step.title)}</span></button>`;
  }).join("");
}

function renderLearningPathStep() {
  resetPathImageClicks();
  if (!learningPath) return;
  const step = resolveLearningPathStep(learningPath.steps[learningPathStep]);
  const state = getLearningPathState(learningPathStep);
  learningPathVisited.add(learningPathStep);

  $("#path-level-switch").hidden = learningPath.singleLevel;
  $("#path-level-switch").querySelectorAll("[data-path-level]").forEach(button => {
    const active = button.dataset.pathLevel === learningPathLevel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  $("#path-step-label").textContent = `Schritt ${learningPathStep + 1} von ${learningPath.steps.length}`;
  $("#path-step-title").textContent = step.title;
  $("#path-progress").style.width = `${((learningPathStep + 1) / learningPath.steps.length) * 100}%`;
  $("#path-intro").innerHTML = sanitizeLessonHtml(step.intro);
  $("#path-note").innerHTML = sanitizeLessonHtml(step.note);
  if (step.goalPreview === "slotmachine") {
    const preview = document.createElement("div");
    preview.className = "slot-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel: drei gleiche Zahlen, Gewinnmeldung und zwei Knöpfe");
    preview.innerHTML = '<strong>ZAHLEN-SPIEL</strong><div class="slot-goal-numbers"><span>2</span><span>2</span><span>2</span></div><b>Gewonnen! ✨</b><div class="slot-goal-actions"><span>Drehen</span><span>Neu starten</span></div>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "zahlenraten") {
    const preview = document.createElement("div");
    preview.className = "guess-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel eines Zahlenratespiels: Eingabe 42, Hinweis zu klein, Knöpfe Prüfen und Neue Runde");
    preview.innerHTML = '<strong>Zahlenraten</strong><p>Rate eine Zahl von 1 bis 100</p><span class="guess-goal-input">42</span><div class="guess-goal-actions"><span>Prüfen</span><span>Neue Runde</span></div><b>Zu klein!</b>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "passwort") {
    const preview = document.createElement("div");
    preview.className = "password-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel für Passwort raten: vier Buchstabenkacheln, grün, grau, grau, gelb, Eingabefeld und Knöpfe");
    preview.innerHTML = '<strong>PASSWORT RATEN</strong><p>Finde den Code aus a bis h</p><div class="password-goal-tiles"><span class="green">A</span><span class="gray">E</span><span class="gray">H</span><span class="yellow">B</span></div><div class="password-goal-input">aehb</div><div class="password-goal-buttons"><span>Prüfen</span><span>Neues Passwort</span></div><small>Grün: richtige Stelle · Gelb: andere Stelle · Grau: nicht enthalten</small>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "sterne") {
    const preview = document.createElement("div");
    preview.className = "stars-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel: Sterne zeichnen, Eingabe 5, Knopf und fünf Sterne");
    preview.innerHTML = '<strong>Sterne zeichnen</strong><p>Wie viele Sterne möchtest du?</p><span class="stars-goal-input">5</span><span class="stars-goal-button">Zeichnen</span><div class="stars-goal-output">★★★★★</div>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "tictactoe") {
    const preview = document.createElement("div");
    preview.className = "ttt-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Tic-Tac-Toe: X hat die obere Reihe gefüllt und gewonnen. Darunter ein Neustartknopf.");
    preview.innerHTML = '<strong>Tic-Tac-Toe</strong><div class="ttt-goal-board"><span>X</span><span>X</span><span>X</span><span>O</span><span>O</span><span></span><span></span><span></span><span></span></div><p>X hat gewonnen!</p><span class="ttt-goal-button">Neu starten</span>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  $("#path-note").hidden = !step.note.trim() && (!step.goalPreview || step.goalOnly);
  $("#workspace").hidden = step.goalOnly;
  document.body.classList.toggle("path-goal-only", step.goalOnly);
  if (step.colorLab) renderLearningPathColorLab();

  htmlEditor.value = state.html;
  cssEditor.value = state.css;
  setEditorReadonly(htmlEditor, $(".html-pane"), $("#html-editor-state"), !step.htmlEditable, "Seiteninhalt");
  setEditorReadonly(cssEditor, $(".css-pane"), $("#css-editor-state"), !step.cssEditable, "styles.css");
  setCssMode(learningPath.showCss);

  $("#path-back").disabled = learningPathStep === 0;
  $("#path-next").textContent = learningPathStep === learningPath.steps.length - 1 ? "Fertig ✓" : "Weiter →";
  renderLearningPathSteps();
  document.title = `${learningPath.title} – ${step.title}`;
  $("#learning-path").scrollTop = 0;
}

function goToLearningPathStep(index) {
  if (!learningPath || index < 0 || index >= learningPath.steps.length) return;
  if (index === learningPathStep + 1 && !learningPathVisited.has(index) && learningPath.steps[index].inheritPrevious) {
    setLearningPathState(index, { ...getLearningPathState(learningPathStep) });
  }
  learningPathStep = index;
  renderLearningPathStep();
}

function deactivateLearningPath() {
  resetPathImageClicks();
  learningPath = null;
  $("#workspace").hidden = false;
  document.body.classList.remove("path-goal-only");
  $("#preview-console").hidden = true;
  learningPathStep = 0;
  learningPathLevel = "advanced";
  learningPathStates = [];
  learningPathVisited = new Set();
  learningPathInitialAssets = [];
  document.body.classList.remove("learning-path-active");
  $("#learning-path").hidden = true;
  $("#toggle-css").disabled = false;
  $("#brand-kicker").textContent = "Webprojekt";
  $("#brand-title").textContent = "HTML- und CSS-Editor";
  setEditorReadonly(htmlEditor, $(".html-pane"), $("#html-editor-state"), false, "Seiteninhalt");
  setEditorReadonly(cssEditor, $(".css-pane"), $("#css-editor-state"), false, "styles.css");
  document.title = "Codepfad";
}

function loadImagesFromArchive(files) {
  for (const [path, bytes] of files) {
    if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path)) addAssetBytes(path, bytes);
  }
}

function openLearningPath(definition, files, sourceName = definition.title) {
  deactivateLearningPath();
  clearAssets();
  loadImagesFromArchive(files);
  renderAssets();
  learningPath = definition;
  $("#preview-console").hidden = !definition.showConsole;
  learningPathLevel = definition.defaultLevel;
  learningPathInitialAssets = [...assets].map(([name, asset]) => ({ name, bytes: new Uint8Array(asset.bytes), type: asset.type }));
  learningPathStates = createLearningPathStates(definition);
  learningPathVisited = new Set();
  $("#path-subject").textContent = definition.subject;
  $("#path-title").textContent = definition.title;
  $("#brand-kicker").textContent = "Lernpfad";
  $("#brand-title").textContent = definition.title;
  document.body.classList.add("learning-path-active");
  $("#learning-path").hidden = false;
  $("#toggle-css").disabled = true;
  suggestedProjectName = cleanProjectName(sourceName);
  dirty = false;
  renderLearningPathStep();
  showToast("Lernpfad geöffnet");
}

async function loadCatalogLearningPath(id, { reload = false } = {}) {
  if (reload) await initializeCatalog();
  const entry = learningPathCatalog.get(id);
  if (!entry) throw new Error("Der gewählte Lernpfad ist nicht im Katalog.");
  const files = new Map(entry.assets.map(asset => [
    asset.name, Uint8Array.from(atob(asset.data), character => character.charCodeAt(0))
  ]));
  openLearningPath(normalizeLearningPath(entry.lesson), files, entry.id);
  activeCatalogPath = entry.id;
  closePathPicker();
  if (!$("#dev-toolbar").hidden) {
    $("#dev-path-select").value = entry.id;
    $("#dev-status").textContent = entry.label;
    const url = new URL(location.href);
    url.searchParams.set("dev", entry.id);
    history.replaceState(null, "", url);
  }
}

let selectedTopic = "";
function applyCatalog(data) {
  learningPathCatalog = new Map(data.paths.map(entry => [entry.id, entry]));
  $("#dev-path-select").replaceChildren(...data.paths.map(entry => new Option(entry.label, entry.id)));
  const topics = [...new Set(data.paths.map(entry => entry.topic))];
  if (!topics.includes(selectedTopic)) selectedTopic = "";
  $("#topics").replaceChildren(...["", ...topics].map(topic => {
    const button = document.createElement("button");
    button.textContent = topic || "Alle";
    button.dataset.topic = topic;
    return button;
  }));
  renderCourseList();
}

function renderCourseList() {
  for (const button of $("#topics").children) {
    button.setAttribute("aria-pressed", String(button.dataset.topic === selectedTopic));
  }
  const visible = [...learningPathCatalog.values()].filter(entry => !selectedTopic || entry.topic === selectedTopic);
  $("#course-count").textContent = visible.length + (visible.length === 1 ? " Lernpfad" : " Lernpfade");
  $("#learning-path-list").replaceChildren(...visible.map(entry => {
    const button = document.createElement("button");
    button.className = "learning-path-choice";
    button.dataset.learningPathId = entry.id;
    if (entry.concept) button.title = entry.concept;
    const topic = document.createElement("small");
    topic.className = "course-topic";
    topic.dataset.topic = entry.topic;
    topic.textContent = entry.topic;
    const title = document.createElement("strong");
    title.textContent = entry.label;
    const description = document.createElement("span");
    description.textContent = entry.description;
    const footer = document.createElement("span");
    footer.className = "course-footer";
    footer.textContent = entry.lesson.steps.length + " Schritte";
    const arrow = document.createElement("i");
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");
    footer.append(arrow);
    button.append(topic, title, description, footer);
    return button;
  }));
}

$("#topics").addEventListener("click", event => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  selectedTopic = button.dataset.topic;
  renderCourseList();
});

function setLibraryVisible(visible) {
  $("#path-picker-modal").hidden = !visible;
  for (const panel of document.querySelectorAll(".appbar, #dev-toolbar, #learning-path, #asset-drawer, #workspace")) {
    panel.inert = visible;
  }
  if (visible) {
    $("#path-picker-modal").scrollTop = 0;
    $("#cancel-path-picker").focus({ preventScroll: true });
  }
}

function closePathPicker() {
  setLibraryVisible(false);
  showPathPickerList();
  if (!learningPath) $("#open-learning-path").focus();
}

function showPathPickerList() {
  selectedCatalogPath = null;
  $("#path-picker-title").textContent = "Lernpfade";
  $(".library-hero p").hidden = false;
  $("#path-picker-list-view").hidden = false;
  $("#path-access-form").hidden = true;
  $("#path-access-code").value = "";
  $("#path-access-code").removeAttribute("aria-invalid");
  $("#path-access-error").hidden = true;
}

function showPathAccessForm(id) {
  const entry = learningPathCatalog.get(id);
  if (!entry) return;
  selectedCatalogPath = id;
  $("#path-picker-title").textContent = "Zugangscode eingeben";
  $(".library-hero p").hidden = true;
  $("#path-access-course").textContent = entry.label;
  $("#path-picker-list-view").hidden = true;
  $("#path-access-form").hidden = false;
  $("#path-access-code").value = "";
  $("#path-access-code").removeAttribute("aria-invalid");
  $("#path-access-error").hidden = true;
  requestAnimationFrame(() => $("#path-access-code").focus());
}

function confirmAction(question, action) {
  const dialog = $("#confirm-action");
  if (dialog.open) return Promise.resolve(false);
  $("#confirm-title").textContent = question;
  $("#confirm-continue").textContent = action;
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "continue"), { once: true });
    dialog.showModal();
  });
}

async function openPathPicker() {
  if (dirty && !await confirmAction("Ungespeicherte Änderungen beim Öffnen verwerfen?", "Fortfahren")) return;
  try {
    await catalogReady;
    showPathPickerList();
    setLibraryVisible(true);
  } catch (error) {
    showToast(error.message || "Lernpfade konnten nicht geladen werden");
  }
}

async function initializeDevelopmentMode() {
  const params = new URLSearchParams(location.search);
  if (!params.has("dev")) return;

  $("#dev-toolbar").hidden = false;
  try {
    await catalogReady;
    const requested = params.get("dev");
    await loadCatalogLearningPath(learningPathCatalog.has(requested) ? requested : learningPathCatalog.keys().next().value);
  } catch (error) {
    $("#dev-status").textContent = error.message || "Entwicklungsmodus konnte nicht gestartet werden";
    showToast($("#dev-status").textContent);
  }
}

async function closeLearningPath() {
  if (dirty && !await confirmAction("Lernpfad verlassen und ungespeicherte Änderungen verwerfen?", "Verwerfen und verlassen")) return;
  deactivateLearningPath();
  clearAssets();
  renderAssets();
  setAssetDrawer(false);
  htmlEditor.value = defaultHtml;
  cssEditor.value = defaultCss;
  suggestedProjectName = "webprojekt";
  dirty = false;
  setCssMode(false);
  showPathPickerList();
  setLibraryVisible(true);
}

function openSaveModal() {
  const input = $("#project-name");
  if (window.__TAURI__) {
    saveProject(suggestedProjectName).catch(() => showToast("Projekt konnte nicht gespeichert werden."));
    return;
  }
  $("#save-title").textContent = "Wie soll die Datei heißen?";
  input.value = suggestedProjectName;
  $("#save-modal").hidden = false;
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

function closeSaveModal() {
  $("#save-modal").hidden = true;
  $("#save-project").focus();
}

function resetSaveClickSequence() {
  clearTimeout(saveClickTimer);
  saveClickTimer = null;
  saveClickCount = 0;
}

async function openAccessCodesModal() {
  try {
    await catalogReady;
    const rows = [...learningPathCatalog.values()].map(entry => {
      const row = document.createElement("div");
      const name = document.createElement("dt");
      const code = document.createElement("dd");
      name.textContent = entry.label;
      code.textContent = entry.accessCode || "Ohne Zugangscode";
      row.append(name, code);
      return row;
    });
    $("#access-codes-list").replaceChildren(...rows);
    $("#access-codes-modal").hidden = false;
    requestAnimationFrame(() => $("#close-access-codes").focus());
  } catch (error) {
    showToast(error.message || "Zugangscodes konnten nicht geladen werden");
  }
}

function closeAccessCodesModal() {
  $("#access-codes-modal").hidden = true;
  $("#save-project").focus();
}

async function saveProject(projectName) {
  suggestedProjectName = cleanProjectName(projectName);
  const encoder = new TextEncoder();
  const files = [
    { name: "index.html", bytes: encoder.encode(htmlForArchive(htmlEditor.value)) },
    { name: "styles.css", bytes: encoder.encode(cssEditor.value) },
    ...[...assets].map(([name, asset]) => ({ name, bytes: asset.bytes }))
  ];
  const zip = createZip(files);
  if (window.__TAURI__) {
    const saved = await window.__TAURI__.core.invoke("save_project", {
      name: suggestedProjectName + ".zip", bytes: Array.from(zip)
    });
    if (saved) {
      dirty = false;
      showToast("Projekt gespeichert");
    }
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  link.download = `${suggestedProjectName}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  dirty = false;
  showToast(`${suggestedProjectName}.zip gespeichert`);
}

async function openProject(file) {
  const files = await readZip(await file.arrayBuffer());
  const decoder = new TextDecoder();
  if (!files.has("index.html") || !files.has("styles.css")) throw new Error("Im Projekt-ZIP fehlen index.html oder styles.css.");
  deactivateLearningPath();
  clearAssets();
  htmlEditor.value = bodyContentFromArchive(decoder.decode(files.get("index.html")));
  cssEditor.value = decoder.decode(files.get("styles.css"));
  loadImagesFromArchive(files);
  renderAssets();
  setCssMode(cssEditor.value.trim().length > 0);
  suggestedProjectName = cleanProjectName(file.name);
  dirty = false;
  showToast("Projekt geöffnet");
}

bindEditor(htmlEditor, $("#html-highlight"), $("#html-lines"));
bindEditor(cssEditor, $("#css-highlight"), $("#css-lines"));

$("#restart-preview").addEventListener("click", updatePreview);
$("#path-save-project").addEventListener("click", openSaveModal);

$("#path-steps").addEventListener("click", event => {
  const button = event.target.closest("[data-path-step]");
  if (button) goToLearningPathStep(Number(button.dataset.pathStep));
});
$("#path-level-switch").addEventListener("click", event => {
  const button = event.target.closest("[data-path-level]");
  if (button) setLearningPathLevel(button.dataset.pathLevel);
});
$("#path-back").addEventListener("click", () => goToLearningPathStep(learningPathStep - 1));
$("#path-next").addEventListener("click", () => {
  if (!learningPath) return;
  if (learningPathStep < learningPath.steps.length - 1) goToLearningPathStep(learningPathStep + 1);
  else showToast("Lernpfad geschafft!");
});
$("#reset-learning-path").addEventListener("click", async () => {
  if (!learningPath || !await confirmAction("Alle Änderungen und den Fortschritt dieses Lernpfads zurücksetzen?", "Zurücksetzen")) return;
  learningPathStates = createLearningPathStates(learningPath);
  learningPathVisited = new Set();
  clearAssets();
  for (const asset of learningPathInitialAssets) addAssetBytes(asset.name, asset.bytes, asset.type);
  renderAssets();
  learningPathStep = 0;
  dirty = false;
  renderLearningPathStep();
  showToast("Lernpfad zurückgesetzt");
});
$("#close-learning-path").addEventListener("click", closeLearningPath);
$("#path-add-images").addEventListener("click", () => $("#image-input").click());
function resetPathImageClicks() {
  clearTimeout(pathImageClickTimer);
  pathImageClickCount = 0;
}

$("#path-show-assets").addEventListener("click", () => {
  const solution = learningPath?.steps[learningPathStep].solutionHtml;
  if (typeof solution !== "string") {
    setAssetDrawer($("#asset-drawer").hidden);
    return;
  }

  clearTimeout(pathImageClickTimer);
  pathImageClickCount += 1;
  if (pathImageClickCount === 6) {
    resetPathImageClicks();
    htmlEditor.value = solution;
    markChanged();
    showToast("Musterlösung eingesetzt");
    return;
  }

  pathImageClickTimer = setTimeout(() => {
    if (pathImageClickCount % 2 === 1) setAssetDrawer($("#asset-drawer").hidden);
    resetPathImageClicks();
  }, 450);
});
$("#dev-path-select").addEventListener("change", async event => {
  try { await loadCatalogLearningPath(event.target.value, { reload: true }); }
  catch (error) { $("#dev-status").textContent = error.message || "Lernpfad konnte nicht geladen werden"; }
});
$("#dev-reload").addEventListener("click", async () => {
  if (!activeCatalogPath) return;
  try { await loadCatalogLearningPath(activeCatalogPath, { reload: true }); }
  catch (error) { $("#dev-status").textContent = error.message || "Lernpfad konnte nicht neu geladen werden"; }
});
$("#open-learning-path").addEventListener("click", openPathPicker);
$("#cancel-path-picker").addEventListener("click", closePathPicker);
$("#back-to-path-list").addEventListener("click", () => {
  showPathPickerList();
  requestAnimationFrame(() => $("#learning-path-list button")?.focus());
});
$("#path-picker-modal").addEventListener("click", event => {
  if (event.target === $("#path-picker-modal")) closePathPicker();
});
$("#learning-path-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-learning-path-id]");
  if (!button) return;
  const entry = learningPathCatalog.get(button.dataset.learningPathId);
  if (!entry) return;
  if (entry.accessCode === "") {
    try { await loadCatalogLearningPath(entry.id); }
    catch (error) { showToast(error.message || "Lernpfad konnte nicht geladen werden"); }
  } else {
    showPathAccessForm(entry.id);
  }
});
$("#path-access-form").addEventListener("submit", async event => {
  event.preventDefault();
  const entry = learningPathCatalog.get(selectedCatalogPath);
  const input = $("#path-access-code");
  if (!entry || input.value.trim() !== entry.accessCode) {
    input.setAttribute("aria-invalid", "true");
    $("#path-access-error").hidden = false;
    input.focus();
    input.select();
    return;
  }
  input.removeAttribute("aria-invalid");
  $("#path-access-error").hidden = true;
  try { await loadCatalogLearningPath(entry.id); }
  catch (error) { showToast(error.message || "Lernpfad konnte nicht geladen werden"); }
});

$("#toggle-css").addEventListener("click", () => {
  setCssMode(!cssEnabled);
});

$("#add-images").addEventListener("click", () => $("#image-input").click());
$("#image-input").addEventListener("change", async event => {
  await addUploadedImages([...event.target.files]);
  event.target.value = "";
  setAssetDrawer(true);
});

$("#show-assets").addEventListener("click", () => {
  setAssetDrawer($("#asset-drawer").hidden);
});

$("#asset-list").addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-path]");
  if (removeButton) {
    const asset = assets.get(removeButton.dataset.removePath);
    if (asset) URL.revokeObjectURL(asset.url);
    assets.delete(removeButton.dataset.removePath);
    renderAssets();
    updatePreview();
    dirty = true;
    showToast("Bild entfernt");
  }
});

$("#save-project").addEventListener("click", () => {
  clearTimeout(saveClickTimer);
  saveClickCount += 1;
  if (saveClickCount === 5) {
    resetSaveClickSequence();
    openAccessCodesModal();
    return;
  }
  saveClickTimer = setTimeout(() => {
    resetSaveClickSequence();
    openSaveModal();
  }, 700);
});
$("#cancel-save").addEventListener("click", closeSaveModal);
$("#save-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#project-name").value;
  closeSaveModal();
  saveProject(name);
});
$("#save-modal").addEventListener("click", event => {
  if (event.target === $("#save-modal")) closeSaveModal();
});
$("#close-access-codes").addEventListener("click", closeAccessCodesModal);
$("#access-codes-modal").addEventListener("click", event => {
  if (event.target === $("#access-codes-modal")) closeAccessCodesModal();
});
document.addEventListener("click", event => {
  if (pathImageClickCount && !event.target.closest("#path-show-assets")) resetPathImageClicks();
  if (saveClickCount && !event.target.closest("#save-project")) resetSaveClickSequence();
}, true);
document.addEventListener("keydown", event => {
  if ($("#confirm-action").open) return;
  if (event.key === "Escape" && !$("#save-modal").hidden) closeSaveModal();
  if (event.key === "Escape" && !$("#path-picker-modal").hidden) closePathPicker();
  if (event.key === "Escape" && !$("#access-codes-modal").hidden) closeAccessCodesModal();
});
$("#open-project").addEventListener("click", async () => {
  if (dirty && !await confirmAction("Ungespeicherte Änderungen beim Öffnen verwerfen?", "Fortfahren")) return;
  $("#project-input").click();
});
$("#project-input").addEventListener("change", async event => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try { await openProject(file); }
  catch (error) { showToast(error.message || "Projekt konnte nicht geöffnet werden"); }
});

window.addEventListener("resize", refreshEditors);
window.addEventListener("beforeunload", event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

renderAssets();
refreshEditors();
updatePreview();
setLibraryVisible(true);
const catalogReady = initializeCatalog();
catalogReady.then(initializeDevelopmentMode).catch(error => {
  $("#catalog-status").textContent = "Katalog konnte nicht geöffnet werden";
  showToast(error.message);
});

async function checkAppUpdate() {
  const native = window.__TAURI__?.core;
  if (!native) return;
  try {
    const version = await native.invoke("check_app_update");
    if (!version) return;
    const button = $("#install-update");
    button.textContent = "Version " + version + " installieren";
    button.hidden = false;
    button.onclick = async () => {
      if (dirty && !await confirmAction("Update installieren und ungespeicherte Änderungen verwerfen?", "Installieren")) return;
      button.disabled = true;
      try { await native.invoke("install_app_update"); }
      catch { button.disabled = false; showToast("App-Update fehlgeschlagen. Bitte erneut versuchen."); }
    };
  } catch (error) { console.info("App-Update nicht verfügbar", error); }
}
checkAppUpdate();
