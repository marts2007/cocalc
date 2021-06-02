/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
What happens when you hit the backspace/delete key.

  - deleting (certain?) void elements. See
     https://github.com/ianstormtaylor/slate/issues/3875
    for discussion of why we must implement this ourselves.
*/

import { Editor, Path, Point, Range, Text, Transforms } from "slate";
import { register } from "./register";
import { getNodeAt } from "../slate-util";

function backspaceKey({ editor }) {
  if (editor.selection == null || !Range.isCollapsed(editor.selection)) {
    selectionHack(editor);
    return false;
  }

  // In slatejs you can't delete various block elements at the beginning of the
  // document. This is yet another **BUG IN SLATE**, which we workaround by
  // inserting an empty node at the beginning of the document.  This does not
  // seem to be reported upstream, and I'm not even bothering since there's
  // so many bugs like this we have to workaround.   Morever, if this bug is
  // fixed upstream, it breaks our workaround!  Sigh.
  if (isAtStart(editor.selection.focus)) {
    editor.apply({
      type: "insert_node",
      path: [0],
      node: { type: "paragraph", children: [{ text: "" }] },
    });
    Transforms.delete(editor, {
      reverse: true,
    });
  }

  // This seems to work perfectly in all cases, including working around the
  // void delete bug in Slate:
  //     https://github.com/ianstormtaylor/slate/issues/3875
  // IMPORTANT: this editor.deleteBackward() is implemented in
  // format/delete-backward.ts and is quite complicated!
  editor.deleteBackward();
  return true;
}

register({ key: "Backspace" }, backspaceKey);

function deleteKey({ editor }) {
  if (editor.selection == null) return true;
  if (!Range.isCollapsed(editor.selection)) {
    selectionHack(editor);
    // deleteForward does nothing for non collapsed
    Transforms.delete(editor);
    return true;
  }
  editor.deleteForward();
  return true;
}

register({ key: "Delete" }, deleteKey);

function isAtStart(loc: Point): boolean {
  for (const n of loc.path) {
    if (n != 0) return false;
  }
  return loc.offset == 0;
}

// This is a hack to workaround this bug:
//    https://github.com/ianstormtaylor/slate/issues/4121
// which is in the core of slate. Call this before
// deleting the selection to ensure that the wrong thing
// isn't deleted...
function selectionHack(editor: Editor): void {
  const { selection } = editor;
  if (selection == null || Range.isCollapsed(selection)) return;
  const edges = Range.edges(selection);
  const node = getNodeAt(editor, edges[1].path);
  if (!Text.isText(node)) return;
  if (node.text.length != edges[1].offset) return;

  // OK, so at this point, we're in exactly the situation
  // of issue 4121.  In particular, the
  // selection ends at the edge of a text node.
  // Our hack is to move the cursor to the beginning of
  // the *next* node, but make the offset 0,
  // so that when we delete nothing is removed
  // from there.
  const path = Path.next(edges[1].path);
  const nextNode = getNodeAt(editor, path);
  if (Text.isText(nextNode)) {
    // NOTE: it doesn't matter if we reverse the range here, since
    // we're about to delete this selection.
    const newSelection = {
      anchor: edges[0],
      focus: { path, offset: 0 },
    };
    Transforms.setSelection(editor, newSelection);
  }
}
