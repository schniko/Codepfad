import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright";
import { createZip } from "../ui/project-files.js";

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
  const choices = page.locator("#learning-path-list .learning-path-choice");
  await choices.first().waitFor();
  assert.equal(await choices.count(), original.paths.length);
  const teacherLink = page.locator("#nav-teachers");
  const teacherAccess = page.locator("#teacher-access-dialog");
  const password = teacherAccess.getByLabel("Passwort", { exact: true });
  await teacherLink.click();
  await password.fill("falsches-passwort");
  await password.press("Enter");
  await teacherAccess.getByRole("alert").waitFor();
  assert.equal(await page.locator("#teacher-view").isVisible(), false);
  await teacherAccess.getByRole("button", { name: "Abbrechen" }).click();

  await page.goto(new URL("#lehrkraefte/likes-zeile-fuer-zeile", page.url()).href);
  await teacherAccess.waitFor();
  assert.equal(await page.locator("#teacher-lesson-view").isVisible(), false);
  await page.keyboard.press("Escape");
  await page.waitForURL(url => url.hash === "#lernpfade");

  await teacherLink.click();
  await password.fill("krawehl");
  await password.press("Enter");
  await teacherAccess.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /Der Like-Counter Zeile für Zeile.*1 Schritt/ }).click();
  await page.waitForURL(url => url.hash === "#lehrkraefte/likes-zeile-fuer-zeile");
  await page.reload();
  const stepMode = page.getByRole("checkbox", { name: "Zeilenweise ausführen" });
  const teacherPreview = page.frameLocator('iframe[title="HTML-Vorschau des Like-Counters"]');
  const like = teacherPreview.getByRole("button", { name: "Like", exact: true });
  const nextLine = page.getByRole("button", { name: "Nächste Zeile" });
  const variables = page.getByRole("region", { name: "Variablen" });
  const value = variables.locator('output[aria-label^="Aktueller Wert von likes"]');
  const output = page.getByRole("region", { name: "Konsole" }).locator("pre");
  const consoleRows = output.locator(".teacher-console-line");
  const consoleLayout = () => output.evaluate(async panel => {
    await Promise.all(panel.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    return {
      height: panel.clientHeight,
      width: panel.clientWidth,
      scrollHeight: panel.scrollHeight,
      lineHeight: Number.parseFloat(getComputedStyle(panel).lineHeight),
      firstLine: panel.querySelector(".teacher-console-line").getBoundingClientRect().top - panel.getBoundingClientRect().top,
      scrollTop: panel.scrollTop,
    };
  });
  const activeLine = page.locator("#teacher-html-lines .active-line");
  const lineNumber = number => activeLine.filter({ hasText: new RegExp(`^${number}$`) });
  const teacherSource = page.locator("#teacher-html-code");
  assert.match(await teacherSource.inputValue(), /onclick="liken\(\)"[\s\S]*<script>\s+function liken\(\)/);
  await teacherPreview.locator("#like:enabled").press("Enter");
  await output.filter({ hasText: /^1$/ }).waitFor();
  await page.getByRole("button", { name: "Neu starten", exact: true }).click();
  await stepMode.check();
  await page.getByRole("checkbox", { name: "Automatisch weiter" }).uncheck();
  assert.equal(await value.textContent(), "");
  await like.click();
  await lineNumber(6).waitFor();
  assert.equal(await value.textContent(), "");
  await nextLine.click();
  await lineNumber(7).waitFor();
  assert.equal(await value.textContent(), "0");
  await nextLine.click();
  await lineNumber(8).waitFor();
  assert.equal(await value.textContent(), "1");
  assert.equal(await output.textContent(), "Noch keine Ausgabe");
  const emptyConsole = await consoleLayout();
  assert.ok(emptyConsole.scrollHeight > emptyConsole.height, JSON.stringify(emptyConsole));
  assert.ok(Math.abs(emptyConsole.scrollTop - (emptyConsole.scrollHeight - emptyConsole.height)) <= 1);
  await nextLine.click();
  await output.filter({ hasText: /^1$/ }).waitFor();
  assert.equal(await output.evaluate(panel => panel.scrollHeight), emptyConsole.scrollHeight);
  const singleLine = await consoleLayout();
  assert.ok(singleLine.height >= 6 * singleLine.lineHeight - 1);
  assert.equal(singleLine.width, emptyConsole.width);
  assert.equal(singleLine.scrollTop, emptyConsole.scrollTop);
  await nextLine.click();
  await lineNumber(10).waitFor();
  assert.equal((await page.locator("#teacher-html-highlight .active-line").textContent()).trim(), "}");
  assert.equal(await value.textContent(), "1");
  assert.equal(await page.getByRole("region", { name: "Ablaufsteuerung" }).getByRole("status").count(), 0);
  await nextLine.click();
  await activeLine.waitFor({ state: "hidden" });
  assert.equal(await value.textContent(), "");
  await like.click();
  await nextLine.click();
  await value.filter({ hasText: /^0$/ }).waitFor();
  await stepMode.uncheck();
  await output.filter({ hasText: /^1\s+1$/ }).waitFor();
  const duplicateLine = await consoleLayout();
  assert.ok(duplicateLine.height > singleLine.height);
  const singleDistanceFromBottom = singleLine.height - singleLine.firstLine;
  const duplicateDistanceFromBottom = duplicateLine.height - duplicateLine.firstLine;
  assert.ok(Math.abs(duplicateDistanceFromBottom - singleDistanceFromBottom - singleLine.lineHeight) < 1);
  for (let click = 0; click < 5; click += 1) await like.click();
  await consoleRows.nth(6).waitFor({ state: "attached" });
  const fullConsole = await consoleLayout();
  assert.equal(fullConsole.height, duplicateLine.height);
  assert.equal(fullConsole.width, emptyConsole.width);
  assert.ok(Math.abs(fullConsole.firstLine - (fullConsole.height - 7 * fullConsole.lineHeight)) < 1);
  const example = page.getByRole("combobox", { name: "Beispiel", exact: true });
  assert.deepEqual(await example.locator("option").allTextContents(), [
    "1. Innerhalb der Funktion", "2. Außerhalb der Funktion", "3. Global mit Anzeige", "4. Global mit if und else", "5. Like und Dislike",
  ]);
  await example.selectOption("global");
  await stepMode.check();
  await value.filter({ hasText: /^0$/ }).waitFor();
  await page.getByRole("checkbox", { name: "Automatisch weiter" }).check();
  await like.click();
  await lineNumber(8).waitFor();
  assert.equal(await value.textContent(), "0");
  await lineNumber(9).waitFor();
  assert.equal(await value.textContent(), "1");
  await stepMode.uncheck();
  await like.click();
  await like.click();
  await output.filter({ hasText: /^1\s+2\s+3$/ }).waitFor();

  const editedHtml = `<!-- Ein <script> im Kommentar zählt nicht. -->
<h2>Mein Zähler</h2>
<button onclick="zaehlen()">Punkt sammeln</button>
<p id="anzeige"></p>

<script>
  let likes = 2;

  function zaehlen() {
    const schritt = 3;
    likes = likes + schritt;
    if (likes > 4) {
      document.getElementById("anzeige").textContent = likes;
      console.log(likes);
    } else {
      console.log("zu klein");
    }
  }
</script>`;
  await teacherSource.fill((await teacherSource.inputValue()).replace("likes = likes + 1;", "likes = ;"));
  await page.getByRole("alert").filter({ hasText: "JavaScript-Fehler in Zeile 9" }).waitFor();
  assert.equal(await like.isEnabled(), false);
  await teacherSource.fill(editedHtml);
  await teacherPreview.getByRole("heading", { name: "Mein Zähler" }).waitFor();
  await stepMode.check();
  await page.getByRole("checkbox", { name: "Automatisch weiter" }).uncheck();
  await teacherPreview.getByRole("button", { name: "Punkt sammeln" }).click();
  await lineNumber(9).waitFor();
  await nextLine.click();
  await lineNumber(10).waitFor();
  assert.equal(await variables.getByLabel("Aktueller Wert von schritt (lokal)").textContent(), "3");
  await nextLine.click();
  await lineNumber(11).waitFor();
  assert.equal(await value.textContent(), "5");
  await nextLine.click();
  await lineNumber(12).waitFor();
  await nextLine.click();
  await teacherPreview.locator("#anzeige").filter({ hasText: /^5$/ }).waitFor();
  await nextLine.click();
  await output.filter({ hasText: /^5$/ }).waitFor();
  await nextLine.click();
  await lineNumber(18).waitFor();
  await nextLine.click();
  await activeLine.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Neu starten", exact: true }).click();
  await value.filter({ hasText: /^2$/ }).waitFor();
  assert.equal(await teacherSource.inputValue(), editedHtml);
  await example.selectOption("local");
  await example.selectOption("global");
  assert.equal(await teacherSource.inputValue(), editedHtml);

  await example.selectOption("globalWithDisplay");
  const display = teacherPreview.locator("#anzeige");
  await display.filter({ hasText: /^0$/ }).waitFor();
  await teacherPreview.locator("#like:enabled").press("Enter");
  await lineNumber(8).waitFor();
  await nextLine.click();
  await lineNumber(9).waitFor();
  assert.equal(await value.textContent(), "1");
  await nextLine.click();
  await lineNumber(10).waitFor();
  assert.equal(await display.textContent(), "0");
  await nextLine.click();
  await display.filter({ hasText: /^1$/ }).waitFor();
  assert.equal(await output.textContent(), "Noch keine Ausgabe");
  await nextLine.click();
  await output.filter({ hasText: /^1$/ }).waitFor();
  await stepMode.uncheck();
  await like.click();
  await display.filter({ hasText: /^2$/ }).waitFor();
  await output.filter({ hasText: /^1\s+2$/ }).waitFor();

  await example.selectOption("globalWithCondition");
  const enabledLike = teacherPreview.locator("#like:enabled");
  for (let count = 1; count <= 9; count += 1) {
    await enabledLike.press("Enter");
    await consoleRows.last().filter({ hasText: new RegExp(`^${count}$`) }).waitFor();
  }
  assert.equal(await display.textContent(), "Du hast weniger als zehn Likes.");
  await stepMode.check();
  await enabledLike.press("Enter");
  await lineNumber(8).waitFor();
  await nextLine.click();
  await lineNumber(9).waitFor();
  assert.equal(await value.textContent(), "10");
  await nextLine.click();
  await lineNumber(10).waitFor();
  await nextLine.click();
  await lineNumber(12).waitFor();
  await nextLine.click();
  await lineNumber(15).waitFor();
  assert.equal(await display.textContent(), "Du hast mindestens zehn Likes.");
  assert.equal(await teacherPreview.locator("#anzeige").count(), 1);
  await nextLine.click();
  await consoleRows.last().filter({ hasText: /^10$/ }).waitFor();
  await stepMode.uncheck();
  await enabledLike.press("Enter");
  await consoleRows.last().filter({ hasText: /^11$/ }).waitFor();
  assert.equal(await display.textContent(), "Du hast mindestens zehn Likes.");

  await example.selectOption("likeAndDislike");
  const dislike = teacherPreview.getByRole("button", { name: "Dislike", exact: true });
  const enabledDislike = teacherPreview.locator("#dislike:enabled");
  await display.filter({ hasText: /^0$/ }).waitFor();
  await stepMode.check();
  await enabledLike.press("Enter");
  await lineNumber(9).waitFor();
  assert.equal(await dislike.isEnabled(), false);
  await variables.getByText("Lokal in liken()", { exact: true }).waitFor();
  await stepMode.uncheck();
  await display.filter({ hasText: /^1$/ }).waitFor();
  await stepMode.check();
  await enabledDislike.press("Enter");
  await lineNumber(16).waitFor();
  assert.equal(await value.textContent(), "1");
  assert.equal(await like.isEnabled(), false);
  await variables.getByText("Lokal in disliken()", { exact: true }).waitFor();
  await nextLine.click();
  await lineNumber(17).waitFor();
  assert.equal(await value.textContent(), "0");
  await stepMode.uncheck();
  await display.filter({ hasText: /^0$/ }).waitFor();
  await output.filter({ hasText: /^1\s+0$/ }).waitFor();
  await enabledDislike.press("Enter");
  await display.filter({ hasText: /^-1$/ }).waitFor();
  await output.filter({ hasText: /^1\s+0\s+-1$/ }).waitFor();

  const exampleBar = page.locator(".teacher-demo-example");
  await exampleBar.getByRole("button", { name: "Vollbild öffnen" }).click();
  await page.waitForFunction(() => document.fullscreenElement?.id === "teacher-lesson-view");
  await page.locator(".library-bar").waitFor({ state: "hidden" });
  await page.locator(".teacher-back").waitFor({ state: "hidden" });
  await exampleBar.getByRole("button", { name: "Vollbild verlassen" }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.locator(".library-bar").waitFor();
  await page.locator(".teacher-back").waitFor();
  assert.equal(await example.inputValue(), "likeAndDislike");
  assert.equal(await display.textContent(), "-1");

  await page.goBack();
  await page.getByRole("heading", { name: "Bereich für Lehrkräfte", exact: true }).waitFor();
  await page.locator("#nav-paths").click();
  await page.getByRole("heading", { name: "Lernpfade", exact: true }).waitFor();
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
  const newReferenceTab = context.waitForEvent("page");
  await page.locator("#path-reference").click();
  const referenceTab = await newReferenceTab;
  await referenceTab.locator("#reference-title").waitFor();
  assert.equal(new URL(referenceTab.url()).hash, "#nachschlagewerk");
  await referenceTab.close();
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

  const homeHtml = '<!doctype html><html><head></head><body><h1>Startseite</h1><a href="./seiten/%C3%BCber%20uns.html?ansicht=kurz#details" target="_blank"><span>Über uns</span></a><a href="fehlt.html">Fehlende Seite</a><a href="https://example.com/info.html">Extern</a></body></html>';
  const aboutHtml = '<!doctype html><html><head><link rel="stylesheet" href="../design/seite.css"><script src="../scripts/seite.js" defer></script></head><body><h1>Über uns</h1><a href="../index.html">Zurück</a><a href="#details">Details</a><div style="height:1600px"></div><h2 id="details">Einzelheiten</h2><img src="../bilder/logo.svg" alt="Projektlogo"></body></html>';
  const entries = {
    "index.html": homeHtml,
    "seiten/über uns.html": aboutHtml,
    "design/seite.css": 'h1 { color: rgb(12, 34, 56); } body { background-image: url("../bilder/logo.svg"); }',
    "scripts/seite.js": 'document.querySelector("h1").textContent = "Team geladen";',
    "bilder/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="green"/></svg>',
  };
  const zip = createZip(Object.entries(entries).map(([name, text]) => ({ name, bytes: new TextEncoder().encode(text) })));
  await standalone.locator("#project-input").setInputFiles({ name: "Navigation.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  const preview = standalone.frameLocator("#preview");
  await preview.getByRole("heading", { name: "Startseite" }).waitFor();
  const pageCount = context.pages().length;
  await preview.getByRole("link", { name: "Über uns" }).click();
  const heading = preview.getByRole("heading", { name: "Team geladen" });
  await heading.waitFor();
  assert.equal(await heading.evaluate(element => getComputedStyle(element).color), "rgb(12, 34, 56)");
  assert.match(await heading.evaluate(element => getComputedStyle(element.ownerDocument.body).backgroundImage), /data:image\/svg\+xml;base64,/);
  await preview.getByRole("img", { name: "Projektlogo" }).evaluate(image => image.decode());
  assert.ok(await heading.evaluate(() => window.scrollY > 0), "Die Zielseite scrollt zur verlinkten Sprungmarke.");
  assert.equal(await standalone.locator("#html-code").inputValue(), homeHtml);
  assert.equal(context.pages().length, pageCount);
  assert.equal(await standalone.locator("#preview").getAttribute("sandbox"), "allow-scripts allow-popups");

  // Relative return links and fragment links stay in the sandbox, including keyboard activation.
  await preview.getByRole("link", { name: "Details", exact: true }).click();
  assert.ok(await heading.evaluate(() => window.scrollY > 0));
  await preview.getByRole("link", { name: "Zurück" }).focus();
  await preview.getByRole("link", { name: "Zurück" }).press("Enter", { noWaitAfter: true });
  await preview.getByRole("heading", { name: "Startseite" }).waitFor();
  await preview.getByRole("link", { name: "Fehlende Seite" }).click();
  await standalone.locator("#toast").filter({ hasText: "HTML-Datei nicht im Projekt gefunden: fehlt.html" }).waitFor();
  assert.equal(context.pages().length, pageCount);
  await preview.getByRole("heading", { name: "Startseite" }).waitFor();

  await preview.getByRole("link", { name: "Über uns" }).click();
  await heading.waitFor();
  await standalone.locator("#restart-preview").click();
  await preview.getByRole("heading", { name: "Startseite" }).waitFor();

  await context.route("https://example.com/info.html", route => route.fulfill({ contentType: "text/html", body: "<h1>Externe Seite</h1>" }));
  const externalPage = context.waitForEvent("page");
  await preview.getByRole("link", { name: "Extern", exact: true }).click();
  const external = await externalPage;
  await external.getByRole("heading", { name: "Externe Seite" }).waitFor();
  await external.close();
  await preview.getByRole("heading", { name: "Startseite" }).waitFor();
}

for (const mount of ["/", "/Codepfad/"]) {
  test(`Katalog, Editor, ZIP-Export und Navigation unter ${mount}`, t => checkCatalog(t, mount));
}
