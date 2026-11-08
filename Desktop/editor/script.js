const siteTitle = document.title;
const $ = selector => document.querySelector(selector);
let editor;
let catalogReady;
let isValidCss;
let learningPath = null;
let learningPathStep = 0;
let learningPathLevel = "advanced";
let learningPathStates = [];
let learningPathVisited = new Set();
let learningPathInitialAssets = [];
let learningPathCatalog = new Map();
let activeCatalogPath = null;

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function showToast(message) {
  editor.showToast(message);
}

function sanitizeLessonHtml(source) {
  const template = document.createElement("template");
  template.innerHTML = source;
  const allowedTags = new Set(["P", "DIV", "H2", "UL", "OL", "LI", "PRE", "CODE", "STRONG", "EM", "BR", "A"]);

  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!allowedTags.has(element.tagName) || (element.tagName === "DIV" && !element.classList.contains("task"))) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") : "";
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (element.tagName === "DIV") element.className = "task";
    if (element.tagName === "A" && /^(?:https?:|mailto:)/i.test(href || "")) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  }

  return template.innerHTML;
}

function normalizeLearningPath(source) {
  if (!source || typeof source !== "object" || source.format !== "mint-lernpfad" || source.version !== 1) {
    throw new Error("Die Lernpfad-Datei hat ein unbekanntes Format.");
  }
  if (typeof source.title !== "string" || !source.title.trim() || !Array.isArray(source.steps) || !source.steps.length) {
    throw new Error("Im Lernpfad fehlen Titel oder Schritte.");
  }
  if (source.baseCss !== undefined && typeof source.baseCss !== "string") throw new Error("Das Basis-CSS des Lernpfads ist ungültig.");
  if (!isValidCss(source.baseCss || "")) throw new Error("Das Basis-CSS des Lernpfads ist ungültig.");
  if (source.defaultLevel !== undefined && !["basic", "advanced"].includes(source.defaultLevel)) {
    throw new Error("Das Standardniveau des Lernpfads ist ungültig.");
  }

  const steps = source.steps.map((step, index) => {
    if (!step || typeof step !== "object" || typeof step.title !== "string" || !step.title.trim()) {
      throw new Error(`Schritt ${index + 1} hat keinen gültigen Titel.`);
    }
    for (const field of ["intro", "note", "html", "css"]) {
      if (step[field] !== undefined && typeof step[field] !== "string") throw new Error(`Schritt ${index + 1} enthält ungültige Inhalte.`);
    }
    const variants = {};
    if (step.variants !== undefined) {
      if (!step.variants || typeof step.variants !== "object" || Array.isArray(step.variants)) {
        throw new Error(`Schritt ${index + 1} enthält ungültige Niveau-Varianten.`);
      }
      const unknownLevel = Object.keys(step.variants).find(level => !["basic", "advanced"].includes(level));
      if (unknownLevel) throw new Error(`Schritt ${index + 1} enthält ein unbekanntes Niveau.`);
      for (const level of ["basic", "advanced"]) {
        const variant = step.variants[level];
        if (variant === undefined) continue;
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
          throw new Error(`Schritt ${index + 1} enthält eine ungültige Niveau-Variante.`);
        }
        for (const field of ["title", "intro", "note", "html", "css"]) {
          if (variant[field] !== undefined && typeof variant[field] !== "string") {
            throw new Error(`Schritt ${index + 1} enthält ungültige Inhalte im Niveau.`);
          }
        }
        if (variant.title !== undefined && !variant.title.trim()) {
          throw new Error(`Schritt ${index + 1} enthält einen ungültigen Titel im Niveau.`);
        }
        variants[level] = {};
        for (const field of ["title", "intro", "note", "html", "css", "htmlEditable", "cssEditable", "colorLab"]) {
          if (variant[field] !== undefined) variants[level][field] = field === "title" ? variant[field].trim() : variant[field];
        }
      }
    }
    return {
      title: step.title.trim(),
      intro: step.intro || "",
      note: step.note || "",
      html: step.html || "",
      css: step.css || "",
      htmlEditable: step.htmlEditable !== false,
      cssEditable: step.cssEditable !== false,
      inheritPrevious: step.inheritPrevious === true,
      goalPreview: ["slotmachine", "zahlenraten", "passwort", "sterne", "tictactoe"].includes(step.goalPreview) ? step.goalPreview : "",
      goalOnly: step.goalOnly === true,
      colorLab: step.colorLab === true,
      variants
    };
  });

  return {
    format: source.format,
    version: source.version,
    title: source.title.trim(),
    subject: typeof source.subject === "string" && source.subject.trim() ? source.subject.trim() : "Lernpfad",
    showCss: source.showCss !== false,
    showConsole: source.showConsole === true,
    baseCss: source.baseCss || "",
    defaultLevel: source.defaultLevel === "basic" ? "basic" : "advanced",
    singleLevel: source.singleLevel === true,
    steps
  };
}

function resolveLearningPathStep(step, level = learningPathLevel) {
  return { ...step, ...(step.variants[level] || {}) };
}

function hasLearningPathVariants(step) {
  return Object.keys(step.variants).length > 0;
}

function createLearningPathStates(definition) {
  return definition.steps.map(step => {
    if (!hasLearningPathVariants(step)) return { shared: { html: step.html, css: step.css } };
    const basic = resolveLearningPathStep(step, "basic");
    const advanced = resolveLearningPathStep(step, "advanced");
    return {
      basic: { html: basic.html, css: basic.css },
      advanced: { html: advanced.html, css: advanced.css }
    };
  });
}

function getLearningPathState(index) {
  const states = learningPathStates[index];
  return states.shared || states[learningPathLevel];
}

function setLearningPathState(index, state) {
  const states = learningPathStates[index];
  if (states.shared) states.shared = state;
  else states[learningPathLevel] = state;
}

function setLearningPathLevel(level) {
  if (!learningPath || learningPath.singleLevel || !["basic", "advanced"].includes(level) || level === learningPathLevel) return;
  learningPathLevel = level;
  renderLearningPathStep();
  syncRoute();
  showToast(level === "basic" ? "Grundlegendes Niveau" : "Erweitertes Niveau");
}

function renderLearningPathColorLab() {
  const colors = [
    ["red", "#ff0000"], ["blue", "#0000ff"], ["green", "#008000"], ["tomato", "#ff6347"],
    ["gold", "#ffd700"], ["turquoise", "#40e0d0"], ["hotpink", "#ff69b4"], ["crimson", "#dc143c"]
  ];
  const lab = document.createElement("div");
  lab.className = "path-color-lab";
  lab.innerHTML = `<label>Farbe auswählen <input class="path-color-picker" type="color" value="#ff6347"></label><div class="path-color-values"><span>Hex <code class="path-color-hex"></code></span><span>RGB <code class="path-color-rgb"></code></span></div><div class="path-color-words">${colors.map(([name, value]) => `<button class="path-color-word" type="button" data-color="${value}">${name}</button>`).join("")}</div>`;
  $("#path-intro").prepend(lab);
  const picker = lab.querySelector(".path-color-picker");
  const showColor = value => {
    const number = Number.parseInt(value.slice(1), 16);
    picker.value = value;
    lab.querySelector(".path-color-hex").textContent = value.toUpperCase();
    lab.querySelector(".path-color-rgb").textContent = `rgb(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255})`;
  };
  picker.addEventListener("input", () => showColor(picker.value));
  lab.addEventListener("click", event => {
    const button = event.target.closest("[data-color]");
    if (button) showColor(button.dataset.color);
  });
  showColor(picker.value);
}

function renderLearningPathSteps() {
  $("#path-steps").innerHTML = learningPath.steps.map((sourceStep, index) => {
    const step = resolveLearningPathStep(sourceStep);
    return `<button class="path-step ${index === learningPathStep ? "active" : ""} ${learningPathVisited.has(index) ? "done" : ""}" data-path-step="${index}" type="button"><span class="path-step-number">${learningPathVisited.has(index) && index !== learningPathStep ? "✓" : index + 1}</span><span class="path-step-name">${escapeHtml(step.title)}</span></button>`;
  }).join("");
}

function renderLearningPathStep() {
  if (!learningPath) return;
  const step = resolveLearningPathStep(learningPath.steps[learningPathStep]);
  const state = getLearningPathState(learningPathStep);
  learningPathVisited.add(learningPathStep);

  $("#path-level-switch").hidden = learningPath.singleLevel;
  $("#path-level-switch").querySelectorAll("[data-path-level]").forEach(button => {
    const active = button.dataset.pathLevel === learningPathLevel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  $("#path-step-label").textContent = `Schritt ${learningPathStep + 1} von ${learningPath.steps.length}`;
  $("#path-step-title").textContent = step.title;
  $("#path-progress").style.width = `${((learningPathStep + 1) / learningPath.steps.length) * 100}%`;
  $("#path-intro").innerHTML = sanitizeLessonHtml(step.intro);
  $("#path-note").innerHTML = sanitizeLessonHtml(step.note);
  if (step.goalPreview === "slotmachine") {
    const preview = document.createElement("div");
    preview.className = "slot-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel: drei gleiche Zahlen, Gewinnmeldung und zwei Knöpfe");
    preview.innerHTML = '<strong>ZAHLEN-SPIEL</strong><div class="slot-goal-numbers"><span>2</span><span>2</span><span>2</span></div><b>Gewonnen! ✨</b><div class="slot-goal-actions"><span>Drehen</span><span>Neu starten</span></div>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "zahlenraten") {
    const preview = document.createElement("div");
    preview.className = "guess-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel eines Zahlenratespiels: Eingabe 42, Hinweis zu klein, Knöpfe Prüfen und Neue Runde");
    preview.innerHTML = '<strong>Zahlenraten</strong><p>Rate eine Zahl von 1 bis 100</p><span class="guess-goal-input">42</span><div class="guess-goal-actions"><span>Prüfen</span><span>Neue Runde</span></div><b>Zu klein!</b>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "passwort") {
    const preview = document.createElement("div");
    preview.className = "password-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel für Passwort raten: vier Buchstabenkacheln, grün, grau, grau, gelb, Eingabefeld und Knöpfe");
    preview.innerHTML = '<strong>PASSWORT RATEN</strong><p>Finde den Code aus a bis h</p><div class="password-goal-tiles"><span class="green">A</span><span class="gray">E</span><span class="gray">H</span><span class="yellow">B</span></div><div class="password-goal-input">aehb</div><div class="password-goal-buttons"><span>Prüfen</span><span>Neues Passwort</span></div><small>Grün: richtige Stelle · Gelb: andere Stelle · Grau: nicht enthalten</small>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "sterne") {
    const preview = document.createElement("div");
    preview.className = "stars-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Beispiel: Sterne zeichnen, Eingabe 5, Knopf und fünf Sterne");
    preview.innerHTML = '<strong>Sterne zeichnen</strong><p>Wie viele Sterne möchtest du?</p><span class="stars-goal-input">5</span><span class="stars-goal-button">Zeichnen</span><div class="stars-goal-output">★★★★★</div>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  if (step.goalPreview === "tictactoe") {
    const preview = document.createElement("div");
    preview.className = "ttt-goal-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Tic-Tac-Toe: X hat die obere Reihe gefüllt und gewonnen. Darunter ein Neustartknopf.");
    preview.innerHTML = '<strong>Tic-Tac-Toe</strong><div class="ttt-goal-board"><span>X</span><span>X</span><span>X</span><span>O</span><span>O</span><span></span><span></span><span></span><span></span></div><p>X hat gewonnen!</p><span class="ttt-goal-button">Neu starten</span>';
    $(step.goalOnly ? "#path-intro" : "#path-note").append(preview);
  }
  $("#path-note").hidden = !step.note.trim() && (!step.goalPreview || step.goalOnly);
  document.body.classList.toggle("path-goal-only", step.goalOnly);
  if (step.colorLab) renderLearningPathColorLab();

  editor.showLessonStep({
    ...state,
    goalOnly: step.goalOnly,
    htmlEditable: step.htmlEditable,
    cssEditable: step.cssEditable,
    cssEnabled: learningPath.showCss,
    baseCss: learningPath.baseCss,
    showConsole: learningPath.showConsole,
  }, [$("#path-intro"), $("#path-note")]);

  $("#path-back").disabled = learningPathStep === 0;
  $("#path-next").textContent = learningPathStep === learningPath.steps.length - 1 ? "Fertig ✓" : "Weiter →";
  renderLearningPathSteps();
  document.title = `${learningPath.title} – ${step.title} · ${siteTitle}`;
  $("#learning-path").scrollTop = 0;
}

function goToLearningPathStep(index) {
  if (!learningPath || index < 0 || index >= learningPath.steps.length) return;
  if (index === learningPathStep + 1 && !learningPathVisited.has(index) && learningPath.steps[index].inheritPrevious) {
    setLearningPathState(index, { ...getLearningPathState(learningPathStep) });
  }
  learningPathStep = index;
  renderLearningPathStep();
  syncRoute();
}

function deactivateLearningPath() {
  learningPath = null;
  document.body.classList.remove("path-goal-only");
  learningPathStep = 0;
  learningPathLevel = "advanced";
  learningPathStates = [];
  learningPathVisited = new Set();
  learningPathInitialAssets = [];
  document.body.classList.remove("learning-path-active");
  $("#learning-path").hidden = true;
  document.title = siteTitle;
}

function openLearningPath(definition, files, sourceName, { step, level }) {
  deactivateLearningPath();
  editor.startLesson(files, sourceName);
  learningPath = definition;
  learningPathStep = Math.min(step, definition.steps.length - 1);
  learningPathLevel = !definition.singleLevel && ["basic", "advanced"].includes(level) ? level : definition.defaultLevel;
  learningPathInitialAssets = editor.snapshotImages();
  learningPathStates = createLearningPathStates(definition);
  learningPathVisited = new Set();
  $("#path-subject").textContent = definition.subject;
  $("#path-title").textContent = definition.title;
  document.body.classList.add("learning-path-active");
  $("#learning-path").hidden = false;
  renderLearningPathStep();
  showToast("Lernpfad geöffnet");
}

async function loadCatalogLearningPath(id, { reload = false, step = 0, level, replace = false } = {}) {
  if (reload) await initializeCatalog();
  const entry = learningPathCatalog.get(id);
  if (!entry) throw new Error("Der gewählte Lernpfad ist nicht im Katalog.");
  const files = new Map(entry.assets.map(asset => [
    asset.name, Uint8Array.from(atob(asset.data), character => character.charCodeAt(0))
  ]));
  openLearningPath(normalizeLearningPath(entry.lesson), files, entry.id, { step, level });
  activeCatalogPath = entry.id;
  closePathPicker({ replace });
  if (!$("#dev-toolbar").hidden) {
    $("#dev-path-select").value = entry.id;
    $("#dev-status").textContent = entry.label;
    const url = new URL(location.href);
    url.searchParams.set("dev", entry.id);
    history.replaceState(null, "", url);
  }
}

let selectedTopic = "";
function applyCatalog(data) {
  learningPathCatalog = new Map(data.paths.map(entry => [entry.id, entry]));
  $("#dev-path-select").replaceChildren(...data.paths.map(entry => new Option(entry.label, entry.id)));
  const topics = [...new Set(data.paths.map(entry => entry.topic))];
  if (!topics.includes(selectedTopic)) selectedTopic = "";
  $("#topics").replaceChildren(...["", ...topics].map(topic => {
    const button = document.createElement("button");
    button.textContent = topic || "Alle";
    button.dataset.topic = topic;
    return button;
  }));
  renderCourseList();
}

function renderCourseList() {
  for (const button of $("#topics").children) {
    button.setAttribute("aria-pressed", String(button.dataset.topic === selectedTopic));
  }
  const visible = [...learningPathCatalog.values()].filter(entry => !selectedTopic || entry.topic === selectedTopic);
  $("#course-count").textContent = visible.length + (visible.length === 1 ? " Lernpfad" : " Lernpfade");
  $("#learning-path-list").replaceChildren(...visible.map(entry => {
    const button = document.createElement("button");
    button.className = "learning-path-choice";
    button.dataset.learningPathId = entry.id;
    if (entry.concept) button.title = entry.concept;
    const topic = document.createElement("small");
    topic.className = "course-topic";
    topic.dataset.topic = entry.topic;
    topic.textContent = entry.topic;
    const title = document.createElement("strong");
    title.textContent = entry.label;
    const description = document.createElement("span");
    description.textContent = entry.description;
    const footer = document.createElement("span");
    footer.className = "course-footer";
    footer.textContent = entry.lesson.steps.length + " Schritte";
    const arrow = document.createElement("i");
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");
    footer.append(arrow);
    button.append(topic, title, description, footer);
    return button;
  }));
}

$("#topics").addEventListener("click", event => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  selectedTopic = button.dataset.topic;
  renderCourseList();
  syncRoute();
});

function setLibraryVisible(visible, { focus = true } = {}) {
  $("#path-picker-modal").hidden = !visible;
  document.body.classList.toggle("library-visible", visible);
  editor.setLibraryVisible(visible);
  for (const panel of document.querySelectorAll("#dev-toolbar, #learning-path")) {
    panel.inert = visible;
  }
  if (visible) {
    $("#path-picker-modal").scrollTop = 0;
    if (focus) $(".library-nav [aria-current='page']").focus({ preventScroll: true });
  }
}

function showLibrarySection(reference) {
  if (!reference) clearReferenceArticle();
  $("#reference-view").hidden = !reference;
  $("#path-picker-view").hidden = reference;
  $("#path-picker-modal").setAttribute("aria-labelledby", reference ? "reference-title" : "path-picker-title");
  const selected = $(reference ? "#nav-reference" : "#nav-paths");
  $(".library-nav [aria-current='page']")?.removeAttribute("aria-current");
  selected.setAttribute("aria-current", "page");
}

function openReference({ from } = {}) {
  if (from !== undefined) referenceReturnRoute = from;
  else if ($("#path-picker-modal").hidden) referenceReturnRoute = workspaceRoute();
  else if ($("#reference-view").hidden) referenceReturnRoute = "";
  showLibrarySection(true);
  showReferenceOverview(Boolean(referenceReturnRoute && learningPath));
  setLibraryVisible(true);
  syncRoute();
}

function closePathPicker({ replace = false } = {}) {
  const wasReference = !$("#reference-view").hidden;
  setLibraryVisible(false);
  showPathPickerList();
  if (!learningPath) editor.focusHome();
  else if (wasReference) $("#path-reference").focus();
  syncRoute({ replace });
}

function showPathPickerList() {
  showLibrarySection(false);
  $("#path-picker-title").textContent = "Lernpfade";
}

function confirmAction(question, action) {
  return editor.confirm(question, action);
}

async function openPathPicker() {
  if (editor.getSnapshot().dirty && !await confirmAction("Ungespeicherte Änderungen beim Öffnen verwerfen?", "Fortfahren")) return;
  try {
    await catalogReady;
    showPathPickerList();
    setLibraryVisible(true);
    syncRoute();
  } catch (error) {
    showToast(error.message || "Lernpfade konnten nicht geladen werden");
  }
}

async function initializeDevelopmentMode() {
  const params = new URLSearchParams(location.search);
  if (!params.has("dev")) return;

  $("#dev-toolbar").hidden = false;
  if (location.hash) return;
  try {
    await catalogReady;
    const requested = params.get("dev");
    await loadCatalogLearningPath(learningPathCatalog.has(requested) ? requested : learningPathCatalog.keys().next().value);
  } catch (error) {
    $("#dev-status").textContent = error.message || "Entwicklungsmodus konnte nicht gestartet werden";
    showToast($("#dev-status").textContent);
  }
}

function showStartAfterEditor() {
  selectedTopic = "";
  renderCourseList();
  showPathPickerList();
  setLibraryVisible(true);
  syncRoute();
}

async function closeLearningPath({ showLibrary = true } = {}) {
  if (editor.getSnapshot().dirty && !await confirmAction("Lernpfad verlassen und ungespeicherte Änderungen verwerfen?", "Verwerfen und verlassen")) return;
  deactivateLearningPath();
  editor.resetProject();
  if (showLibrary) {
    showPathPickerList();
    setLibraryVisible(true);
    syncRoute();
  } else {
    closePathPicker();
  }
  return true;
}

$("#path-steps").addEventListener("click", event => {
  const button = event.target.closest("[data-path-step]");
  if (button) goToLearningPathStep(Number(button.dataset.pathStep));
});
$("#path-level-switch").addEventListener("click", event => {
  const button = event.target.closest("[data-path-level]");
  if (button) setLearningPathLevel(button.dataset.pathLevel);
});
$("#path-back").addEventListener("click", () => goToLearningPathStep(learningPathStep - 1));
$("#path-next").addEventListener("click", () => {
  if (!learningPath) return;
  if (learningPathStep < learningPath.steps.length - 1) goToLearningPathStep(learningPathStep + 1);
  else showToast("Lernpfad geschafft!");
});
$("#reset-learning-path").addEventListener("click", async () => {
  if (!learningPath || !await confirmAction("Alle Änderungen und den Fortschritt dieses Lernpfads zurücksetzen?", "Zurücksetzen")) return;
  learningPathStates = createLearningPathStates(learningPath);
  learningPathVisited = new Set();
  editor.resetLessonImages(learningPathInitialAssets);
  learningPathStep = 0;
  renderLearningPathStep();
  syncRoute();
  showToast("Lernpfad zurückgesetzt");
});
$("#close-learning-path").addEventListener("click", closeLearningPath);
$("#dev-path-select").addEventListener("change", async event => {
  try { await loadCatalogLearningPath(event.target.value, { reload: true }); }
  catch (error) { $("#dev-status").textContent = error.message || "Lernpfad konnte nicht geladen werden"; }
});
$("#dev-reload").addEventListener("click", async () => {
  if (!activeCatalogPath) return;
  try { await loadCatalogLearningPath(activeCatalogPath, { reload: true }); }
  catch (error) { $("#dev-status").textContent = error.message || "Lernpfad konnte nicht neu geladen werden"; }
});
$("#path-reference").addEventListener("click", openReference);
$("#nav-reference").addEventListener("click", openReference);
$("#nav-paths").addEventListener("click", () => {
  if (learningPath) closeLearningPath();
  else if (!$("#reference-view").hidden && editor.getSnapshot().dirty) openPathPicker();
  else {
    showPathPickerList();
    syncRoute();
  }
});
$("#cancel-path-picker").addEventListener("click", () => {
  if (learningPath) closeLearningPath({ showLibrary: false });
  else closePathPicker();
});
$("#path-picker-modal").addEventListener("click", event => {
  if (event.target === $("#path-picker-modal")) closePathPicker();
});
$("#learning-path-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-learning-path-id]");
  if (!button) return;
  const entry = learningPathCatalog.get(button.dataset.learningPathId);
  if (!entry) return;
  try { await loadCatalogLearningPath(entry.id); }
  catch (error) { showToast(error.message || "Lernpfad konnte nicht geladen werden"); }
});

document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.key !== "Escape" || $("dialog[open]")) return;
  if (!$("#path-picker-modal").hidden) closePathPicker();
});

function mountEditor(createEditor, validateCss) {
  isValidCss = validateCss;
  editor = createEditor({
    onCodeChange: code => {
      if (learningPath) setLearningPathState(learningPathStep, code);
    },
    onLeave: showStartAfterEditor,
    onRouteChange: syncRoute,
  });
  setLibraryVisible(true);
  catalogReady = initializeCatalog();
  catalogReady.then(initializeDevelopmentMode).catch(error => showToast(error.message));
  checkAppUpdate();
  return editor;
}

async function checkAppUpdate() {
  const native = window.__TAURI__?.core;
  if (!native) return;
  try {
    const version = await native.invoke("check_app_update");
    if (!version) return;
    const button = $("#install-update");
    button.textContent = "Version " + version + " installieren";
    button.hidden = false;
    button.onclick = async () => {
      if (editor.getSnapshot().dirty && !await confirmAction("Update installieren und ungespeicherte Änderungen verwerfen?", "Installieren")) return;
      button.disabled = true;
      try { await native.invoke("install_app_update"); }
      catch { button.disabled = false; showToast("App-Update fehlgeschlagen. Bitte erneut versuchen."); }
    };
  } catch (error) { console.info("App-Update nicht verfügbar", error); }
}
