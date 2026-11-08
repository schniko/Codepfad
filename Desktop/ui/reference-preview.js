import logoUrl from "../editor/icon.svg?inline";

export function referencePreviewDocument({ html, css, javascript }, hasLogo) {
  const markup = hasLogo ? html.replaceAll('src="icon.svg"', `src="${logoUrl}"`) : html;
  const stylesheet = css.replace(/<\/style/gi, "<\\/style");
  const script = javascript.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <base href="about:srcdoc">
  <title>Vorschau zum Codebeispiel</title>
  <style>
    html { color: #213e32; background: #fffef9; font: 15px/1.5 system-ui, sans-serif; }
    body { margin: 16px; overflow-wrap: anywhere; }
    img { max-width: 100%; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #c4d2cc; padding: 5px 8px; }
    button, input { font: inherit; }
    #codepfad-example-console { margin-top: 16px; padding: 8px 10px; color: #f6f6f0; background: #173e35; border-radius: 6px; }
    #codepfad-example-console pre { margin: 4px 0 0; white-space: pre-wrap; }
  </style>
  <style>${stylesheet}</style>
</head>
<body>
  <section id="codepfad-example-console" aria-label="Konsole" hidden><strong>Konsole</strong><pre aria-live="polite"></pre></section>
  <script>
    (() => {
      const panel = document.querySelector("#codepfad-example-console");
      const output = panel.querySelector("pre");
      const log = console.log.bind(console);
      console.log = (...values) => {
        const format = value => typeof value === "object" ? JSON.stringify(value) : String(value);
        output.textContent += values.map(format).join(" ") + "\\n";
        document.body.append(panel);
        panel.hidden = false;
        log(...values);
      };
      addEventListener("error", event => console.log(event.message));
    })();
  </script>
  ${markup}
  <script>${script}</script>
</body>
</html>`;
}
