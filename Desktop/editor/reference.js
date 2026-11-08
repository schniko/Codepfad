let renderReference = () => {};
const referenceState = { topic: "HTML", query: "", entry: null, returnToLesson: false };

function referenceHref(entry) {
  const path = "nachschlagewerk/" + referenceState.topic.toLowerCase() + (entry ? "/" + entry : "");
  return "#" + formatRoute(path, { suche: referenceState.query.trim(), von: referenceReturnRoute });
}

function setReferenceLabel(id) {
  document.querySelector("#path-picker-modal").setAttribute("aria-labelledby", id);
  document.querySelector("#reference-view").setAttribute("aria-labelledby", id);
}

function mountReference(render) {
  renderReference = () => render({
    ...referenceState,
    entries: referenceEntries,
    href: referenceHref,
    onArticleTitle: setReferenceLabel,
    onReturn: referenceState.returnToLesson ? closePathPicker : null,
    onTopicChange(topic) {
      referenceState.topic = topic;
      renderReference();
      syncRoute();
    },
    onQueryChange(query) {
      referenceState.query = query;
      renderReference();
      syncRoute({ replace: true });
    },
  });
  renderReference();
}

function clearReferenceArticle() {
  if (!referenceState.entry) return;
  referenceState.entry = null;
  renderReference();
}

function showReferenceOverview(returnToLesson) {
  referenceState.entry = null;
  referenceState.returnToLesson = returnToLesson;
  setReferenceLabel("reference-title");
  renderReference();
}

function restoreReference(topic, entryId, query) {
  const language = Object.keys(referenceEntries).find(name => name.toLowerCase() === topic) || "HTML";
  referenceState.topic = language;
  referenceState.query = query || "";
  referenceState.entry = referenceEntries[language].find(item => item.id === entryId || item.aliases.includes(entryId)) || null;
  renderReference();
}
