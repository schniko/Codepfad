import { prepareInlineScripts } from "./editor-preview.js";

export function mimeFromPath(path) {
  const extension = path.split(".").pop().toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif" })[extension] || "application/octet-stream";
}

function safeFilename(name) {
  return name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim() || "bild.png";
}

export function uniqueAssetPath(filename, assets, folder = "") {
  const safe = safeFilename(filename);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const extension = dot > 0 ? safe.slice(dot) : "";
  let path = folder + safe;
  let number = 2;
  while (assets.has(path)) path = `${folder}${stem}-${number++}${extension}`;
  return path;
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

export function createZip(files, comment = "") {
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
  const encodedComment = encoder.encode(comment);
  const zipComment = encodedComment.length <= 65535 ? encodedComment : new Uint8Array();
  const end = new Uint8Array(22 + zipComment.length);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, zipComment.length, true);
  end.set(zipComment, 22);
  return concatBytes([...localParts, ...centralParts, end]);
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("Komprimierte ZIP-Dateien werden von diesem Browser nicht unterstützt.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let endOffset = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50 && index + 22 + view.getUint16(index + 20, true) === bytes.length) {
      endOffset = index;
      break;
    }
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
    const path = name.replace(/^\.\//, "");
    if (!path || path.startsWith("/") || path.includes("\\") || path.replace(/\/$/, "").split("/").some(part => !part || part === ".." || part === ".")) {
      throw new Error("Das ZIP enthält einen ungültigen Dateipfad.");
    }
    files.set(path, content);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return { files, comment: decoder.decode(bytes.subarray(endOffset + 22)) };
}

export function htmlForArchive(source, includeStyles = true) {
  const stylesheet = includeStyles ? '\n  <link rel="stylesheet" href="styles.css">' : "";
  return `<!doctype html>\n<html lang="de">\n<head>\n  <meta charset="utf-8">${stylesheet}\n</head>\n<body>\n${prepareInlineScripts(source, true)}\n</body>\n</html>`;
}

export function cleanProjectName(name) {
  return name.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim() || "webprojekt";
}
