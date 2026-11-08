import { isValidCss, isValidHtml } from "./editor-code.js";
import { buildPreviewDocument, isFullHtml, prepareInlineScripts } from "./editor-preview.js";
import { collectCodeBlocks } from "./ReadOnlyCode.jsx";
import { cleanProjectName, createZip, htmlForArchive, mimeFromPath, readZip, uniqueAssetPath } from "./project-files.js";

const defaultProject = {
  html: htmlForArchive("<h1>Meine Webseite</h1>"),
  css: "h1 {\n  color: red\n}",
  hasStyles: true,
  name: "webprojekt",
  cssEnabled: true,
  baseCss: "",
  showConsole: false,
  htmlEditable: true,
  cssEditable: true,
  goalOnly: false,
  lessonCodeBlocks: [],
  lesson: false,
  files: new Map(),
  folders: [],
  projectFolder: "",
  editorLayout: null,
  assetsOpen: false,
  dirty: false,
};

function addImage(assets, name, bytes, type = mimeFromPath(name), occupied = assets) {
  const folder = name.slice(0, name.lastIndexOf("/") + 1);
  const path = uniqueAssetPath(name.slice(folder.length), occupied, folder);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  assets.set(path, { bytes, type, url });
  return path;
}

function archiveImages(files) {
  const images = [];
  for (const [name, bytes] of files) {
    if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) images.push({ name, bytes });
  }
  return images;
}

const projectTextDecoder = new TextDecoder("utf-8", { fatal: true });
const editorLayoutPrefix = "Codepfad-Editor/1\n";

function readEditorLayout(comment, files) {
  if (!comment.startsWith(editorLayoutPrefix)) return null;
  try {
    const layout = JSON.parse(comment.slice(editorLayoutPrefix.length));
    if (!Array.isArray(layout.groups) || layout.groups.length < 1 || layout.groups.length > 2) return null;
    const folders = new Set([""]);
    for (const path of files.keys()) {
      const parts = path.replace(/\/$/, "").split("/");
      if (!path.endsWith("/")) parts.pop();
      while (parts.length) {
        folders.add(parts.join("/"));
        parts.pop();
      }
    }
    const seen = new Set();
    const groups = layout.groups.map(group => {
      const tabs = (Array.isArray(group?.tabs) ? group.tabs : []).filter(path => {
        if (typeof path !== "string" || path.endsWith("/") || !files.has(path) || seen.has(path)) return false;
        seen.add(path);
        return true;
      });
      return { tabs, active: tabs.includes(group?.active) ? group.active : tabs.at(-1) };
    });
    const width = key => {
      const value = layout.widths?.[key];
      return typeof value === "string" && /^(?:\d{1,2}(?:\.\d+)?|100)%$/.test(value) ? value : undefined;
    };
    return {
      groups,
      focusedGroup: groups.length === 2 && layout.focusedGroup === 1 ? 1 : 0,
      expanded: Array.isArray(layout.expanded) ? layout.expanded.filter(path => folders.has(path)) : [],
      fileSelected: layout.fileSelected === true,
      projectFolder: folders.has(layout.projectFolder) ? layout.projectFolder : "",
      filesCollapsed: layout.filesCollapsed === true,
      previewCollapsed: layout.previewCollapsed === true,
      widths: { files: width("files"), preview: width("preview"), code: width("code") },
    };
  } catch { return null; }
}

function decodeProjectText(bytes, type) {
  if (type.startsWith("image/") || bytes.includes(0)) return null;
  try { return projectTextDecoder.decode(bytes); }
  catch { return null; }
}

export function createEditor({ onCodeChange, onLeave, onRouteChange }) {
  let state = { ...defaultProject, assets: new Map(), libraryVisible: true, homeFocus: 0, modal: null, toast: "", toastVisible: false };
  const listeners = new Set();
  let previewRevision = 0;
  let projectGeneration = 0;
  let toastTimer;

  function update(changes, refreshPreview = false) {
    state = { ...state, ...changes };
    if (refreshPreview) {
      state.htmlValid = isValidHtml(state.html);
      state.cssValid = isValidCss(state.css);
      if (state.htmlValid && state.cssValid) {
        state.preview = { key: ++previewRevision, html: buildPreviewDocument(state) };
      }
    }
    listeners.forEach(listener => listener());
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    update({ toast: message, toastVisible: true });
    toastTimer = setTimeout(() => update({ toastVisible: false }), 1900);
  }

  function replaceAssets(images) {
    const assets = new Map();
    for (const { name, bytes, type } of images) addImage(assets, name, bytes, type);
    for (const asset of state.assets.values()) URL.revokeObjectURL(asset.url);
    return assets;
  }

  function resetProject() {
    projectGeneration += 1;
    update({ ...defaultProject, projectGeneration, assets: replaceAssets([]) }, true);
  }

  function setCode(language, value) {
    update({ [language]: value, dirty: true }, true);
    onCodeChange({ html: state.html, css: state.css });
  }

  function confirm(question, action) {
    if (state.modal) return Promise.resolve(false);
    return new Promise(resolve => update({ modal: { type: "confirm", question, action, resolve } }));
  }

  function closeModal(accepted = false) {
    const modal = state.modal;
    if (!modal) return false;
    update({ modal: null });
    modal.resolve?.(accepted);
    return true;
  }

  async function leave() {
    const question = state.dirty ? "Editor verlassen und ungespeicherte Änderungen verwerfen?" : "Editor wirklich verlassen?";
    const action = state.dirty ? "Verwerfen und verlassen" : "Editor verlassen";
    if (!await confirm(question, action)) return;
    resetProject();
    onLeave();
  }

  function setAssetDrawer(assetsOpen) {
    if (state.assetsOpen !== assetsOpen) update({ assetsOpen });
  }

  function toggleAssets() {
    setAssetDrawer(!state.assetsOpen);
    onRouteChange();
  }

  async function uploadFiles(files, folder = "") {
    if (!files.length) return;
    const generation = projectGeneration;
    try {
      const entries = await Promise.all(files.map(async file => ({
        name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), type: file.type || mimeFromPath(file.name),
      })));
      if (generation !== projectGeneration) return;
      const assets = new Map(state.assets);
      const sources = new Map(state.files);
      const occupied = new Set([...assets.keys(), ...state.files.keys(), ...state.folders, "index.html", ...(state.hasStyles || state.lesson ? ["styles.css"] : [])]);
      for (const path of [...occupied]) {
        const parts = path.split("/");
        while (parts.length > 1) { parts.pop(); occupied.add(parts.join("/")); }
      }
      for (const { name, bytes, type } of entries) {
        const text = state.lesson ? null : decodeProjectText(bytes, type);
        const path = text === null
          ? addImage(assets, folder ? folder + "/" + name : name, bytes, type, occupied)
          : uniqueAssetPath(name, occupied, folder ? folder + "/" : "");
        if (text !== null) sources.set(path, text);
        occupied.add(path);
      }
      update({ assets, files: sources, assetsOpen: state.lesson || state.assetsOpen, dirty: true }, true);
      const noun = state.lesson ? (files.length === 1 ? "Bild" : "Bilder") : (files.length === 1 ? "Datei" : "Dateien");
      showToast(files.length === 1 ? noun + " hinzugefügt" : `${files.length} ${noun} hinzugefügt`);
      onRouteChange();
    } catch (error) { showToast(error.message || "Dateien konnten nicht geladen werden."); }
  }

  function removeImage(path) {
    const asset = state.assets.get(path);
    if (!asset) return;
    URL.revokeObjectURL(asset.url);
    const assets = new Map(state.assets);
    assets.delete(path);
    update({ assets, dirty: true }, true);
    showToast("Bild entfernt");
  }

  function projectEntryPath(folder, name) {
    name = name.trim();
    if (!name || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || name === "." || name === "..") {
      throw new Error("Gib einen gültigen Namen ohne Schrägstrich ein.");
    }
    return folder ? folder + "/" + name : name;
  }

  function assertAvailableProjectPath(path) {
    const existing = ["index.html", ...(state.hasStyles ? ["styles.css"] : []), ...state.files.keys(), ...state.assets.keys(), ...state.folders];
    if (existing.some(item => item === path || item.startsWith(path + "/"))) throw new Error("Dieser Name ist bereits vergeben.");
  }

  function addProjectEntry(folder, name, directory) {
    const path = projectEntryPath(folder, name);
    assertAvailableProjectPath(path);
    if (directory) update({ folders: [...state.folders, path], dirty: true });
    else update({ files: new Map(state.files).set(path, ""), dirty: true });
    return path;
  }

  function changeProjectFile(path, name) {
    const folder = path.slice(0, Math.max(0, path.lastIndexOf("/")));
    return relocateProjectFile(path, name === undefined ? null : projectEntryPath(folder, name));
  }

  function moveProjectFile(path, folder) {
    const name = path.split("/").at(-1);
    return relocateProjectFile(path, folder ? folder + "/" + name : name);
  }

  function relocateProjectFile(path, next) {
    if (state.lesson || path === "index.html") return;
    const mainStyles = path === "styles.css" && state.hasStyles;
    const asset = state.assets.get(path);
    if (!mainStyles && !asset && !state.files.has(path)) return;
    if (next === path) return path;
    if (next) assertAvailableProjectPath(next);

    if (asset) {
      const assets = new Map(state.assets);
      assets.delete(path);
      if (next) assets.set(next, asset);
      else URL.revokeObjectURL(asset.url);
      update({ assets, dirty: true }, true);
    } else {
      const files = new Map(state.files);
      if (next) files.set(next, mainStyles ? state.css : files.get(path));
      files.delete(path);
      update({ files, ...(mainStyles ? { hasStyles: false, css: "" } : {}), dirty: true }, true);
    }
    return next;
  }

  function editProjectFile(path, value) {
    if (path === "index.html" || (path === "styles.css" && state.hasStyles)) {
      setCode(path === "index.html" ? "html" : "css", value);
      return;
    }
    update({ files: new Map(state.files).set(path, value), dirty: true }, true);
  }

  async function openProject(file) {
    if (!file) return;
    const generation = projectGeneration;
    const previous = state;
    try {
      const { files, comment } = await readZip(await file.arrayBuffer());
      if (!files.has("index.html")) throw new Error("Im Projekt-ZIP fehlt index.html.");
      if (generation !== projectGeneration || !sameProject(previous)) return;
      const decoder = new TextDecoder();
      const html = prepareInlineScripts(decoder.decode(files.get("index.html")), false);
      const css = files.has("styles.css") ? decoder.decode(files.get("styles.css")) : "";
      const sources = new Map();
      const folders = [];
      const images = [];
      for (const [name, bytes] of files) {
        if (name === "index.html" || name === "styles.css") continue;
        if (name.endsWith("/")) {
          folders.push(name.slice(0, -1));
          continue;
        }
        const text = decodeProjectText(bytes, mimeFromPath(name));
        if (text === null) images.push({ name, bytes });
        else sources.set(name, text);
      }
      projectGeneration += 1;
      const editorLayout = readEditorLayout(comment, files);
      update({
        ...defaultProject, html, css, hasStyles: files.has("styles.css"),
        editorLayout, projectFolder: editorLayout?.projectFolder ?? "",
        name: cleanProjectName(file.name), projectGeneration, assets: replaceAssets(images), files: sources, folders,
      }, true);
      showToast("Projekt geöffnet");
      onRouteChange();
    } catch (error) { showToast(error.message || "Projekt konnte nicht geladen werden"); }
  }

  function sameProject(previous) {
    return state.name === previous.name && state.html === previous.html && state.css === previous.css && state.hasStyles === previous.hasStyles
      && state.assets === previous.assets && state.files === previous.files && state.folders === previous.folders;
  }

  function renameProject(projectName) {
    if (projectName === state.name) return state.name;
    const name = cleanProjectName(projectName);
    if (name !== state.name) update({ name, dirty: true });
    return name;
  }

  async function save(projectName, editorLayout) {
    const name = projectName === undefined ? state.name : renameProject(projectName);
    const snapshot = state;
    const generation = projectGeneration;
    try {
      const encoder = new TextEncoder();
      const includeStyles = snapshot.hasStyles || snapshot.lesson;
      const html = isFullHtml(snapshot.html) && !snapshot.lesson ? snapshot.html
        : htmlForArchive(snapshot.html, includeStyles || snapshot.files.has("styles.css"));
      const zip = createZip([
        { name: "index.html", bytes: encoder.encode(html) },
        ...(includeStyles ? [{ name: "styles.css", bytes: encoder.encode(snapshot.css) }] : []),
        ...[...snapshot.files].map(([name, text]) => ({ name, bytes: encoder.encode(text) })),
        ...snapshot.folders.map(name => ({ name: name + "/", bytes: new Uint8Array() })),
        ...[...snapshot.assets].map(([name, asset]) => ({ name, bytes: asset.bytes })),
      ], editorLayout ? editorLayoutPrefix + JSON.stringify(editorLayout) : "");
      const native = window.__TAURI__?.core;
      if (native) {
        if (!await native.invoke("save_project", { name: name + ".zip", bytes: Array.from(zip) })) return;
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
        link.download = name + ".zip";
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      if (generation === projectGeneration && sameProject(snapshot)) update({ dirty: false });
      showToast(native ? "Projekt gespeichert" : name + ".zip gespeichert");
    } catch { showToast("Projekt konnte nicht gespeichert werden."); }
  }

  function requestSave(editorLayout) {
    if (state.modal) return;
    if (!state.lesson || window.__TAURI__?.core) save(undefined, editorLayout);
    else update({ modal: { type: "save", name: state.name } });
  }

  update({}, true);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    setLibraryVisible: libraryVisible => update({ libraryVisible }),
    focusHome: () => update({ homeFocus: state.homeFocus + 1 }),
    showToast, confirm, closeModal, leave, setCode, setAssetDrawer, toggleAssets,
    uploadFiles, removeImage, openProject, renameProject, requestSave, save, addProjectEntry, editProjectFile, changeProjectFile, moveProjectFile,
    selectFolder: projectFolder => update({ projectFolder }),
    resetProject,
    restartPreview: () => update({}, true),
    startLesson(files, name) {
      projectGeneration += 1;
      update({ lesson: true, name: cleanProjectName(name), dirty: false, assets: replaceAssets(archiveImages(files)) });
    },
    showLessonStep(step, content) {
      update({ ...step, lessonCodeBlocks: content.flatMap(collectCodeBlocks) }, true);
    },
    snapshotImages: () => [...state.assets].map(([name, asset]) => ({ name, bytes: asset.bytes, type: asset.type })),
    resetLessonImages: images => {
      projectGeneration += 1;
      update({ assets: replaceAssets(images), dirty: false });
    },
  };
}
