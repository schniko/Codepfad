import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ReferenceExample } from "./Playground.jsx";
import { collectCodeBlocks, ReadOnlyCodeBlocks } from "./ReadOnlyCode.jsx";

export function ArticleExamples({ article }) {
  const [examples, setExamples] = useState([]);
  const [codeBlocks, setCodeBlocks] = useState([]);

  useLayoutEffect(() => {
    const fixtures = [...article.querySelectorAll(".reference-example")].map(section => {
      const output = section.querySelector(".reference-output");
      const source = language => section.querySelector(`[data-source="${language}"]`)?.textContent || "";
      const previewTitle = output.querySelector("iframe").title;
      output.replaceChildren();
      return {
        output,
        previewTitle,
        language: section.querySelector("[data-source]").dataset.source,
        code: { html: source("html"), css: source("css"), javascript: source("javascript") },
        hasLogo: section.hasAttribute("data-preview-image"),
      };
    });
    setExamples(fixtures);
    setCodeBlocks(collectCodeBlocks(article));
  }, [article]);

  return <>
    <ReadOnlyCodeBlocks blocks={codeBlocks} />
    {examples.map((example, index) => createPortal(<ReferenceExample example={example} />, example.output, index))}
  </>;
}

function ReferenceArticle({ topic, entry, onArticleTitle }) {
  const [article, setArticle] = useState(null);
  const [error, setError] = useState("");
  const body = useRef(null);

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      try {
        const response = await fetch(`nachschlagewerk/${topic.toLowerCase()}/${entry.id}.html`, { cache: "no-cache", signal: request.signal });
        if (!response.ok) throw new Error("Artikel konnte nicht geladen werden.");
        const document = new DOMParser().parseFromString(await response.text(), "text/html");
        const content = document.querySelector(".reference-document");
        if (!content) throw new Error("Der Artikel enthält keinen Inhalt.");
        if (!request.signal.aborted) setArticle(content);
      } catch (error) {
        if (!request.signal.aborted) setError(error.message);
      }
    }
    load();
    return () => request.abort();
  }, [topic, entry.id]);

  useLayoutEffect(() => {
    if (!article) return;
    const container = body.current;
    container.replaceChildren(article);
    const title = article.querySelector("#reference-article-title");
    if (title) {
      onArticleTitle(title.id);
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
    return () => container.replaceChildren();
  }, [article, onArticleTitle]);

  return (
    <div id="reference-article" ref={body}>
      {!article && <p role="status">{error || "Artikel wird geladen …"}</p>}
      {article && <ArticleExamples article={article} />}
    </div>
  );
}

function ReferenceOverview({ entries, topic, query, href, onTopicChange, onQueryChange, onReturn }) {
  const words = query.toLocaleLowerCase("de").trim().split(/\s+/).filter(Boolean);
  const matches = entries[topic].filter(({ title, tags, terms }) => {
    const searchable = [title, ...tags, terms].join(" ").toLocaleLowerCase("de");
    return words.every(word => searchable.includes(word));
  });

  return (
    <div id="reference-overview">
      <div className="library-hero reference-hero">
        <div>
          <h2 id="reference-title">Nachschlagewerk</h2>
          <p>Erklärungen, Codebeispiele und Vorschauen zu HTML, CSS und JavaScript aus den Lernpfaden.</p>
        </div>
      </div>
      {onReturn && <button id="return-from-reference" className="dialog-button" type="button" onClick={onReturn}>← Zurück zum Lernpfad</button>}
      <div className="reference-toolbar">
        <div id="reference-topics" role="group" aria-label="Sprache auswählen">
          {Object.keys(entries).map(name => (
            <button key={name} type="button" aria-pressed={topic === name} data-reference-topic={name}
              onClick={() => onTopicChange(name)}>{name}</button>
          ))}
        </div>
        <div className="reference-search">
          <label htmlFor="reference-query">Einträge durchsuchen</label>
          <input id="reference-query" type="search" placeholder="z. B. margin oder Schleife" autoComplete="off"
            value={query} onChange={event => onQueryChange(event.target.value)} />
        </div>
      </div>
      <p id="reference-count" role="status">{matches.length ? matches.length + " Artikel" : "Keine passenden Artikel."}</p>
      <div id="reference-entries" className="reference-entries">
        {matches.map(({ id, title, tags, terms }) => {
          const syntax = tags.join(", ") || (topic === "CSS" ? terms : "");
          return (
            <a key={id} className="reference-card" href={href(id)} data-reference-entry={id}>
              <strong>{title}</strong>
              {syntax && <code>{syntax}</code>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ReferenceBrowser({ entries, topic, query, entry, href, onTopicChange, onQueryChange, onReturn, onArticleTitle }) {
  if (!entry) return <ReferenceOverview {...{ entries, topic, query, href, onTopicChange, onQueryChange, onReturn }} />;
  return (
    <div id="reference-article-view" data-reference-entry={entry.id}>
      <div className="reference-article-nav">
        <a id="reference-back" href={href()}>← Zur Übersicht</a>
        {onReturn && <button id="return-from-article" className="dialog-button" type="button" onClick={onReturn}>← Zurück zum Lernpfad</button>}
      </div>
      <ReferenceArticle key={topic + "/" + entry.id} {...{ topic, entry, onArticleTitle }} />
    </div>
  );
}
