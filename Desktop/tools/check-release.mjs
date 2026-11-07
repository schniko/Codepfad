import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const desktop = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, desktop), "utf8");
const config = JSON.parse(await read("src-tauri/tauri.conf.json"));
const pkg = JSON.parse(await read("package.json"));
const lock = JSON.parse(await read("package-lock.json"));
const cargo = await read("src-tauri/Cargo.toml");
const cargoLock = await read("src-tauri/Cargo.lock");
const version = config.version;

assert.match(version, /^\d+\.\d+\.\d+$/, "Für Releases eine stabile Version wie 0.1.1 verwenden.");
const versions = {
  "package.json": pkg.version,
  "package-lock.json": lock.version,
  "package-lock.json (Root-Paket)": lock.packages?.[""]?.version,
  "Cargo.toml": cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1].match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  "Cargo.lock (codepfad)": cargoLock.match(/\[\[package\]\]\nname = "codepfad"\nversion = "([^"]+)"/)?.[1]
};
for (const [file, actual] of Object.entries(versions)) {
  assert.equal(actual, version, `${file}: Version muss mit tauri.conf.json (${version}) übereinstimmen.`);
}
const tag = process.argv[2];
if (tag !== undefined) assert.equal(tag, `app-v${version}`, `Release-Tag muss app-v${version} sein.`);
console.log(`Release-Version ${version} und Lockdateien stimmen überein${tag ? ` · ${tag}` : ""}.`);
