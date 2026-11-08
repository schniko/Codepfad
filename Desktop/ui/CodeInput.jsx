import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { highlightEditorSource } from "./editor-code.js";

export function CodeInput({ idPrefix, label, languageHint, value, onChange, editable = true, invalid = false, fitContent = false }) {
  const input = useRef(null);
  const highlighted = useRef(null);
  const gutter = useRef(null);
  const [heights, setHeights] = useState([]);
  const lines = useMemo(() => highlightEditorSource(value, languageHint), [value, languageHint]);

  function syncScroll() {
    highlighted.current.scrollTop = input.current.scrollTop;
    highlighted.current.scrollLeft = input.current.scrollLeft;
    gutter.current.scrollTop = input.current.scrollTop;
  }

  useLayoutEffect(() => {
    function measure() {
      const next = [...highlighted.current.children].map(line => line.getBoundingClientRect().height);
      setHeights(previous => next.length === previous.length && next.every((height, index) => height === previous[index]) ? previous : next);
      syncScroll();
    }
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(input.current);
    return () => resize.disconnect();
  }, [lines]);

  useLayoutEffect(syncScroll, [heights]);

  function insertIndent(event) {
    if (event.key !== "Tab" || !editable) return;
    event.preventDefault();
    const input = event.currentTarget;
    input.setRangeText("  ", input.selectionStart, input.selectionEnd, "end");
    onChange(input.value);
  }

  return (
    <div className={"editor" + (fitContent ? " editor-fit-content" : "")}>
      <pre id={idPrefix + "-lines"} ref={gutter} className="line-gutter" aria-hidden="true">
        {lines.map((_, index) => <span key={index} className="line-no" style={{ height: heights[index] || undefined }}>{index + 1}</span>)}
      </pre>
      <div className="code-layer">
        <pre id={idPrefix + "-highlight"} ref={highlighted} className="highlight" aria-hidden="true">
          {lines.map((line, index) => <span key={index} className="code-line" dangerouslySetInnerHTML={{ __html: line || "&#8203;" }} />)}
        </pre>
        <textarea id={idPrefix + "-code"} ref={input} aria-label={label} aria-invalid={invalid}
          value={value} readOnly={!editable} spellCheck={false} autoCapitalize="off" autoComplete="off"
          onChange={editable ? event => onChange(event.target.value) : undefined} onScroll={syncScroll} onKeyDown={insertIndent} />
      </div>
    </div>
  );
}
