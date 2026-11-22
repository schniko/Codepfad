import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CodeInput } from "./CodeInput.jsx";
import { likeCounterPreview, prepareLikeCounter } from "./teacher-trace.js";

function counterHtml(displayText = "", extraButton = "") {
  return `<h2>Like-Counter</h2>
<button id="like" onclick="liken()">Like</button>${extraButton}
<p id="anzeige">${displayText}</p>`;
}

const examples = {
  local: {
    label: "Innerhalb der Funktion",
    source: `${counterHtml()}

<script>
  function liken() {
    let likes = 0;
    likes = likes + 1;
    console.log(likes);
  }
</script>`,
  },
  global: {
    label: "Außerhalb der Funktion",
    source: `${counterHtml()}

<script>
  let likes = 0;

  function liken() {
    likes = likes + 1;
    console.log(likes);
  }
</script>`,
  },
  globalWithDisplay: {
    label: "Global mit Anzeige",
    source: `${counterHtml(0)}

<script>
  let likes = 0;

  function liken() {
    likes = likes + 1;
    let anzeige = document.getElementById("anzeige");
    anzeige.textContent = likes;
    console.log(likes);
  }
</script>`,
  },
  globalWithCondition: {
    label: "Global mit if und else",
    source: `${counterHtml("Du hast weniger als zehn Likes.")}

<script>
  let likes = 0;

  function liken() {
    likes = likes + 1;
    let anzeige = document.getElementById("anzeige");

    if (likes < 10) {
      anzeige.textContent = "Du hast weniger als zehn Likes.";
    } else {
      anzeige.textContent = "Du hast mindestens zehn Likes.";
    }
    console.log(likes);
  }
</script>`,
  },
  likeAndDislike: {
    label: "Like und Dislike",
    source: `${counterHtml(0, '\n<button id="dislike" onclick="disliken()">Dislike</button>')}

<script>
  let likes = 0;

  function liken() {
    likes = likes + 1;
    let anzeige = document.getElementById("anzeige");
    anzeige.textContent = likes;
    console.log(likes);
  }

  function disliken() {
    likes = likes - 1;
    let anzeige = document.getElementById("anzeige");
    anzeige.textContent = likes;
    console.log(likes);
  }
</script>`,
  },
};

const initialSession = { variables: [], output: [], outputCount: 0 };

function useLikeCounter(source, stepping, automatic, parse) {
  const [restart, setRestart] = useState(0);
  const [session, setSession] = useState(initialSession);
  const frame = useRef(null);
  const compiled = useMemo(() => prepareLikeCounter(source, parse), [parse, source]);
  const preview = useMemo(() => {
    const id = crypto.randomUUID();
    return { id, html: likeCounterPreview(compiled, id) };
  }, [compiled, restart]);
  const current = session.id === preview.id ? session : initialSession;
  const running = Boolean(current.line);

  const command = useCallback(command => {
    frame.current?.contentWindow?.postMessage({ session: preview.id, command }, "*");
  }, [preview.id]);

  useLayoutEffect(() => {
    function receive(event) {
      if (event.source !== frame.current?.contentWindow) return;
      const { type, session: id, event: action, ...payload } = event.data || {};
      if (type !== "codepfad-likes" || id !== preview.id) return;
      if (action === "click") {
        command(stepping ? "start" : "run");
        return;
      }
      setSession(previous => {
        const state = previous.id === id ? previous : { ...initialSession, id };
        if (action === "frame") return { ...state, ...payload, line: payload.line, message: "" };
        if (action === "log") {
          const lines = payload.text.split(/\r\n?|\n/).map((text, index) => ({ id: state.outputCount + index, text }));
          return { ...state, output: [...state.output, ...lines].slice(-100), outputCount: state.outputCount + lines.length };
        }
        if (action === "error") return { ...state, line: undefined, message: payload.message };
        return state;
      });
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [command, preview.id, stepping]);

  useEffect(() => {
    if (!stepping || !automatic || !running) return;
    const timer = setTimeout(() => command("next"), 1500);
    return () => clearTimeout(timer);
  }, [automatic, command, current, running, stepping]);

  function reset() { setRestart(value => value + 1); }

  return { current, frame, preview, running, command, reset, error: compiled.message || current.message };
}

function TeacherConsole({ output }) {
  const viewport = useRef(null);
  const lines = useRef(null);
  const previousLine = useRef(-1);

  useLayoutEffect(() => {
    const panel = viewport.current;
    const observer = new ResizeObserver(() => { panel.scrollTop = panel.scrollHeight; });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const panel = viewport.current;
    const list = lines.current;
    const lastLine = output.at(-1)?.id ?? -1;
    const added = lastLine - previousLine.current;
    previousLine.current = lastLine;
    panel.scrollTop = panel.scrollHeight;
    if (added <= 0) return;

    const flash = list.lastElementChild.animate(
      [{ backgroundColor: "#476b59" }, { backgroundColor: "transparent" }],
      { duration: 650, easing: "ease-out" },
    );
    let slide;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const lineHeight = Number.parseFloat(getComputedStyle(panel).lineHeight);
      const distance = Math.min(added * lineHeight, panel.clientHeight);
      slide = list.animate([{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
        { duration: 240, easing: "ease-out" });
    }
    return () => { slide?.cancel(); flash.cancel(); };
  }, [output]);

  return (
    <section className="teacher-console" aria-labelledby="teacher-console-title">
      <h2 id="teacher-console-title">Konsole</h2>
      <pre ref={viewport} role="log" aria-labelledby="teacher-console-title" aria-atomic="false" tabIndex={0}>
        <span className="teacher-console-content">
          <span ref={lines} className="teacher-console-lines">
            {output.length ? output.map(({ id, text }, index) => (
              <Fragment key={id}>{index > 0 && "\n"}<span className="teacher-console-line">{text}</span></Fragment>
            )) : <span className="teacher-console-line teacher-console-empty">Noch keine Ausgabe</span>}
          </span>
        </span>
      </pre>
    </section>
  );
}

function TeacherFullscreenButton() {
  const button = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const lesson = button.current.closest("#teacher-lesson-view");
    function syncFullscreen() { setFullscreen(document.fullscreenElement === lesson); }
    function handleEscape(event) {
      if (event.key !== "Escape" || document.fullscreenElement !== lesson) return;
      event.preventDefault();
      document.exitFullscreen().catch(() => {});
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", handleEscape, true);
      if (document.fullscreenElement === lesson) document.exitFullscreen().catch(() => {});
    };
  }, []);

  async function toggleFullscreen(event) {
    const lesson = event.currentTarget.closest("#teacher-lesson-view");
    setMessage("");
    try {
      if (document.fullscreenElement === lesson) await document.exitFullscreen();
      else await lesson.requestFullscreen();
    } catch {
      setMessage("Vollbild ist in diesem Browserfenster nicht verfügbar.");
    }
  }

  return <>
    <button ref={button} type="button" onClick={toggleFullscreen}>{fullscreen ? "Vollbild verlassen" : "Vollbild öffnen"}</button>
    {message && <span className="teacher-demo-error" role="alert">{message}</span>}
  </>;
}

export function LikeCounterDemo({ parse }) {
  const [scope, setScope] = useState("local");
  const [drafts, setDrafts] = useState({});
  const [stepping, setStepping] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const source = drafts[scope] ?? examples[scope].source;
  const { current, frame, preview, running, command, reset, error } = useLikeCounter(source, stepping, automatic, parse);

  function setStepMode(event) {
    const enabled = event.target.checked;
    if (!enabled && running) command("finish");
    setStepping(enabled);
  }

  return (
    <section className="teacher-demo" aria-label="Like-Counter ausprobieren">
      <section className="teacher-demo-controls" aria-label="Ablaufsteuerung">
        <div className="teacher-demo-settings">
          <label><input type="checkbox" checked={stepping} onChange={setStepMode} /> Zeilenweise ausführen</label>
          {stepping && <label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Automatisch weiter</label>}
        </div>
        <div className="teacher-demo-actions">
          {stepping && <button type="button" onClick={() => command("next")} disabled={!running}>Nächste Zeile</button>}
          <button type="button" onClick={reset}>Neu starten</button>
        </div>
      </section>
      <div className="teacher-demo-grid">
        <div className="teacher-demo-source">
          <h2>HTML</h2>
          {error && <p className="teacher-demo-error" role="alert">{error}</p>}
          <CodeInput idPrefix="teacher-html" label="HTML-Quelltext" value={source}
            languageHint="html" invalid={Boolean(error)} activeLine={stepping ? current.line : undefined}
            onChange={value => setDrafts(previous => ({ ...previous, [scope]: value }))} />
        </div>
        <div className="teacher-demo-result">
          <section className="teacher-demo-preview" aria-labelledby="teacher-preview-title">
            <h2 id="teacher-preview-title">HTML-Vorschau</h2>
            <iframe ref={frame} key={preview.id} title="HTML-Vorschau des Like-Counters" sandbox="allow-scripts" srcDoc={preview.html} />
          </section>
          {stepping && <section className="teacher-variable" aria-labelledby="teacher-variable-title">
            <h2 id="teacher-variable-title">Variablen</h2>
            {current.variables.length ? current.variables.map(({ name, scope, value }) => (
              <div className="teacher-variable-row" key={scope + name}>
                <div><code>{name}</code><small>{scope === "local" ? `Lokal in ${current.handlerName}()` : "Global"}</small></div>
                <output aria-label={`Aktueller Wert von ${name} (${scope === "local" ? "lokal" : "global"})`}>
                  {value}
                </output>
              </div>
            )) : <p>Keine Variablen im aktuellen Schritt.</p>}
          </section>}
          <TeacherConsole key={preview.id} output={current.output} />
        </div>
      </div>
      <div className="teacher-demo-example">
        <label><span>Beispiel</span>
          <select value={scope} onChange={event => { setScope(event.target.value); reset(); }}>
            {Object.entries(examples).map(([value, { label }], index) => <option key={value} value={value}>{index + 1}. {label}</option>)}
          </select>
        </label>
        <TeacherFullscreenButton />
      </div>
    </section>
  );
}
