const HTML_VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);
const HTML_RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

export function findHtmlTagEnd(source, start) {
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

export function isValidHtml(source) {
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

export function isValidCss(source) {
  if (!hasBalancedCssSyntax(source)) return false;
  return isValidCssContent(withoutCssComments(source), { index: 0 }, "rules", false);
}

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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

function highlightSource(source, tokenize) {
  const lines = [""];
  // Close each token on its own line so wrapping and line numbers stay aligned.
  const append = (text, tokenClass = "", markup = false) => {
    text.split("\n").forEach((part, index) => {
      if (index) lines.push("");
      const escaped = markup === "css" ? highlightCssLine(part) : markup ? highlightHtmlLine(part) : escapeHtml(part);
      lines[lines.length - 1] += tokenClass && part ? `<span class="${tokenClass}">${escaped}</span>` : escaped;
    });
  };
  tokenize(source, append);
  return lines;
}

function highlightMarkup(source, append) {
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
    else append(content, "", rawTag[1].toLowerCase() === "style" ? "css" : false);
    if (end) append(end[0], "", true);
    cursor = end ? closing.lastIndex : source.length;
    tags.lastIndex = cursor;
  }
  append(source.slice(cursor), "", true);
}

const highlighters = { html: source => highlightSource(source, highlightMarkup), javascript: source => highlightSource(source, highlightJavaScript), css: highlightCssSource };

function detectLanguage(source) {
  const start = source.trimStart().replace(/^(?:\/\*[^]*?\*\/\s*)+/, "");
  if (/^\s*(?:<!--|<!doctype\b|<\/?[a-z])/i.test(start)) return "html";
  if (/^(?:\/\/|(?:const|let|var|function|import|export|class|async|if|for|while|return)\s+|[\w$.]+\s*(?:\(|=(?!=)|\+\+|--))/.test(start)) return "javascript";
  if ((start.includes("{") && isValidCss(start)) || /^\s*(?:[.#@][\w-]+|[a-z][\w-]*\s*\{)/i.test(start) || /^[-\w]+\s*:\s*[^{}]+;/.test(start)) return "css";
  if (/<\/?[a-z][\w:-]*(?:\s|\/?>)/i.test(start)) return "html";
  if (/=>|[;{}]/.test(start)) return "javascript";
  return "html";
}

export function highlightEditorSource(source, language = detectLanguage(source)) {
  return highlighters[language](source);
}

function highlightCssLine(line) {
  if (/^\s*\/\*/.test(line) || /^\s*\*/.test(line)) return `<span class="tok-comment">${escapeHtml(line)}</span>`;
  const selector = line.match(/^(\s*)([^{}]+)(\s*\{\s*)$/);
  if (selector) return `${escapeHtml(selector[1])}<span class="tok-selector">${escapeHtml(selector[2])}</span><span class="tok-punc">${escapeHtml(selector[3])}</span>`;
  if (/^\s*}\s*$/.test(line)) return `<span class="tok-punc">${escapeHtml(line)}</span>`;
  const declaration = line.match(/^(\s*)(--[-\w]+|[-a-zA-Z]+)(\s*:\s*)(.*?)(;?\s*)$/);
  if (declaration) return `${escapeHtml(declaration[1])}<span class="tok-property">${escapeHtml(declaration[2])}</span><span class="tok-punc">${escapeHtml(declaration[3])}</span><span class="tok-value">${escapeHtml(declaration[4])}</span><span class="tok-punc">${escapeHtml(declaration[5])}</span>`;
  const inline = line.match(/^(\s*)([^{}]+)(\{)([^{}]*)(\})(\s*)$/);
  if (inline) return `${escapeHtml(inline[1])}<span class="tok-selector">${escapeHtml(inline[2])}</span><span class="tok-punc">{</span>${inline[4].split(/(?<=;)/).map(highlightCssLine).join("")}<span class="tok-punc">}</span>${escapeHtml(inline[6])}`;
  return escapeHtml(line);
}

export function highlightCssSource(source) {
  return source.split("\n").map(highlightCssLine);
}
