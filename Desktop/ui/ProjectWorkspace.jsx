import { Fragment, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { CodeInput } from "./CodeInput.jsx";
import { ProjectDivider } from "./ProjectDivider.jsx";

function projectTree(state) {
  const root = new Map();
  const entries = [
    ...state.folders.map(path => [path, "folder"]),
    ...["index.html", ...(state.hasStyles ? ["styles.css"] : []), ...state.files.keys()].map(path => [path, "source"]),
    ...[...state.assets].map(([path, asset]) => [path, asset.type.startsWith("image/") ? "image" : "asset"]),
  ];
  for (const [path, kind] of entries) {
    const parts = path.split("/");
    let children = root;
    parts.forEach((name, index) => {
      if (!children.has(name)) {
        children.set(name, { name, path: parts.slice(0, index + 1).join("/"),
          kind: index < parts.length - 1 ? "folder" : kind, children: new Map() });
      }
      children = children.get(name).children;
    });
  }
  return root;
}

function FileTree({ nodes, folder, active, expanded, onFolder, onFile, folderDropProps, fileDragProps }) {
  const sorted = [...nodes.values()].sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name));
  return <ul className="project-tree">{sorted.map(node => {
    if (node.kind === "folder") {
      const open = expanded.has(node.path);
      return <li key={node.path}>
        <button type="button" title={node.path} aria-expanded={open} className={folder === node.path ? "selected" : ""}
          onClick={() => onFolder(node.path)} {...folderDropProps(node.path)}>
          <span aria-hidden="true">
            <svg className="project-file-icon" viewBox="0 0 16 18" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {open ? <>
                <path d="M1.5 13V4a1 1 0 0 1 1-1h3l1.5 2h5a1 1 0 0 1 1 1v.5" />
                <path d="M1.5 13l2.2-5a1 1 0 0 1 .9-.6H14a1 1 0 0 1 .9 1.4l-2.2 5.4a1 1 0 0 1-.9.6H2.4a1 1 0 0 1-.9-1.4Z" />
              </> : <path d="M1.5 5a1 1 0 0 1 1-1h3.2l1.5 2h6.3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />}
            </svg>
          </span> {node.name}
        </button>
        {open && <FileTree nodes={node.children} {...{ folder, active, expanded, onFolder, onFile, folderDropProps, fileDragProps }} />}
      </li>;
    }
    return <li key={node.path}>
      <button type="button" title={node.path} className={active === node.path ? "selected" : ""}
        aria-current={active === node.path ? "true" : undefined} onClick={() => onFile(node.path)} {...fileDragProps(node.path)}>
        <span aria-hidden="true">
          <svg className="project-file-icon" viewBox="0 0 16 18" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 1.5h5.5l4 4V15a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V3A1.5 1.5 0 0 1 4 1.5Z" />
            <path d="M9.5 1.5v4h4" />
            {node.kind === "image" ? <>
              <path d="M5 13.5v-1l2-2 1.5 1.5 1.5-1.5 1 1v2Z" />
              <circle cx="6" cy="7.5" r=".8" />
            </> : <path d="M5.25 7.5h3M5.25 10.25h5.5m-5.5 2.75h5.5" />}
          </svg>
        </span> {node.name}
      </button>
    </li>;
  })}</ul>;
}

function removeTab(group, path) {
  const tabs = group.tabs.filter(tab => tab !== path);
  return { tabs, active: group.active === path ? tabs[Math.max(0, group.tabs.indexOf(path) - 1)] : group.active };
}

function EntryNameDialog({ kind, filename, onSubmit, onClose }) {
  const dialog = useRef(null);
  const input = useRef(null);
  const [error, setError] = useState("");
  const folder = kind === "folder";

  useLayoutEffect(() => {
    dialog.current.showModal();
    if (filename) input.current.select();
  }, [filename]);

  function submit(event) {
    event.preventDefault();
    try {
      onSubmit(input.current.value);
      dialog.current.close();
    } catch (error) {
      setError(error.message);
      input.current.focus();
    }
  }

  return <dialog ref={dialog} className="modal-card project-create-dialog" aria-labelledby="project-create-title" onClose={onClose}>
    <form onSubmit={submit}>
      <h2 id="project-create-title">{filename ? "Datei umbenennen" : folder ? "Neuen Ordner anlegen" : "Neue Datei anlegen"}</h2>
      <label htmlFor="project-entry-name">{folder ? "Ordnername" : "Dateiname"}</label>
      <div className="filename-field">
        <input ref={input} id="project-entry-name" type="text" defaultValue={filename} required autoComplete="off"
          aria-invalid={error ? true : undefined} aria-describedby={error ? "project-create-error" : undefined}
          onChange={() => setError("")} />
      </div>
      {error && <p id="project-create-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="dialog-button" type="button" onClick={() => dialog.current.close()}>Abbrechen</button>
        <button className="dialog-button confirm" type="submit">{filename ? "Umbenennen" : "Anlegen"}</button>
      </div>
    </form>
  </dialog>;
}

export function ProjectWorkspace({ state, editor, layoutRef, hideFilesButton, onHideFiles, onAddFiles }) {
  const layout = state.editorLayout;
  const sourcePane = useRef(null);
  const [groups, setGroups] = useState(() => layout?.groups ?? [{ tabs: ["index.html"], active: "index.html" }]);
  const [focusedGroup, setFocusedGroup] = useState(() => layout?.focusedGroup ?? 0);
  const [draggedTab, setDraggedTab] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const draggedFile = useRef(null);
  const [fileDropFolder, setFileDropFolder] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set(layout?.expanded));
  const [creation, setCreation] = useState(null);
  const [renamePath, setRenamePath] = useState(null);
  const [fileSelected, setFileSelected] = useState(() => layout?.fileSelected ?? true);
  const tree = projectTree(state);
  const folder = state.projectFolder;
  const visibleGroups = groups.map(group => {
    const tabs = group.tabs.filter(path => path === "index.html" || (path === "styles.css" && state.hasStyles) || state.files.has(path) || state.assets.has(path));
    return { tabs, active: tabs.includes(group.active) ? group.active : tabs.at(-1) };
  });
  const selectedFile = fileSelected ? visibleGroups[focusedGroup].active : undefined;

  useImperativeHandle(layoutRef, () => ({
    groups: visibleGroups, focusedGroup, expanded: [...expanded], fileSelected, projectFolder: folder,
    get codeWidth() { return sourcePane.current.style.getPropertyValue("--project-code-width"); },
  }));

  function openFile(path, preferredGroup = focusedGroup) {
    setFileSelected(true);
    const existing = groups.findIndex(group => group.tabs.includes(path));
    const destination = existing < 0 ? preferredGroup : existing;
    setGroups(previous => previous.map((group, index) => index !== destination ? group : {
      tabs: group.tabs.includes(path) ? group.tabs : [...group.tabs, path], active: path,
    }));
    setFocusedGroup(destination);
    editor.selectFolder(path.slice(0, Math.max(path.lastIndexOf("/"), 0)));
  }

  function closeTab(index, path) {
    setGroups(previous => previous.map((group, groupIndex) => groupIndex === index ? removeTab(group, path) : group));
  }

  function splitEditor() {
    const left = visibleGroups[0];
    const path = left.tabs.findLast(tab => tab !== left.active && !state.assets.has(tab))
      ?? [state.hasStyles ? "styles.css" : undefined, "index.html", ...state.files.keys()].find(tab => tab && tab !== left.active);
    setGroups([removeTab(left, path), { tabs: path ? [path] : [], active: path }]);
    setFocusedGroup(1);
  }

  function mergeEditor() {
    const [left, right] = visibleGroups;
    setGroups([{ tabs: [...left.tabs, ...right.tabs], active: visibleGroups[focusedGroup].active ?? left.active ?? right.active }]);
    setFocusedGroup(0);
  }

  function startTabDrag(event, index, path) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-codepfad-tab", path);
    setDraggedTab({ index, path });
  }

  function endTabDrag() {
    setDraggedTab(null);
    setDropTarget(null);
  }

  function tabDropSide(event) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    return event.clientX < left + width / 2 ? "before" : "after";
  }

  function hoverTab(event, index, path) {
    if (!draggedTab) return;
    event.stopPropagation();
    if (draggedTab.path === path) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const side = path ? tabDropSide(event) : "end";
    setDropTarget(previous => previous?.index === index && previous.path === path && previous.side === side
      ? previous : { index, path, side });
  }

  function dropTab(event, index, path) {
    if (!draggedTab) return;
    event.stopPropagation();
    if (draggedTab.path === path) return;
    event.preventDefault();
    const side = path ? tabDropSide(event) : "end";
    const across = draggedTab.index !== index;
    setGroups(previous => previous.map((group, groupIndex) => {
      if (groupIndex === index) {
        const tabs = group.tabs.filter(tab => tab !== draggedTab.path);
        const position = path ? tabs.indexOf(path) + Number(side === "after") : tabs.length;
        tabs.splice(position, 0, draggedTab.path);
        return { tabs, active: across ? draggedTab.path : group.active };
      }
      return groupIndex === draggedTab.index ? removeTab(group, draggedTab.path) : group;
    }));
    if (across) setFocusedGroup(index);
    endTabDrag();
  }

  function clearDropTarget(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
  }

  function toggleFolder(path) {
    setFileSelected(false);
    editor.selectFolder(path);
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function create(name) {
    const directory = creation === "folder";
    const path = editor.addProjectEntry(folder, name, directory);
    setExpanded(previous => new Set([...previous, ...(folder ? [folder] : []), ...(directory ? [path] : [])]));
    if (directory) {
      setFileSelected(false);
      editor.selectFolder(path);
    }
    else openFile(path);
  }

  function renameFile(name) {
    updateOpenFilePath(renamePath, editor.changeProjectFile(renamePath, name));
  }

  function updateOpenFilePath(oldPath, next) {
    if (!next || next === oldPath) return;
    setGroups(previous => previous.map(group => ({
      tabs: group.tabs.map(path => path === oldPath ? next : path),
      active: group.active === oldPath ? next : group.active,
    })));
  }

  function endFileDrag() {
    draggedFile.current = null;
    setFileDropFolder(null);
  }

  function fileDragProps(path) {
    if (path === "index.html") return {};
    return {
      draggable: true,
      onDragStart(event) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-codepfad-file", path);
        draggedFile.current = path;
      },
      onDragEnd: endFileDrag,
    };
  }

  function folderDropProps(destination) {
    return {
      "data-file-drop": fileDropFolder === destination ? "" : undefined,
      onDragOver(event) {
        if (!draggedFile.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setFileDropFolder(destination);
      },
      onDragLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFileDropFolder(current => current === destination ? null : current);
        }
      },
      onDrop(event) {
        const path = draggedFile.current;
        if (!path) return;
        event.preventDefault();
        endFileDrag();
        try {
          const next = editor.moveProjectFile(path, destination);
          updateOpenFilePath(path, next);
          if (destination) setExpanded(previous => new Set([...previous, destination]));
          if (selectedFile === path && next !== path) editor.selectFolder(destination);
        } catch (error) {
          editor.showToast(error.message);
        }
      },
    };
  }

  async function deleteFile(path) {
    const name = path.split("/").at(-1);
    if (!await editor.confirm(`„${name}“ wirklich löschen?`, "Datei löschen")) return;
    if (editor.getSnapshot().projectGeneration !== state.projectGeneration) return;
    editor.changeProjectFile(path);
    setGroups(previous => previous.map(group => removeTab(group, path)));
  }

  return <>
    <aside id="project-sidebar" className="project-sidebar" aria-label="Projektdateien">
      <header className="project-column-header project-sidebar-header">
        <b>Dateien</b>
        <div>
          <button type="button" title="Neue Datei" aria-label="Neue Datei" aria-haspopup="dialog" onClick={() => setCreation("file")}>＋</button>
          <button type="button" title="Neuer Ordner" aria-label="Neuer Ordner" aria-haspopup="dialog" onClick={() => setCreation("folder")}>▸＋</button>
          <button type="button" title="Dateien hinzufügen" aria-label="Dateien hinzufügen" onClick={onAddFiles}>⇧</button>
        </div>
        <button ref={hideFilesButton} type="button" aria-expanded={true} aria-controls="project-sidebar"
          aria-label="Dateien einklappen" title="Dateien einklappen" onClick={onHideFiles}>«</button>
      </header>
      <div className="project-file-list">
        <button type="button" className="project-root" title="Projektordner auswählen" onClick={() => {
          setFileSelected(false);
          editor.selectFolder("");
        }} {...folderDropProps("")}>
          {state.name}/
        </button>
        <FileTree nodes={tree} folder={folder} active={selectedFile} expanded={expanded} onFolder={toggleFolder} onFile={openFile}
          folderDropProps={folderDropProps} fileDragProps={fileDragProps} />
      </div>
      {selectedFile && <footer className="project-file-actions">
        <b title={selectedFile}>{selectedFile.split("/").at(-1)}</b>
        {selectedFile === "index.html" ? <span>Startdatei</span> : <>
          <button type="button" aria-haspopup="dialog" onClick={() => setRenamePath(selectedFile)}>Umbenennen</button>
          <button type="button" aria-haspopup="dialog" onClick={() => deleteFile(selectedFile)}>Löschen</button>
        </>}
      </footer>}
    </aside>
    <ProjectDivider side="files" />
    <div ref={sourcePane} className={"project-source" + (groups.length === 2 ? " project-source-split" : "")}
      style={{ "--project-code-width": layout?.widths.code }}>
      {visibleGroups.map(({ tabs, active }, index) => {
        const asset = state.assets.get(active);
        const language = active === "index.html" ? "html" : active === "styles.css" && state.hasStyles ? "css" : "project";
        const valid = language === "html" ? state.htmlValid : language === "css" ? state.cssValid : true;
        const value = language === "project" ? state.files.get(active) : state[language];
        return <Fragment key={index}>
          {index === 1 && <ProjectDivider side="code" />}
          <section className={"pane project-code-pane" + (index === focusedGroup ? " focused" : "")}
            aria-label={index === 0 ? "Geöffnete Dateien" : "Rechte Codeansicht"}
            onFocusCapture={() => { setFocusedGroup(index); setFileSelected(true); }}
            onPointerDown={() => { setFocusedGroup(index); setFileSelected(true); }}>
            <header className="project-column-header project-tab-bar">
              <div className="project-tabs" aria-label="Datei-Tabs"
                data-drop-end={dropTarget?.index === index && dropTarget.side === "end" ? "" : undefined}
                onDragOver={event => hoverTab(event, index)} onDragLeave={clearDropTarget}
                onDrop={event => dropTab(event, index)}>
                {tabs.map(path => <div key={path} className={active === path ? "active" : ""}
                  data-drop-side={dropTarget?.path === path ? dropTarget.side : undefined}
                  onDragOver={event => hoverTab(event, index, path)} onDragLeave={clearDropTarget}
                  onDrop={event => dropTab(event, index, path)}>
                  <button type="button" title={path} aria-pressed={active === path} onClick={() => openFile(path, index)}
                    draggable={tabs.length > 1 || groups.length === 2} onDragStart={event => startTabDrag(event, index, path)} onDragEnd={endTabDrag}>
                    {path.split("/").at(-1)}
                  </button>
                  <button type="button" aria-label={path + " schließen"} onClick={() => closeTab(index, path)}>×</button>
                </div>)}
              </div>
              {index === groups.length - 1 && <button className="project-split-toggle" type="button"
                aria-label={index === 0 ? "Codeansicht teilen" : "Codeansichten zusammenführen"}
                title={index === 0 ? "Codeansicht teilen" : "Codeansichten zusammenführen"}
                onClick={index === 0 ? splitEditor : mergeEditor}>{index === 0 ? "◫" : "×"}</button>}
            </header>
            {asset ? <div className="project-asset">
              {asset.type.startsWith("image/") && <img src={asset.url} alt={active} />}
              <span>{active}</span>
            </div> : active ? <>
              <CodeInput key={active} idPrefix={language === "project" && index === 1 ? "project-right" : language}
                label={language === "html" ? "HTML-Quelltext" : language === "css" ? "CSS-Quelltext" : active}
                languageHint={/\.css$/i.test(active) ? "css" : /\.m?js$/i.test(active) ? "javascript" : undefined}
                value={value} invalid={!valid} onChange={source => editor.editProjectFile(active, source)} />
              {!valid && <div className="validation-status" role="status">Kein gültiger {language.toUpperCase()}-Code</div>}
            </> : <p className="project-empty">Wähle links eine Datei aus.</p>}
          </section>
        </Fragment>;
      })}
    </div>
    {creation && <EntryNameDialog kind={creation} onSubmit={create} onClose={() => setCreation(null)} />}
    {renamePath && <EntryNameDialog filename={renamePath.split("/").at(-1)} onSubmit={renameFile} onClose={() => setRenamePath(null)} />}
  </>;
}
