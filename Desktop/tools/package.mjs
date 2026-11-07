import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const source = path.resolve(desktop, "../Lernpfade");
const dist = path.join(desktop, "dist");
const output = path.join(dist, "content");
await mkdir(output, { recursive: true });
await cp(path.join(desktop, "editor"), dist, { recursive: true });

const paths = [];
for (const folder of await readdir(source, { withFileTypes: true })) {
  if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
  const directory = path.join(source, folder.name);
  const entry = JSON.parse(await readFile(path.join(directory, "lernpfad.json"), "utf8"));
  if (entry.id !== folder.name || !/^[a-z0-9-]+$/.test(entry.id) ||
      !Number.isSafeInteger(entry.order) || !entry.label || !entry.topic ||
      typeof entry.description !== "string" || !Array.isArray(entry.assets) ||
      typeof entry.accessCode !== "string" || !entry.lesson?.steps?.length ||
      entry.lesson.format !== "mint-lernpfad" || entry.lesson.version !== 1) {
    throw new Error(`Ungültiger Lernpfad in ${directory}`);
  }
  const images = [];
  for (const name of entry.assets) {
    if (!/^[^/\\]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) throw new Error(`Ungültiges Bild: ${name}`);
    const bytes = await readFile(path.join(directory, "assets", name));
    images.push({ name, data: bytes.toString("base64") });
  }
  paths.push({ ...entry, assets: images });
}
if (!paths.length) throw new Error("Keine Lernpfade gefunden");
paths.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, "en"));
const bytes = JSON.stringify({ format: 1, paths });
if (Buffer.byteLength(bytes) > 32 * 1024 * 1024) throw new Error("Das Inhaltspaket überschreitet 32 MiB");
const digest = createHash("sha256").update(bytes).digest("hex");
await writeFile(path.join(output, digest + ".json"), bytes);
await writeFile(path.join(output, "manifest.json"), JSON.stringify({ format: 1, digest }) + "\n");
for (const name of await readdir(output)) {
  if (/^[a-f0-9]{64}\.json$/.test(name) && name !== digest + ".json") await unlink(path.join(output, name));
}
console.log(`${paths.length} Lernpfade · ${digest}`);
