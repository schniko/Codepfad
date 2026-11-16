import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

// npm version updates package.json and package-lock.json before running this hook.
const desktop = new URL("../", import.meta.url);
const read = file => readFile(new URL(file, desktop), "utf8");
const { version } = JSON.parse(await read("package.json"));
assert.match(version, /^\d+\.\d+\.\d+$/, "Eine stabile Version wie 1.0.1 verwenden.");

const config = JSON.parse(await read("src-tauri/tauri.conf.json"));
config.version = version;
const cargo = await read("src-tauri/Cargo.toml");
const cargoLock = await read("src-tauri/Cargo.lock");
const packageVersion = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*\n)/;
const lockedVersion = /(\[\[package\]\]\nname = "codepfad"\nversion = ")[^"]+("\n)/;
assert.match(cargo, packageVersion, "Paketversion fehlt in Cargo.toml.");
assert.match(cargoLock, lockedVersion, "Codepfad fehlt in Cargo.lock.");

await writeFile(new URL("src-tauri/tauri.conf.json", desktop), JSON.stringify(config, null, 2) + "\n");
await writeFile(new URL("src-tauri/Cargo.toml", desktop), cargo.replace(packageVersion, (_, before, after) => before + version + after));
await writeFile(new URL("src-tauri/Cargo.lock", desktop), cargoLock.replace(lockedVersion, (_, before, after) => before + version + after));
console.log(`Desktop-Version auf ${version} synchronisiert.`);
