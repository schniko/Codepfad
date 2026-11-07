import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";

const dist = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("content/manifest.json", dist)));
const original = JSON.parse(await readFile(new URL("content/" + manifest.digest + ".json", dist)));
const feed = "https://raw.githubusercontent.com/schniko/Codepfad/content-v1/";

async function checkCatalog(t, mount) {
  const server = createServer(async (req, res) => {
    try {
      assert.ok(req.url.startsWith(mount));
      const relative = req.url.slice(mount.length) || "index.html";
      const file = new URL(relative, dist);
      assert.ok(file.href.startsWith(dist.href));
      const bytes = await readFile(file);
      const types = { js: "text/javascript", css: "text/css", svg: "image/svg+xml", html: "text/html", json: "application/json" };
      res.writeHead(200, { "Content-Type": types[file.pathname.split(".").pop()] });
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  const next = structuredClone(original);
  const firstJs = next.paths.find(path => path.id === "jsfunktionen");
  firstJs.lesson.title = "Aktualisierte Aufgabe";
  next.paths.push({ ...firstJs, id: "neuer-kurs", label: "Neuer Kurs" });
  let payload = JSON.stringify(next);
  let digest = createHash("sha256").update(payload).digest("hex");
  let release;
  const holdUpdate = new Promise(resolve => { release = resolve; });
  let network = "online";
  await context.route(feed + "**", async route => {
    if (network === "offline") return route.abort();
    await holdUpdate;
    const body = route.request().url().endsWith("manifest.json")
      ? JSON.stringify({ format: 1, digest }) : payload;
    await route.fulfill({ contentType: "application/json", body });
  });

  await page.goto(`http://127.0.0.1:${server.address().port}${mount}`);
  const choices = page.locator(".learning-path-choice");
  await choices.first().waitFor();
  assert.equal(await choices.count(), original.paths.length);
  await page.getByRole("button", { name: "JavaScript", exact: true }).click();
  assert.equal(await choices.count(), original.paths.filter(item => item.topic === "JavaScript").length);
  await page.locator('[data-learning-path-id="jsfunktionen"]').click();
  await page.frameLocator("#preview").getByRole("button", { name: "Klick mich" }).click();
  await page.waitForFunction(() => document.querySelector("#preview-console-output").innerText === "Hallo!");
  const editor = page.locator("#html-code");
  const changed = (await editor.inputValue()).replace("Hallo!", "Geändert!");
  await editor.fill(changed);
  await page.locator("#close-learning-path").click();
  await page.locator("#confirm-action").getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(await editor.inputValue(), changed);
  release();
  await page.waitForFunction(() => document.querySelector("#catalog-status").textContent === "Lernpfade aktuell");
  assert.equal(await page.locator("#path-title").textContent(), original.paths.find(path => path.id === "jsfunktionen").lesson.title);
  await page.locator("#close-learning-path").click();
  await page.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await page.locator('[data-learning-path-id="neuer-kurs"]').click();
  assert.equal(await page.locator("#path-title").textContent(), "Aktualisierte Aufgabe");

  // A mismatching digest, an invalid lesson and a network failure must all keep the complete last good catalog.
  for (const failure of ["corrupt", "invalid", "offline"]) {
    if (failure === "corrupt") digest = "a".repeat(64);
    if (failure === "invalid") {
      const malformed = structuredClone(next);
      malformed.paths[0].lesson.steps = [];
      payload = JSON.stringify(malformed);
      digest = createHash("sha256").update(payload).digest("hex");
    }
    if (failure === "offline") network = "offline";
    await page.reload();
    await page.locator('[data-learning-path-id="neuer-kurs"]').waitFor();
    await page.waitForFunction(() => document.querySelector("#catalog-status").title.includes("offline"));
    assert.equal(await choices.count(), next.paths.length);
  }

  await page.locator('[data-learning-path-id="html"]').click();
  await page.locator("#path-access-code").fill("falsch");
  await page.locator("#path-access-form button[type=submit]").click();
  assert.equal(await page.locator("#path-access-error").isVisible(), true);
  await page.locator("#path-access-code").fill(original.paths.find(item => item.id === "html").accessCode);
  await page.locator("#path-access-form button[type=submit]").click();
  assert.equal(await page.locator("#path-asset-count").textContent(), "3");
  const portrait = page.frameLocator("#preview").getByRole("img", { name: "Mira mit einem Kompass" });
  await portrait.evaluate(image => image.decode());
  await page.locator("#path-save-project").click();
  const download = page.waitForEvent("download");
  await page.locator("#save-form button[type=submit]").click();
  const file = await download;
  await page.locator("#close-learning-path").click();
  await page.locator("#cancel-path-picker").click();
  await page.locator("#project-input").setInputFiles(await file.path());
  await page.waitForFunction(() => document.querySelector("#toast").textContent === "Projekt geöffnet");
  assert.equal(await page.locator("#asset-count").textContent(), "3");
  await portrait.evaluate(image => image.decode());
  assert.deepEqual(errors, []);
}

for (const mount of ["/", "/Codepfad/"]) {
  test(`Katalog, Editor und ZIP-Export unter ${mount}`, t => checkCatalog(t, mount));
}
