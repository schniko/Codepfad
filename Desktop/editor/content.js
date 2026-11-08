// A complete catalog (including images) is the unit of an offline update.
const contentFeed = "https://raw.githubusercontent.com/schniko/Codepfad/content-v1/";
const maxContentBytes = 32 * 1024 * 1024;

function openCatalogCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("codepfad-content", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("catalog");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function cachedCatalog(value) {
  const database = await openCatalogCache();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("catalog", value ? "readwrite" : "readonly");
      const store = transaction.objectStore("catalog");
      const request = value ? store.put(value, "current") : store.get("current");
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function validateCatalog(data) {
  if (data.format !== 1 || !Array.isArray(data.paths) || !data.paths.length) throw new Error("Unbekanntes Katalogformat");
  const ids = new Set();
  for (const entry of data.paths) {
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id) ||
        typeof entry.label !== "string" || typeof entry.description !== "string" ||
        typeof entry.topic !== "string" ||
        !Array.isArray(entry.assets)) throw new Error("Ungültiger Katalogeintrag");
    ids.add(entry.id);
    normalizeLearningPath(entry.lesson);
    for (const asset of entry.assets) {
      if (typeof asset.name !== "string" || typeof asset.data !== "string" || !atob(asset.data).length) {
        throw new Error("Ungültiges Lernpfadbild");
      }
    }
  }
  return data;
}

async function readContentFile(base, filename) {
  const response = await fetch(new URL(filename, base), { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Katalogabruf fehlgeschlagen (${response.status})`);
  if (Number(response.headers.get("content-length")) > maxContentBytes) throw new Error("Katalog zu groß");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxContentBytes) throw new Error("Katalog zu groß");
  return bytes;
}

async function readManifest(base) {
  const info = JSON.parse(new TextDecoder().decode(await readContentFile(base, "manifest.json")));
  if (info.format !== 1 || !/^[a-f0-9]{64}$/.test(info.digest)) throw new Error("Unbekannte Katalogversion");
  return info.digest;
}

async function readCatalog(base, digest) {
  const bytes = await readContentFile(base, digest + ".json");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("") !== digest) {
    throw new Error("Unvollständiges Lernpfadpaket");
  }
  return validateCatalog(JSON.parse(new TextDecoder().decode(bytes)));
}

async function initializeCatalog() {
  const local = new URL("content/", document.baseURI);
  const bundled = await readManifest(local);
  let digest = bundled;
  let data;
  try {
    const saved = await cachedCatalog();
    if (saved?.bundled === bundled) {
      data = validateCatalog(saved.data);
      digest = saved.digest;
    }
  } catch (error) { console.warn("Lokaler Katalogcache", error); }
  applyCatalog(data ?? await readCatalog(local, bundled));
  refreshCatalog(bundled, digest);
}

async function refreshCatalog(bundled, current) {
  try {
    const digest = await readManifest(contentFeed);
    if (digest !== current) {
      const data = await readCatalog(contentFeed, digest);
      await cachedCatalog({ bundled, digest, data });
      // An open lesson holds its own snapshot. Only future selections use this map.
      applyCatalog(data);
    }
  } catch (error) {
    console.info("Inhaltsupdate nicht verfügbar", error);
  }
}
