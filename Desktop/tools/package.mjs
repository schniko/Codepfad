import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const source = path.resolve(desktop, "../Lernpfade");
const editor = path.join(desktop, "editor");
const dist = path.join(desktop, "dist");
const output = path.join(dist, "content");
await mkdir(output, { recursive: true });
await cp(editor, dist, { recursive: true });

const referenceIndex = {};
for (const [folder, topic] of [["html", "HTML"], ["css", "CSS"], ["javascript", "JavaScript"]]) {
  const directory = path.join(editor, "nachschlagewerk", folder);
  const articles = [];
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".html")) continue;
    const id = path.basename(filename, ".html");
    const article = await readFile(path.join(directory, filename), "utf8");
    const metadata = article.match(/<script type="application\/json" id="reference-meta">([\s\S]*?)<\/script>/);
    if (!/^[a-z0-9-]+$/.test(id) || !metadata) throw new Error(`Ungültiger Nachschlageartikel: ${folder}/${filename}`);
    const { title, tags = [], aliases = [], terms = "" } = JSON.parse(metadata[1]);
    if (typeof title !== "string" || !title || typeof terms !== "string" ||
        !Array.isArray(tags) || !tags.every(tag => typeof tag === "string") ||
        !Array.isArray(aliases) || !aliases.every(alias => typeof alias === "string" && /^[a-z0-9-]+$/.test(alias))) {
      throw new Error(`Ungültige Metadaten im Nachschlageartikel: ${folder}/${filename}`);
    }
    articles.push({ id, title, tags, aliases, terms });
  }
  referenceIndex[topic] = articles.sort((a, b) => a.title.localeCompare(b.title, "de"));
}
await writeFile(path.join(dist, "reference-data.js"), `const referenceEntries = ${JSON.stringify(referenceIndex)};\n`);

const paths = [];
for (const folder of await readdir(source, { withFileTypes: true })) {
  if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
  const directory = path.join(source, folder.name);
  const entry = JSON.parse(await readFile(path.join(directory, "lernpfad.json"), "utf8"));
  if (entry.id !== folder.name || !/^[a-z0-9-]+$/.test(entry.id) ||
      !Number.isSafeInteger(entry.order) || !entry.label || !entry.topic ||
      typeof entry.description !== "string" || !Array.isArray(entry.assets) ||
      !entry.lesson?.steps?.length ||
      entry.lesson.format !== "mint-lernpfad" || entry.lesson.version !== 1) {
    throw new Error(`Ungültiger Lernpfad in ${directory}`);
  }
  const images = [];
  for (const name of entry.assets) {
    if (!/^[^/\\]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) throw new Error(`Ungültiges Bild: ${name}`);
    const bytes = await readFile(path.join(directory, "assets", name));
    images.push({ name, data: bytes.toString("base64") });
  }
  // Older desktop builds require this field in catalog format 1.
  paths.push({ ...entry, assets: images, accessCode: "" });
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
