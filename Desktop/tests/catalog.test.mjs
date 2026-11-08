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
  await page.locator("#preview").scrollIntoViewIfNeeded();
  await page.frameLocator("#preview").getByRole("button", { name: "Klick mich" }).click();
  await page.locator("#preview-console-output").filter({ hasText: /^Hallo!$/ }).waitFor();
  const assetButton = page.locator("#path-show-assets");
  const sourceBefore = await page.locator("#html-code").inputValue();
  for (let click = 1; click <= 6; click += 1) {
    await assetButton.click();
    assert.equal(await assetButton.getAttribute("aria-expanded"), String(click % 2 === 1));
  }
  assert.equal(await page.locator("#html-code").inputValue(), sourceBefore);
  const editor = page.locator("#html-code");
  const changed = (await editor.inputValue()).replace("Hallo!", "Geändert!");
  await editor.fill(changed);
  await page.locator("#close-learning-path").click();
  await page.locator("#confirm-action").getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(await editor.inputValue(), changed);
  release();
  const newCourse = page.locator('[data-learning-path-id="neuer-kurs"]');
  await newCourse.waitFor({ state: "attached" });
  assert.equal(await page.locator("#path-title").textContent(), original.paths.find(path => path.id === "jsfunktionen").lesson.title);
  await page.locator("#close-learning-path").click();
  await page.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await newCourse.click();
  assert.equal(await page.locator("#path-title").textContent(), "Aktualisierte Aufgabe");
  await page.locator("#close-learning-path").click();
  await page.locator('#topics [data-topic=""]').click();

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
    await Promise.all([
      page.waitForEvent("console", message => message.text().startsWith("Inhaltsupdate nicht verfügbar")),
      page.reload(),
    ]);
    await newCourse.waitFor();
    assert.equal(await choices.count(), next.paths.length);
  }

  await page.locator('[data-learning-path-id="html"]').click();
  await page.locator("#path-asset-count").filter({ hasText: /^3$/ }).waitFor();
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
  const projectFiles = page.getByRole("complementary", { name: "Projektdateien" });
  assert.equal(await projectFiles.locator('.project-tree button[title$=".svg"]').count(), 3);
  await portrait.evaluate(image => image.decode());

  await projectFiles.getByRole("button", { name: "styles.css", exact: true }).click();
  await page.getByRole("textbox", { name: "CSS-Quelltext" }).waitFor();
  assert.equal(new URL(page.url()).hash, "#editor");
  await page.reload();

  const editorHome = page.getByRole("button", { name: "Zur Startseite", exact: true });
  const confirmation = page.locator("#confirm-action");
  await editorHome.click();
  await confirmation.getByRole("heading", { name: "Editor wirklich verlassen?" }).waitFor();
  await confirmation.getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(new URL(page.url()).hash, "#editor");
  await editor.fill("<h1>Entwurf</h1>");
  await editorHome.click();
  await confirmation.getByRole("button", { name: "Verwerfen und verlassen" }).click();
  await page.waitForURL(url => url.hash === "#lernpfade");
  await page.locator("#nav-reference").click();
  await page.getByRole("group", { name: "Sprache auswählen" }).getByRole("button", { name: "CSS", exact: true }).click();
  await page.getByRole("searchbox", { name: "Einträge durchsuchen" }).fill("margin-left");
  const entry = page.locator('.reference-card[data-reference-entry="aussenabstaende"]');
  await entry.click();
  assert.match(new URL(page.url()).hash, /^#nachschlagewerk\/css\/aussenabstaende\?suche=margin-left/);
  await page.reload();
  await page.getByRole("heading", { name: "Außenabstände", exact: true }).waitFor();
  await page.frameLocator("#reference-article iframe").first().getByText("Mira am Meer").waitFor();
  await page.getByRole("button", { name: "Im Playground öffnen" }).first().click();
  const playground = page.getByRole("dialog", { name: "Playground", exact: true });
  const playgroundSource = playground.getByRole("textbox", { name: "CSS-Quelltext" });
  const originalSource = await playgroundSource.inputValue();
  const playgroundCss = ".karte { color: rgb(255, 0, 0); }";
  await playgroundSource.fill(playgroundCss);
  const live = playground.frameLocator('iframe[srcdoc*="rgb(255, 0, 0)"]');
  const liveCard = live.locator(".karte");
  assert.equal(await liveCard.evaluate(element => getComputedStyle(element).color), "rgb(255, 0, 0)");
  await playground.getByRole("button", { name: "Beispiel zurücksetzen" }).click();
  assert.equal(await playgroundSource.inputValue(), originalSource);
  await page.keyboard.press("Escape");
  await playground.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Außenabstände", exact: true }).waitFor();
  await page.goBack();
  await entry.waitFor();
  assert.equal(await page.locator("#reference-query").inputValue(), "margin-left");
  await page.locator("#nav-paths").click();
  await page.locator('#topics [data-topic="CSS"]').click();
  assert.equal(new URL(page.url()).hash, "#lernpfade?thema=CSS");
  await page.reload();
  await page.locator('#topics [data-topic="CSS"][aria-pressed="true"]').waitFor();
  assert.equal(await choices.count(), next.paths.filter(item => item.topic === "CSS").length);

  await page.goto(new URL("#lernpfade/html/4?stufe=basic", page.url()).href);
  const imageStep = page.locator("#path-step-title").filter({ hasText: /^Bilder$/ });
  await imageStep.waitFor();
  assert.equal(await page.locator('[data-path-level="basic"]').getAttribute("aria-pressed"), "true");
  await page.locator("#path-reference").click();
  await page.reload();
  await page.locator("#return-from-reference").click();
  assert.equal(new URL(page.url()).hash, "#lernpfade/html/4?stufe=basic");
  await imageStep.waitFor();
  assert.deepEqual(errors, []);

  const standalone = await context.newPage();
  await standalone.goto(new URL("nachschlagewerk/javascript/if-verzweigung.html", page.url()).href);
  await standalone.getByRole("button", { name: "Im Playground öffnen" }).first().click();
  const javascript = standalone.getByRole("textbox", { name: "JavaScript-Quelltext" });
  await javascript.fill('console.log("Playground läuft");');
  await standalone.frameLocator('iframe[title="Playground-Vorschau"]').getByText("Playground läuft", { exact: true }).waitFor();

  await standalone.goto(new URL("../../#editor", standalone.url()).href);
  const tree = standalone.getByRole("complementary", { name: "Projektdateien" });
  await tree.getByRole("button", { name: "Neuer Ordner", exact: true }).click();
  const folderDialog = standalone.getByRole("dialog", { name: "Neuen Ordner anlegen" });
  await folderDialog.getByLabel("Ordnername").fill("scripts");
  await folderDialog.getByRole("button", { name: "Anlegen" }).click();
  await tree.getByRole("button", { name: "Neue Datei", exact: true }).click();
  const fileDialog = standalone.getByRole("dialog", { name: "Neue Datei anlegen" });
  const filename = fileDialog.getByLabel("Dateiname");
  await filename.fill("invalid/name.js");
  await filename.press("Enter");
  await fileDialog.getByRole("alert").waitFor();
  await filename.fill("main.js");
  await filename.press("Enter");
  const source = standalone.getByRole("textbox", { name: "scripts/main.js" });
  await source.fill('document.querySelector("h1").textContent = "Projekt läuft";');
  const tabs = standalone.locator(".project-tabs");
  await tabs.getByRole("button", { name: "index.html", exact: true }).click();
  await standalone.locator("#html-code").fill('<!doctype html><html><head><script src="scripts/main.js" defer></script></head><body><h1>Start</h1></body></html>');
  await standalone.frameLocator("#preview").getByRole("heading", { name: "Projekt läuft" }).waitFor();
  await tabs.getByRole("button", { name: "main.js", exact: true }).click();
  assert.match(await source.inputValue(), /Projekt läuft/);
  const scriptTab = tabs.getByRole("button", { name: "main.js", exact: true });
  const htmlTab = tabs.getByRole("button", { name: "index.html", exact: true });
  await scriptTab.dragTo(htmlTab, { targetPosition: { x: 5, y: 10 } });
  assert.deepEqual(await tabs.locator("button[aria-pressed]").allTextContents(), ["main.js", "index.html"]);
  assert.equal(await scriptTab.getAttribute("aria-pressed"), "true");

  await standalone.getByRole("button", { name: "Codeansicht teilen" }).click();
  const rightCode = standalone.getByRole("region", { name: "Rechte Codeansicht" });
  await rightCode.getByRole("textbox", { name: "HTML-Quelltext" }).waitFor();
  assert.match(await source.inputValue(), /Projekt läuft/);
  await scriptTab.dragTo(rightCode.getByRole("button", { name: "index.html", exact: true }), { targetPosition: { x: 5, y: 10 } });
  await rightCode.getByRole("textbox", { name: "scripts/main.js" }).waitFor();
  await standalone.getByRole("button", { name: "Codeansichten zusammenführen" }).click();
  assert.deepEqual(await tabs.locator("button[aria-pressed]").allTextContents(), ["main.js", "index.html"]);

  await standalone.getByRole("textbox", { name: "Projektname" }).fill("Mein erstes Projekt");
  const projectDownload = standalone.waitForEvent("download");
  await standalone.locator("#save-project").click();
  assert.equal((await projectDownload).suggestedFilename(), "Mein erstes Projekt.zip");
  assert.equal(await standalone.locator("#save-modal").count(), 0);
}

for (const mount of ["/", "/Codepfad/"]) {
  test(`Katalog, Editor, ZIP-Export und Navigation unter ${mount}`, t => checkCatalog(t, mount));
}
