import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import logoUrl from "../editor/icon.svg?inline";
import { CodeInput } from "./CodeInput.jsx";
import { ReadOnlyCodeBlocks } from "./ReadOnlyCode.jsx";
import { ProjectWorkspace } from "./ProjectWorkspace.jsx";
import { ProjectDivider } from "./ProjectDivider.jsx";

function CodePane({ language, value, editable, valid, onChange }) {
  const label = language.toUpperCase();
  return (
    <section id={language === "css" ? "css-pane" : undefined} className={`pane ${language}-pane${editable ? "" : " is-readonly"}`} aria-label={label + "-Editor"}>
      <header className="pane-head"><b>{label}</b><span id={language + "-editor-state"}>{editable ? (language === "html" ? "Seiteninhalt" : "styles.css") : "Gesperrt"}</span></header>
      <CodeInput idPrefix={language} label={label + "-Quelltext"} languageHint={language === "css" ? "css" : undefined}
        value={value} editable={editable} invalid={!valid} onChange={source => onChange(language, source)} />
      <div id={language + "-status"} className="validation-status" role="status" aria-live="polite" hidden={valid}>kein gültiger {label}-Code</div>
    </section>
  );
}

function PreviewFrame({ html, showConsole }) {
  const frame = useRef(null);
  const panel = useRef(null);
  const [output, setOutput] = useState("");

  useLayoutEffect(() => {
    if (!showConsole) return;
    function receive(event) {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "mint-preview-log" || typeof event.data.text !== "string") return;
      setOutput(previous => (previous ? previous + "\n" : "") + event.data.text.slice(0, 2000));
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [showConsole]);

  useLayoutEffect(() => {
    panel.current.scrollTop = panel.current.scrollHeight;
  }, [output]);

  return (
    <>
      <iframe id="preview" ref={frame} title="Vorschau des Webprojekts" sandbox="allow-scripts allow-popups" srcDoc={html} />
      <section id="preview-console" ref={panel} className="preview-console" aria-label="Konsole" hidden={!showConsole}>
        <strong>Konsole</strong><pre id="preview-console-output" aria-live="polite">{output}</pre>
      </section>
    </>
  );
}

function AssetDrawer({ state, onRemove }) {
  return (
    <aside id="asset-drawer" className="asset-drawer" hidden={!state.assetsOpen} inert={state.libraryVisible}>
      <div className="asset-intro"><strong>Bilder im Projekt</strong></div>
      <div id="asset-list" className="asset-list">
        {state.assets.size ? [...state.assets].map(([path, asset]) => (
          <article className="asset" key={path}>
            <img src={asset.url} alt="" />
            <div className="asset-info"><code title={path}>{path}</code></div>
            <button className="remove-asset" type="button" data-remove-path={path}
              aria-label={path + " entfernen"} onClick={() => onRemove(path)}>×</button>
          </article>
        )) : <p className="asset-empty">Noch keine Bilder hochgeladen.</p>}
      </div>
    </aside>
  );
}

function ConfirmDialog({ modal, onClose }) {
  const dialog = useRef(null);
  useLayoutEffect(() => { dialog.current.showModal(); }, []);
  return (
    <dialog ref={dialog} id="confirm-action" aria-labelledby="confirm-title" onClose={event => onClose(event.currentTarget.returnValue === "continue")}>
      <form method="dialog">
        <h2 id="confirm-title">{modal.question}</h2>
        <div className="modal-actions">
          <button className="dialog-button" value="cancel" autoFocus>Abbrechen</button>
          <button id="confirm-continue" className="dialog-button confirm" value="continue">{modal.action}</button>
        </div>
      </form>
    </dialog>
  );
}

function ProjectModal({ modal, editor, saveButton }) {
  const initialFocus = useRef(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    initialFocus.current.focus();
    if (modal.type === "save") initialFocus.current.select();
    return () => (previous instanceof HTMLElement ? previous : saveButton.current)?.focus();
  }, [modal.type, saveButton]);

  function close() { editor.closeModal(); }
  function dismissBackdrop(event) { if (event.target === event.currentTarget) close(); }

  return (
    <div id="save-modal" className="modal" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={dismissBackdrop}>
      <form id="save-form" className="modal-card" onSubmit={event => {
        event.preventDefault();
        const name = new FormData(event.currentTarget).get("project-name");
        close();
        editor.save(name);
      }}>
        <p className="modal-kicker">Projekt speichern</p>
        <h2 id="save-title">Wie soll die Datei heißen?</h2>
        <label htmlFor="project-name">Dateiname</label>
        <div className="filename-field"><input ref={initialFocus} id="project-name" name="project-name" type="text" defaultValue={modal.name}
          maxLength={100} required autoComplete="off" /><span>.zip</span></div>
        <div className="modal-actions"><button id="cancel-save" className="dialog-button" type="button" onClick={close}>Abbrechen</button><button className="dialog-button confirm" type="submit">Speichern</button></div>
      </form>
    </div>
  );
}

export function Editor({ editor, containers }) {
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const workspace = useRef(null);
  const projectLayout = useRef(null);
  const showFilesButton = useRef(null);
  const hideFilesButton = useRef(null);
  const focusFilesToggle = useRef(false);
  const home = useRef(null);
  const imageInput = useRef(null);
  const projectInput = useRef(null);
  const projectNameInput = useRef(null);
  const saveButton = useRef(null);
  const paused = !state.htmlValid || !state.cssValid;

  useLayoutEffect(() => {
    if (state.homeFocus) home.current.focus();
  }, [state.homeFocus]);

  useLayoutEffect(() => {
    setFilesCollapsed(state.editorLayout?.filesCollapsed ?? false);
    setPreviewCollapsed(state.editorLayout?.previewCollapsed ?? false);
  }, [state.projectGeneration, state.editorLayout]);

  useLayoutEffect(() => {
    if (!focusFilesToggle.current) return;
    focusFilesToggle.current = false;
    (filesCollapsed ? showFilesButton : hideFilesButton).current?.focus();
  }, [filesCollapsed]);

  useEffect(() => {
    function syncFullscreen() { setFullscreen(Boolean(document.fullscreenElement)); }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event) {
      if (!editor.getSnapshot().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function dismissProjectModal(event) {
      const modal = editor.getSnapshot().modal;
      if (event.key !== "Escape" || !modal || modal.type === "confirm") return;
      editor.closeModal();
      event.preventDefault();
    }
    document.addEventListener("keydown", dismissProjectModal, true);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("keydown", dismissProjectModal, true);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [editor]);

  function chooseFiles() { imageInput.current.click(); }

  function saveProject() {
    commitProjectName();
    const { codeWidth, ...layout } = projectLayout.current;
    const { style } = workspace.current;
    editor.requestSave({
      ...layout, filesCollapsed, previewCollapsed,
      widths: {
        files: style.getPropertyValue("--project-files-width"),
        preview: style.getPropertyValue("--project-preview-width"),
        code: codeWidth,
      },
    });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      editor.showToast("Vollbild ist in diesem Browserfenster nicht verfügbar.");
    }
  }

  function toggleFiles() {
    focusFilesToggle.current = true;
    setFilesCollapsed(value => !value);
  }

  function commitProjectName() {
    const input = projectNameInput.current;
    input.value = editor.renameProject(input.value);
  }

  async function chooseProject() {
    if (state.dirty && !await editor.confirm("Ungespeicherte Änderungen beim Öffnen verwerfen?", "Fortfahren")) return;
    projectInput.current.click();
  }

  return (
    <>
      <ReadOnlyCodeBlocks blocks={state.lessonCodeBlocks} />
      {createPortal(
        <header className="appbar" inert={state.libraryVisible}>
          <div className="appbar-start">
            {!state.lesson && <div className="files-reopen" data-visible={filesCollapsed} inert={!filesCollapsed}>
              <button ref={showFilesButton} className="button" type="button" aria-expanded={false} aria-controls="project-sidebar"
                aria-label="Dateien ausklappen" title="Dateien ausklappen" onClick={toggleFiles}>»</button>
            </div>}
            <div className="brand">
              <button ref={home} id="editor-home" className="brand-logo" type="button" aria-label="Zur Startseite" aria-haspopup="dialog" onClick={editor.leave}>
                <img src={logoUrl} alt="" />
              </button>
              <strong>Editor:</strong>
              {!state.lesson && <input key={state.projectGeneration} ref={projectNameInput} className="project-name-input"
                aria-label="Projektname" defaultValue={state.name} onBlur={commitProjectName}
                onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} />}
            </div>
          </div>
          <div className="actions">
            <input ref={imageInput} id="image-input" type="file" accept={state.lesson ? "image/*" : undefined} multiple hidden onChange={event => {
              const files = [...event.currentTarget.files];
              event.currentTarget.value = "";
              editor.uploadFiles(files, state.lesson ? "" : state.projectFolder);
            }} />
            <button id="open-project" className="button" type="button" onClick={chooseProject}>Projekt öffnen</button>
            <input ref={projectInput} id="project-input" type="file" accept=".zip,application/zip" hidden onChange={event => {
              const [file] = event.currentTarget.files;
              event.currentTarget.value = "";
              editor.openProject(file);
            }} />
            <button ref={saveButton} id="save-project" className="button primary" type="button" onClick={saveProject}>Speichern</button>
            <button className="button fullscreen-button" type="button" onClick={toggleFullscreen}
              aria-label={fullscreen ? "Vollbild verlassen" : "Vollbild öffnen"}
              title={fullscreen ? "Vollbild verlassen" : "Vollbild öffnen"}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={fullscreen ? "M3 7h4V3m6 0v4h4m0 6h-4v4m-6 0v-4H3"
                  : "M7 3H3v4m14 0V3h-4m0 14h4v-4M3 13v4h4"} />
              </svg>
            </button>
          </div>
        </header>, containers.toolbar)}
      {createPortal(
        <>
          <button id="path-save-project" type="button" onClick={() => editor.requestSave()}>Schritt speichern</button>
          <button id="path-add-images" type="button" onClick={chooseFiles}>＋ Bilder</button>
          <button id="path-show-assets" type="button" aria-expanded={state.assetsOpen} onClick={editor.toggleAssets}>Bilder <span id="path-asset-count">{state.assets.size}</span></button>
        </>, containers.lessonTools)}
      {createPortal(
        <>
          {state.lesson && <AssetDrawer state={state} onRemove={editor.removeImage} />}
          <main ref={workspace} key={state.lesson ? "lesson" : state.projectGeneration} id="workspace" className={"workspace" + (state.lesson ? (state.cssEnabled ? "" : " css-off") : " project-workspace" + (filesCollapsed ? " files-collapsed" : "") + (previewCollapsed ? " preview-collapsed" : "")) + (state.assetsOpen ? " assets-open" : "")}
            style={{ "--project-files-width": state.editorLayout?.widths.files, "--project-preview-width": state.editorLayout?.widths.preview }}
            hidden={state.goalOnly} inert={state.libraryVisible}>
            {state.lesson ? <>
              <CodePane language="html" value={state.html} editable={state.htmlEditable} valid={state.htmlValid} onChange={editor.setCode} />
              <CodePane language="css" value={state.css} editable={state.cssEditable} valid={state.cssValid} onChange={editor.setCode} />
            </> : <>
              <ProjectWorkspace state={state} editor={editor} layoutRef={projectLayout} hideFilesButton={hideFilesButton}
                onHideFiles={toggleFiles} onAddFiles={chooseFiles} />
              <ProjectDivider side="preview" />
            </>}
            <section className={"pane preview-pane" + (paused ? " paused" : "")} aria-label="Vorschau">
              <header className={"pane-head" + (state.lesson ? "" : " project-column-header")}><b>Vorschau</b><button id="restart-preview" type="button"
                title="Vorschau neu ausführen; Spielstände beginnen wieder von vorn" onClick={editor.restartPreview}>↻ Neu starten</button>
                <span id="live-state" className={"live" + (paused ? " paused" : "")}>{paused ? "Vorschau pausiert" : state.lesson && !state.cssEnabled ? "CSS aus" : "● live"}</span>
                {!state.lesson && <button className="preview-toggle" type="button" aria-expanded={!previewCollapsed}
                  aria-label={previewCollapsed ? "Vorschau ausklappen" : "Vorschau einklappen"}
                  title={previewCollapsed ? "Vorschau ausklappen" : "Vorschau einklappen"}
                  onClick={() => setPreviewCollapsed(value => !value)}>{previewCollapsed ? "«" : "»"}</button>}
              </header>
              <PreviewFrame key={state.preview.key} html={state.preview.html} showConsole={state.showConsole} />
            </section>
          </main>
          <div id="toast" className={"toast" + (state.toastVisible ? " show" : "")} role="status" aria-live="polite">{state.toast}</div>
        </>, containers.workspace)}
      {state.modal?.type === "confirm" && <ConfirmDialog modal={state.modal} onClose={editor.closeModal} />}
      {state.modal && state.modal.type !== "confirm" && <ProjectModal modal={state.modal} editor={editor} saveButton={saveButton} />}
    </>
  );
}
