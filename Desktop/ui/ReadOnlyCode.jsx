import { useId } from "react";
import { createPortal } from "react-dom";
import { CodeInput } from "./CodeInput.jsx";

const labels = { html: "HTML", css: "CSS", javascript: "JavaScript" };

export function collectCodeBlocks(container) {
  return [...container.querySelectorAll("pre")].map(pre => {
    const code = pre.querySelector("code") || pre;
    const language = code.dataset.source;
    const mount = document.createElement("div");
    pre.replaceWith(mount);
    return { mount, language, value: code.textContent };
  });
}

function ReadOnlyCode({ language, value }) {
  const id = useId();
  return <CodeInput idPrefix={id} label={labels[language] ? labels[language] + "-Codebeispiel" : "Codebeispiel"}
    languageHint={language === "css" || language === "javascript" ? language : undefined}
    value={value} editable={false} fitContent />;
}

export function ReadOnlyCodeBlocks({ blocks }) {
  return blocks.map(({ mount, ...code }, index) => createPortal(<ReadOnlyCode {...code} />, mount, index));
}
