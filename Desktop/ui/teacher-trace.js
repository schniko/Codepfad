import { mapInlineScripts } from "./editor-preview.js";

function collectBindingNames(pattern, names) {
  switch (pattern.type) {
    case "Identifier": names.add(pattern.name); break;
    case "RestElement": collectBindingNames(pattern.argument, names); break;
    case "AssignmentPattern": collectBindingNames(pattern.left, names); break;
    case "ArrayPattern":
      for (const element of pattern.elements) if (element) collectBindingNames(element, names);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties) collectBindingNames(property.value ?? property, names);
      break;
  }
}

function declarations(statements, names = new Set()) {
  for (const statement of statements) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) collectBindingNames(declaration.id, names);
  }
  return names;
}

function collectFunctionVariables(statements, names) {
  for (const node of statements) {
    if (node.type === "VariableDeclaration" && node.kind === "var") declarations([node], names);
    if (node.type === "BlockStatement") collectFunctionVariables(node.body, names);
    if (node.type === "IfStatement") {
      collectFunctionVariables([node.consequent], names);
      if (node.alternate) collectFunctionVariables([node.alternate], names);
    }
  }
}

function traceLikeCounter(source, parse, handlerNames, lineOffset) {
  const { body } = parse(source, { ecmaVersion: "latest", locations: true });
  const handlers = body.filter(node => node.type === "FunctionDeclaration" && handlerNames.has(node.id.name));
  for (const name of handlerNames) {
    const matches = handlers.filter(handler => handler.id.name === name);
    const [handler] = matches;
    if (matches.length !== 1 || handler.async || handler.generator) {
      throw new Error(`Der Knopf braucht genau eine Funktion mit dem Kopf function ${name}().`);
    }
  }

  let trace = "__codepfadTrace";
  while (source.includes(trace)) trace += "_";
  const text = node => source.slice(node.start, node.end);
  const readers = names => `[${[...names].map(name => `[${JSON.stringify(name)}, () => ${name}]`).join(",")}]`;
  const line = node => lineOffset + node.loc.start.line;
  function block(statements, names, endLine) {
    const steps = statements.map(node => statement(node, names));
    if (endLine !== undefined) steps.push(`yield ${trace}.point(${endLine}, ${readers(names)});`);
    return `{\n${steps.join("\n")}\n}`;
  }

  function branch(node, names) {
    return node.type === "BlockStatement" ? statement(node, names) : `{\n${statement(node, names)}\n}`;
  }

  function statement(node, names) {
    switch (node.type) {
      case "VariableDeclaration":
      case "ExpressionStatement":
        return `${text(node)}\n;yield ${trace}.point(${line(node)}, ${readers(names)});`;
      case "IfStatement": {
        const test = `yield* ${trace}.value((${text(node.test)}), ${line(node)}, ${readers(names)})`;
        const otherwise = node.alternate ? ` else ${branch(node.alternate, names)}` : "";
        return `if (${test}) ${branch(node.consequent, names)}${otherwise}`;
      }
      case "BlockStatement":
        return block(node.body, declarations(node.body, new Set(names)));
      case "ReturnStatement":
        return `return yield* ${trace}.value((${node.argument ? text(node.argument) : "void 0"}), ${line(node)}, ${readers(names)});`;
      case "EmptyStatement":
        return ";";
      default:
        throw new Error(`Zeile ${line(node)} kann in dieser Vorführung nicht schrittweise ausgeführt werden. Verwende Anweisungen, if/else und return in der aufgerufenen Funktion.`);
    }
  }

  // Ordinary calls to the learner's functions keep their normal JavaScript behavior.
  const callbacks = handlers.map(handler => {
    const name = handler.id.name;
    const localNames = declarations(handler.body.body);
    for (const parameter of handler.params) collectBindingNames(parameter, localNames);
    collectFunctionVariables(handler.body.body, localNames);
    const parameters = source.slice(handler.id.end, handler.body.start);
    const handlerBody = block(handler.body.body, localNames, lineOffset + handler.body.loc.end.line);
    return `{ name: ${JSON.stringify(name)}, entryLine: ${line(handler)}, localNames: ${JSON.stringify([...localNames])}, run: function*${parameters}${handlerBody} }`;
  });
  const code = `(function (${trace}) {\n"use strict";\n${source}\nreturn { handlers: [${callbacks.join(",")}], globals: () => ${readers(declarations(body))} };\n})`;
  try { parse(code, { ecmaVersion: "latest" }); }
  catch { throw new Error("Dieser Code kann im Zeilenmodus nicht ausgeführt werden. Prüfe die Anweisungen in den Funktionen."); }
  return code;
}

export function prepareLikeCounter(source, parse) {
  const scripts = [];
  const template = document.createElement("template");
  template.innerHTML = mapInlineScripts(source, (code, start) => {
    scripts.push({ code, start });
    return "";
  });
  for (const script of template.content.querySelectorAll("script")) script.remove();

  const handlerNames = new Set();
  for (const button of template.content.querySelectorAll("button[onclick]")) {
    const handler = button.getAttribute("onclick").match(/^\s*([$_\p{ID_Start}][$_\p{ID_Continue}]*)\s*\(\s*\)\s*;?\s*$/u);
    if (!handler) continue;
    const [, name] = handler;
    handlerNames.add(name);
    button.removeAttribute("onclick");
    button.dataset.codepfadTraceButton = name;
    button.toggleAttribute("data-codepfad-trace-disabled", button.disabled);
    button.disabled = true;
  }
  const html = template.innerHTML;
  if (scripts.length !== 1) return { html, message: "Für den Zeilenmodus braucht der HTML-Code genau einen <script>-Block." };
  if (!handlerNames.size) return { html, message: 'Verbinde den Knopf mit einer Funktion, zum Beispiel mit onclick="liken()".' };

  const [{ code, start }] = scripts;
  const lineOffset = source.slice(0, start).split(/\r\n?|\n/).length - 1;
  try {
    return { html, program: traceLikeCounter(code, parse, handlerNames, lineOffset) };
  } catch (error) {
    const message = error.loc ? `JavaScript-Fehler in Zeile ${lineOffset + error.loc.line}: ${error.message}` : error.message;
    return { html, message };
  }
}

// Serialized into the sandboxed preview. Keep its dependencies inside the function.
function runLikeCounter(createProgram, session) {
  if (!createProgram) return;
  const buttons = [...document.querySelectorAll("button[data-codepfad-trace-button]")];
  const emit = (event, payload) => parent.postMessage({ type: "codepfad-likes", session, event, ...payload }, "*");
  let program;
  let currentHandler;
  let pendingHandler;
  let iterator;

  function formatValue(value) {
    if (value instanceof Element) return value.outerHTML.slice(0, 500);
    if (value && typeof value === "object") {
      try { return (JSON.stringify(value) ?? String(value)).slice(0, 500); }
      catch { return String(value).slice(0, 500); }
    }
    return String(value).slice(0, 500);
  }

  function snapshot(readers, scope) {
    return readers.map(([name, read]) => {
      let value = null;
      try { value = formatValue(read()); } catch { /* Binding may be uninitialized. */ }
      return { name, scope, value };
    });
  }

  function variables(locals = []) {
    return [...snapshot(program.globals(), "global"), ...locals];
  }

  function point(line, locals) {
    return { line, variables: variables(snapshot(locals, "local")) };
  }

  function inactiveLocals() {
    return currentHandler.localNames.map(name => ({ name, scope: "local", value: null }));
  }

  function disableButtons(busy) {
    for (const button of buttons) button.disabled = busy || button.hasAttribute("data-codepfad-trace-disabled");
  }

  function showFrame(frame) {
    emit("frame", { handlerName: currentHandler.name, ...frame });
  }

  function idle() {
    disableButtons(false);
    showFrame({ variables: variables(inactiveLocals()) });
  }

  function report(error) {
    iterator = null;
    pendingHandler = null;
    disableButtons(!program);
    emit("error", { message: error.message || String(error) });
  }

  console.log = (...values) => emit("log", { text: values.map(formatValue).join(" ") });
  try {
    program = createProgram({
      point,
      *value(value, line, locals) {
        yield point(line, locals);
        return value;
      },
    });
    currentHandler = program.handlers[0];
    idle();
  } catch (error) {
    report(error);
    return;
  }

  const handlers = new Map(program.handlers.map(handler => [handler.name, handler]));
  for (const button of buttons) {
    const handler = handlers.get(button.dataset.codepfadTraceButton);
    if (!handler) continue;
    button.addEventListener("click", event => {
      event.preventDefault();
      if (button.disabled) return;
      pendingHandler = handler;
      disableButtons(true);
      emit("click");
    });
  }

  window.addEventListener("message", event => {
    const { session: target, command } = event.data || {};
    if (event.source !== parent || target !== session) return;
    try {
      if (command === "start" || command === "run") {
        if (iterator || !pendingHandler) return;
        currentHandler = pendingHandler;
        pendingHandler = null;
        const { run } = currentHandler;
        iterator = run();
        if (command === "start") {
          showFrame({ line: currentHandler.entryLine, variables: variables(inactiveLocals()) });
          return;
        }
      }
      if (!iterator) return;
      let result = iterator.next();
      if (command === "run" || command === "finish") {
        while (!result.done) result = iterator.next();
      }
      if (result.done) {
        iterator = null;
        idle();
      } else {
        showFrame(result.value);
      }
    } catch (error) {
      report(error);
    }
  });
}

export function likeCounterPreview({ html, program }, session) {
  const script = `(${runLikeCounter.toString()})(${program ?? "null"}, ${JSON.stringify(session)});`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${session}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <style>
      body { margin: 0; padding: 18px; display: grid; min-height: 85px; place-items: center; text-align: center; background: #fff4f5; color: #663149; font: 16px system-ui, sans-serif; }
      h2 { margin: 0 0 10px; font-size: 1.1rem; }
      button { padding: 8px 22px; border: 0; border-radius: 8px; color: #fff; background: #9c3c6b; font: 650 1rem system-ui, sans-serif; cursor: pointer; }
      button:disabled { opacity: .55; cursor: default; }
      #anzeige:empty { display: none; }
      #anzeige { margin: 8px 0 0; }
    </style></head><body><main>${html}</main>
    <script nonce="${session}">${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
