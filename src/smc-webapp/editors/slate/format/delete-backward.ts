/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Range, Editor, Element, Path, Point, Text, Transforms } from "slate";

export const withDeleteBackward = (editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    if (!customDeleteBackwards(editor)) {
      // no custom handling, so just do the default:
      deleteBackward(...args);
    }
  };

  return editor;
};

function customDeleteBackwards(editor: Editor): boolean | undefined {
  // Figure out first if we should so something special:
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) return;

  const above = Editor.above(editor, {
    match: (node) => Editor.isBlock(editor, node) && node.type != "paragraph",
  });
  if (above == null) return;
  const [block, path] = above;
  if (Editor.isEditor(block) || !Element.isElement(block)) {
    return;
  }
  const start = Editor.start(editor, path);
  if (!Point.equals(selection.anchor, start)) return;

  // This is where we actually might do something special, finally.
  // Cursor is at the beginning of a non-paragraph block-level
  // element, so maybe do something special.
  switch (block.type) {
    case "heading":
      deleteBackwardsHeading(editor, block, path);
      return true;
  }
}

// Special handling at beginning of heading.
function deleteBackwardsHeading(editor: Editor, block: Element, path: Path) {
  if (Text.isText(block.children[0])) {
    Transforms.setNodes(
      editor,
      {
        type: "paragraph",
      },
      { at: path }
    );
  } else {
    Transforms.unwrapNodes(editor, {
      match: (node) => Element.isElement(node),
      split: true,
      mode: "lowest",
      at: path,
    });
  }
}
