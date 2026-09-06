// Tiptap-powered rich text notes — loaded as an ES module, exposes a small
// bridge (window.TiptapNotes) so the classic app.js script can drive it.
import { Editor } from "https://esm.sh/@tiptap/core@3.31.3";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@3.31.3?deps=@tiptap/core@3.31.3";
import Placeholder from "https://esm.sh/@tiptap/extension-placeholder@3.31.3?deps=@tiptap/core@3.31.3";

const instances = new Map(); // container element -> Editor instance

function mount(container, initialHTML, onChange) {
  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: "Write a note…" }),
    ],
    content: initialHTML || "",
    autofocus: "end",
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getText());
    },
    onTransaction() {
      if (typeof container._toolbarUpdate === "function") container._toolbarUpdate();
    },
  });
  instances.set(container, editor);
  if (typeof container._toolbarUpdate === "function") container._toolbarUpdate();
  return editor;
}

function destroy(container) {
  const editor = instances.get(container);
  if (editor) {
    editor.destroy();
    instances.delete(container);
  }
}

function run(container, cmd) {
  const editor = instances.get(container);
  if (!editor) return;
  const chain = editor.chain().focus();
  if (cmd === "bold") chain.toggleBold().run();
  else if (cmd === "italic") chain.toggleItalic().run();
  else if (cmd === "strike") chain.toggleStrike().run();
  else if (cmd === "bulletList") chain.toggleBulletList().run();
  else if (cmd === "orderedList") chain.toggleOrderedList().run();
  else if (cmd === "blockquote") chain.toggleBlockquote().run();
  else if (cmd === "clear") chain.clearNodes().unsetAllMarks().run();
}

function isActive(container, cmd) {
  const editor = instances.get(container);
  return editor ? editor.isActive(cmd) : false;
}

window.TiptapNotes = { mount, destroy, run, isActive };
window.dispatchEvent(new Event("tiptap-ready"));
