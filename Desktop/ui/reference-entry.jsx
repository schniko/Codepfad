import { createRoot } from "react-dom/client";
import { ArticleExamples, ReferenceBrowser } from "./ReferenceBrowser.jsx";
import { Editor } from "./Editor.jsx";
import { LikeCounterDemo } from "./LikeCounterDemo.jsx";
import { isValidCss } from "./editor-code.js";
import { createEditor } from "./editor-state.js";

const referenceView = document.querySelector("#reference-view");
if (referenceView) {
  const teacherDemo = createRoot(document.querySelector("#teacher-demo-root"));
  const teacherPaths = import.meta.glob("../../Lernpfade/.lehrkraefte/*/lernpfad.json", { eager: true, import: "default" });
  let selectedDemo = null;
  const editor = window.mountEditor(createEditor, isValidCss, {
    paths: Object.values(teacherPaths).sort((a, b) => a.order - b.order),
    async mountDemo(demo) {
      selectedDemo = demo;
      if (demo !== "like-counter") {
        teacherDemo.render(null);
        return;
      }
      try {
        const { parse } = await import("acorn");
        if (selectedDemo === demo) teacherDemo.render(<LikeCounterDemo parse={parse} />);
      } catch (error) {
        if (selectedDemo === demo) teacherDemo.render(<p role="alert">Die Vorführung konnte nicht geladen werden.</p>);
        console.error(error);
      }
    },
  });
  const containers = {
    toolbar: document.querySelector("#editor-toolbar-root"),
    workspace: document.querySelector("#editor-workspace-root"),
    lessonTools: document.querySelector("#editor-lesson-tools-root"),
  };
  createRoot(document.querySelector("#editor-root")).render(<Editor editor={editor} containers={containers} />);
  const root = createRoot(referenceView);
  window.mountReference(props => root.render(<ReferenceBrowser {...props} />));
} else {
  const article = document.querySelector(".reference-standalone .reference-document");
  if (article) {
    const mount = document.createElement("div");
    mount.hidden = true;
    document.body.append(mount);
    createRoot(mount).render(<ArticleExamples article={article} />);
  }
}
