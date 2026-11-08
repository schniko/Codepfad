// Hash routes work both on GitHub Pages (including project subpaths) and in the desktop webview.
let restoringRoute = false;
let displayedHash = location.hash;
let referenceReturnRoute = "";

function parseRoute(hash = location.hash) {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const [area, item, step] = path.split("/");
  return { area: area || "lernpfade", item, step, params: new URLSearchParams(query) };
}

function formatRoute(path, values) {
  const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();
  return query ? path + "?" + query : path;
}

function workspaceRoute() {
  const { assetsOpen } = editor.getSnapshot();
  const bilder = assetsOpen ? "1" : "";
  if (learningPath && activeCatalogPath) {
    return formatRoute(`lernpfade/${activeCatalogPath}/${learningPathStep + 1}`, {
      stufe: learningPath.singleLevel ? "" : learningPathLevel,
      bilder,
    });
  }
  return "editor";
}

function syncRoute({ replace = false } = {}) {
  if (restoringRoute) return;
  let route;
  if ($("#path-picker-modal").hidden) {
    route = workspaceRoute();
  } else if (!$("#reference-view").hidden) {
    route = referenceHref(referenceState.entry?.id).slice(1);
  } else {
    route = formatRoute("lernpfade", { thema: selectedTopic });
  }
  const hash = "#" + route;
  if (location.hash !== hash) history[replace ? "replaceState" : "pushState"](null, "", hash);
  displayedHash = hash;
}

function lessonPosition(route) {
  const number = Number(route.step);
  return { step: Number.isSafeInteger(number) && number > 0 ? number - 1 : 0, level: route.params.get("stufe") };
}

async function restoreWorkspace(route) {
  const isCourse = route.area === "lernpfade" && route.item;
  if (isCourse) {
    await catalogReady;
    const entry = learningPathCatalog.get(route.item);
    if (!entry) return restorePathList(route);

    if (!learningPath || activeCatalogPath !== entry.id) {
      if (learningPath && !await closeLearningPath({ showLibrary: false })) return false;
      if (editor.getSnapshot().dirty && !await confirmAction("Ungespeicherte Änderungen beim Öffnen verwerfen?", "Fortfahren")) return false;
      await loadCatalogLearningPath(entry.id, lessonPosition(route));
    } else {
      const { step, level } = lessonPosition(route);
      setLearningPathLevel(level || learningPath.defaultLevel);
      const target = Math.min(step, learningPath.steps.length - 1);
      if (target !== learningPathStep) goToLearningPathStep(target);
      closePathPicker();
    }
  } else {
    if (learningPath && !await closeLearningPath({ showLibrary: false })) return false;
    closePathPicker();
  }
  editor.setAssetDrawer(Boolean(isCourse) && route.params.get("bilder") === "1");
  return true;
}

async function restorePathList(route) {
  if (learningPath && !await closeLearningPath({ showLibrary: false })) return false;
  await catalogReady.catch(() => {});
  const topic = route.params.get("thema");
  selectedTopic = [...learningPathCatalog.values()].some(entry => entry.topic === topic) ? topic : "";
  renderCourseList();
  showPathPickerList();
  setLibraryVisible(true);
  return true;
}

async function restoreRoute() {
  if (restoringRoute) return;
  restoringRoute = true;
  const hash = location.hash;
  const route = parseRoute(hash);
  let opened;
  try {
    if (route.area === "nachschlagewerk") {
      const from = route.params.get("von") || "";
      const previous = parseRoute(from);
      const hasWorkspace = previous.area === "editor" || (previous.area === "lernpfade" && previous.item);
      opened = !hasWorkspace || (!$("#path-picker-modal").hidden && workspaceRoute() === from) || await restoreWorkspace(previous);
      if (opened) {
        openReference({ from: hasWorkspace ? from : "" });
        restoreReference(route.item, route.step, route.params.get("suche"));
      }
    } else if (route.area === "editor" || (route.area === "lernpfade" && route.item)) {
      opened = await restoreWorkspace(route);
    } else {
      opened = await restorePathList(route);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    restoringRoute = false;
    if (opened) displayedHash = hash;
    else history.replaceState(null, "", displayedHash || location.pathname + location.search);
  }
}

window.addEventListener("popstate", restoreRoute);
document.addEventListener("DOMContentLoaded", () => {
  if (location.hash) restoreRoute();
});
