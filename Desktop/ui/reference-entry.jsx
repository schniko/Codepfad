import { createRoot } from "react-dom/client";
import { ArticleExamples, ReferenceBrowser } from "./ReferenceBrowser.jsx";
import { Editor } from "./Editor.jsx";
import { isValidCss } from "./editor-code.js";
import { createEditor } from "./editor-state.js";

const referenceView = document.querySelector("#reference-view");
if (referenceView) {
  const editor = window.mountEditor(createEditor, isValidCss);
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
