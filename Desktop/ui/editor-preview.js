import { findHtmlTagEnd } from "./editor-code.js";

function replaceAllLiteral(text, search, replacement) {
  return text.split(search).join(replacement);
}

function resolveAssets(text, assets) {
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

export function prepareInlineScripts(source, addStrictMode) {
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

function localPath(reference, owner = "index.html") {
  const base = new URL("https://codepfad.invalid/");
  try {
    const url = new URL(reference, new URL(owner, base));
    return url.origin === base.origin ? decodeURIComponent(url.pathname.slice(1)) : null;
  } catch { return null; }
}

export function isFullHtml(source) {
  return /^\s*(?:<!--[^]*?-->\s*)*(?:<!doctype\s+html\b|<html\b|<head\b)/i.test(source);
}

function inlineProjectFragment(source, state, links) {
  const template = document.createElement("template");
  template.innerHTML = source;
  for (const element of template.content.querySelectorAll('link[rel~="stylesheet"][href], script[src]')) {
    const script = element.tagName === "SCRIPT";
    const attribute = script ? "src" : "href";
    const path = localPath(element.getAttribute(attribute));
    const mainStyles = !script && path === "styles.css" && state.hasStyles;
    if (mainStyles) {
      links.mainStyles = true;
    }
    if (!script && path === "styles.css" && !mainStyles && !state.files.has(path)) {
      element.remove();
      continue;
    }
    if (!mainStyles && !state.files.has(path)) continue;
    const source = mainStyles ? state.css : state.files.get(path);
    if (script) {
      element.setAttribute("src", "data:text/javascript;charset=utf-8," + encodeURIComponent(source));
    } else {
      const style = document.createElement("style");
      if (element.media) style.media = element.media;
      const css = source.replace(/url\(\s*(["']?)([^)'"\s]+)\1\s*\)/gi, (match, quote, reference) => {
        const name = localPath(reference, path);
        const asset = state.assets.get(name);
        return asset ? `url("${resolveAssets(name, new Map([[name, asset]]))}")` : match;
      });
      style.textContent = css.replace(/<\/style/gi, "<\\/style");
      element.replaceWith(style);
    }
  }
  return template.innerHTML;
}

export function buildPreviewDocument(state) {
  const full = !state.lesson && isFullHtml(state.html);
  const links = { mainStyles: false };
  const source = state.lesson ? state.html : full
    ? state.html.replace(/(<(?:head|body)\b[^>]*>)([^]*?)(<\/(?:head|body)\s*>)/gi,
      (_, open, content, close) => open + inlineProjectFragment(content, state, links) + close)
    : inlineProjectFragment(state.html, state, links);
  const html = prepareInlineScripts(resolveAssets(source, state.assets), true);
  const baseCss = resolveAssets(state.baseCss, state.assets);
  const editableCss = state.cssEnabled && !full && !links.mainStyles ? resolveAssets(state.css, state.assets) : "";
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
  const consoleReporter = state.showConsole ? `<script>
    console.log = function (...values) {
      parent.postMessage({ type: "mint-preview-log", text: values.map(value => value instanceof Element ? value.outerHTML : String(value)).join(" ") }, "*");
    };
  <\/script>` : "";
  const head = `<base target="_blank"><style>${css}</style>${errorReporter}${consoleReporter}`;
  if (full) {
    if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, tag => tag + head);
    return html.replace(/^(\s*(?:<!doctype[^>]*>\s*)?(?:<html\b[^>]*>)?)/i, start => start + `<head>${head}</head>`);
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">${head}</head><body>${html}</body></html>`;
}
