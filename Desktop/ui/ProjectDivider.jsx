import { useRef } from "react";

const dividerLabels = {
  files: "Breite der Projektdateien ändern",
  preview: "Breite der Vorschau ändern",
  code: "Breite der Codeansichten ändern",
};

function measure(divider, side) {
  const workspace = divider.parentElement;
  if (side === "code") return {
    workspace,
    total: workspace.clientWidth,
    dividerWidth: divider.offsetWidth,
    code: divider.previousElementSibling.getBoundingClientRect().width,
  };
  const width = selector => workspace.querySelector(selector).getBoundingClientRect().width;
  return {
    workspace,
    total: workspace.getBoundingClientRect().width,
    filesMin: parseFloat(getComputedStyle(workspace).getPropertyValue("--project-files-min")),
    files: width(".project-sidebar"),
    source: width(".project-source"),
    preview: width(".preview-pane"),
  };
}

function resize(start, side, delta) {
  if (side === "code") {
    const size = Math.max(100, Math.min(start.total - start.dividerWidth - 100, start.code + delta));
    start.workspace.style.setProperty("--project-code-width", (size / start.total * 100) + "%");
    return;
  }
  const min = side === "files" ? start.filesMin : 220;
  const max = start[side] + start.source - 220;
  const size = Math.max(min, Math.min(max, start[side] + delta));
  const sizes = { files: start.files, preview: start.preview, [side]: size };
  for (const [name, pixels] of Object.entries(sizes)) {
    if (start.workspace.classList.contains(name + "-collapsed")) continue;
    start.workspace.style.setProperty("--project-" + name + "-width", (pixels / start.total * 100) + "%");
  }
}

export function ProjectDivider({ side }) {
  const drag = useRef(null);
  const direction = side === "preview" ? -1 : 1;

  function startDrag(event) {
    if (event.button !== 0 || !event.isPrimary) return;
    drag.current = { ...measure(event.currentTarget, side), x: event.clientX, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current.workspace.classList.add("project-resizing");
  }

  function moveDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    resize(drag.current, side, (event.clientX - drag.current.x) * direction);
  }

  function endDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current.workspace.classList.remove("project-resizing");
    drag.current = null;
  }

  function resizeByKey(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(measure(event.currentTarget, side), side, (event.key === "ArrowLeft" ? -16 : 16) * direction);
  }

  return <div className={"project-divider project-divider-" + side} role="separator" aria-orientation="vertical" tabIndex={0}
    aria-label={dividerLabels[side]}
    onPointerDown={startDrag} onPointerMove={moveDrag} onLostPointerCapture={endDrag}
    onKeyDown={resizeByKey} />;
}
