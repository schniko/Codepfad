import { useEffect, useId, useRef, useState } from "react";
import { CodeInput } from "./CodeInput.jsx";
import { referencePreviewDocument } from "./reference-preview.js";

const languages = [
  ["html", "HTML"],
  ["css", "CSS"],
  ["javascript", "JavaScript"],
];

function Playground({ example, onClose }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [language, setLanguage] = useState(example.language);
  const [code, setCode] = useState(example.code);
  const [preview, setPreview] = useState({ code: example.code, run: 0 });

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  useEffect(() => {
    if (code === preview.code) return;
    const timer = setTimeout(() => setPreview(current => ({ code, run: current.run + 1 })), 280);
    return () => clearTimeout(timer);
  }, [code, preview.code]);

  function runPreview() {
    setPreview(current => ({ code, run: current.run + 1 }));
  }

  function resetExample() {
    setCode(example.code);
    setPreview(current => ({ code: example.code, run: current.run + 1 }));
  }

  const label = languages.find(([key]) => key === language)[1];
  return (
    <dialog className="playground" ref={dialog} aria-labelledby={titleId} onClose={onClose}>
      <header className="playground-header">
        <h2 id={titleId}>Playground</h2>
        <button type="button" onClick={() => dialog.current.close()}>Schließen</button>
      </header>
      <div className="playground-layout">
        <section className="playground-source" aria-label="Mini-Editor">
          <div className="playground-languages" role="group" aria-label="Quelltext auswählen">
            {languages.map(([key, name]) => (
              <button key={key} type="button" aria-pressed={language === key} onClick={() => setLanguage(key)}>{name}</button>
            ))}
          </div>
          <CodeInput key={language} idPrefix={titleId + "-source"} label={label + "-Quelltext"}
            languageHint={language === "html" ? undefined : language} value={code[language]}
            onChange={source => setCode({ ...code, [language]: source })} />
        </section>
        <section className="playground-result" aria-label="Live-Vorschau">
          <div className="playground-result-header">
            <strong>Live-Vorschau</strong>
            <button type="button" onClick={runPreview}>Neu starten</button>
          </div>
          <iframe key={preview.run} title="Playground-Vorschau" sandbox="allow-scripts"
            srcDoc={referencePreviewDocument(preview.code, example.hasLogo)} />
        </section>
      </div>
      <footer className="playground-footer">
        <button type="button" onClick={resetExample}>Beispiel zurücksetzen</button>
      </footer>
    </dialog>
  );
}

export function ReferenceExample({ example }) {
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [previewRun, setPreviewRun] = useState(0);
  return (
    <>
      <div className="reference-output-header">
        <h3>Vorschau</h3>
        <div className="reference-output-actions">
          <button type="button" onClick={() => setPreviewRun(run => run + 1)}>Neu starten</button>
          <button type="button" aria-haspopup="dialog" onClick={() => setPlaygroundOpen(true)}>Im Playground öffnen</button>
        </div>
      </div>
      <iframe key={previewRun} title={example.previewTitle} sandbox="allow-scripts"
        srcDoc={referencePreviewDocument(example.code, example.hasLogo)} />
      {playgroundOpen && <Playground example={example} onClose={() => setPlaygroundOpen(false)} />}
    </>
  );
}
