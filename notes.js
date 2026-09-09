// Tiptap-powered rich text notes — loaded as an ES module, exposes a small
// bridge (window.TiptapNotes) so the classic app.js script can drive it.
import { Editor } from "https://esm.sh/@tiptap/core@3.31.3";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@3.31.3?deps=@tiptap/core@3.31.3";
import Placeholder from "https://esm.sh/@tiptap/extension-placeholder@3.31.3?deps=@tiptap/core@3.31.3";
import Image from "https://esm.sh/@tiptap/extension-image@3.31.3?deps=@tiptap/core@3.31.3";
import TaskList from "https://esm.sh/@tiptap/extension-task-list@3.31.3?deps=@tiptap/core@3.31.3";
import TaskItem from "https://esm.sh/@tiptap/extension-task-item@3.31.3?deps=@tiptap/core@3.31.3";
import TextAlign from "https://esm.sh/@tiptap/extension-text-align@3.31.3?deps=@tiptap/core@3.31.3";

const instances = new Map(); // container element -> Editor instance

/** Turns a pasted/dropped/picked image into an uploaded URL, inserted at the current selection. */
async function insertImageBlob(editor, blob) {
  if (!window.CloudSync) throw new Error("Sign-in isn't ready yet.");
  const url = await window.CloudSync.uploadImage(blob);
  editor.chain().focus().setImage({ src: url }).run();
}

function mount(container, initialHTML, onChange) {
  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
      }),
      Placeholder.configure({ placeholder: "Write a note..." }),
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: initialHTML || "",
    autofocus: "end",
    editorProps: {
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files || []).filter(f => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(file => {
          insertImageBlob(editor, file).catch(err => {
            window.dispatchEvent(new CustomEvent("tiptap-image-error", { detail: { error: err, container } }));
          });
        });
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        files.forEach(file => {
          insertImageBlob(editor, file).catch(err => {
            window.dispatchEvent(new CustomEvent("tiptap-image-error", { detail: { error: err, container } }));
          });
        });
        return true;
      },
    },
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

function run(container, cmd, arg) {
  const editor = instances.get(container);
  if (!editor) return;
  const chain = editor.chain().focus();
  if (cmd === "bold") chain.toggleBold().run();
  else if (cmd === "italic") chain.toggleItalic().run();
  else if (cmd === "underline") chain.toggleUnderline().run();
  else if (cmd === "strike") chain.toggleStrike().run();
  else if (cmd === "code") chain.toggleCode().run();
  else if (cmd === "bulletList") chain.toggleBulletList().run();
  else if (cmd === "orderedList") chain.toggleOrderedList().run();
  else if (cmd === "taskList") chain.toggleTaskList().run();
  else if (cmd === "paragraph") chain.setParagraph().run();
  else if (cmd === "heading1") chain.toggleHeading({ level: 1 }).run();
  else if (cmd === "heading2") chain.toggleHeading({ level: 2 }).run();
  else if (cmd === "heading3") chain.toggleHeading({ level: 3 }).run();
  else if (cmd === "align-left") chain.setTextAlign("left").run();
  else if (cmd === "align-center") chain.setTextAlign("center").run();
  else if (cmd === "align-right") chain.setTextAlign("right").run();
  else if (cmd === "blockquote") chain.toggleBlockquote().run();
  else if (cmd === "horizontalRule") chain.setHorizontalRule().run();
  else if (cmd === "clear") chain.clearNodes().unsetAllMarks().run();
  else if (cmd === "link") {
    if (arg) chain.extendMarkRange("link").setLink({ href: arg }).run();
    else chain.extendMarkRange("link").unsetLink().run();
  }
}

function insertImageFile(container, file) {
  const editor = instances.get(container);
  if (!editor) return Promise.reject(new Error("Editor not ready."));
  return insertImageBlob(editor, file);
}

function isActive(container, cmd) {
  const editor = instances.get(container);
  if (!editor) return false;
  if (cmd === "heading1") return editor.isActive("heading", { level: 1 });
  if (cmd === "heading2") return editor.isActive("heading", { level: 2 });
  if (cmd === "heading3") return editor.isActive("heading", { level: 3 });
  if (cmd === "paragraph") return editor.isActive("paragraph") && !editor.isActive("heading");
  if (cmd === "align-left") return editor.isActive({ textAlign: "left" });
  if (cmd === "align-center") return editor.isActive({ textAlign: "center" });
  if (cmd === "align-right") return editor.isActive({ textAlign: "right" });
  return editor.isActive(cmd);
}

function getLinkHref(container) {
  const editor = instances.get(container);
  return editor ? (editor.getAttributes("link").href || "") : "";
}

window.TiptapNotes = { mount, destroy, run, isActive, insertImageFile, getLinkHref };
window.dispatchEvent(new Event("tiptap-ready"));
