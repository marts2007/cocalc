/*
Syncing the selection between slate and the DOM.

This started by factoring out the relevant code from editable.tsx.
We then rewrote it to work with react-window, which of course discards
the DOM outside the visible window, hence full sync no longer makes
sense -- instead the slate selection is the sole source of truth, and
the DOM just partly reflects that, and user manipulation of the DOM
merely influences slates state, rather than completely determining it.

I spent forever (!) trying various strategies involving locks and
timeouts, which could never work perfectly on many different
platforms. This simple algorithm evidently does, and involves *NO*
asynchronous code or locks at all!  Also, there are no platform
specific hacks at all.
*/

import { useCallback } from "react";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";
import { ReactEditor } from "..";
import { EDITOR_TO_ELEMENT, IS_FOCUSED } from "../utils/weak-maps";
import { Editor, Point, Range, Selection, Transforms } from "slate";
import { hasEditableTarget, isTargetInsideVoid } from "./dom-utils";
import { DOMElement } from "../utils/dom";

export const useUpdateDOMSelection = ({ editor, state }) => {
  // Ensure that the DOM selection state is set to the editor selection.
  // Note that whenever the DOM gets updated (e.g., with every keystroke when editing)
  // the DOM selection gets completely reset (because react replaces the selected text
  // by new text), so this setting of the selection usually happens, and happens
  // **a lot**.
  const updateDOMSelection = () => {
    if (state.isComposing || !ReactEditor.isFocused(editor)) {
      // console.log("useUpdateDOMSelection: early return");
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection) {
      return;
    }

    const selection = getWindowedSelection(editor);
    const hasDomSelection = domSelection.type !== "None";

    // If the DOM selection is properly unset, we're done.
    if (!selection && !hasDomSelection) {
      // console.log("useUpdateDOMSelection: no selection");
      return;
    }

    // verify that the DOM selection is in the editor
    const editorElement = EDITOR_TO_ELEMENT.get(editor);
    const hasDomSelectionInEditor =
      editorElement?.contains(domSelection.anchorNode) &&
      editorElement?.contains(domSelection.focusNode);

    if (!selection) {
      // need to clear selection
      if (hasDomSelectionInEditor) {
        // the current nontrivial selection is inside the editor,
        // so we just clear it.
        domSelection.removeAllRanges();
      }
      return;
    }
    let newDomRange;
    try {
      newDomRange = ReactEditor.toDOMRange(editor, selection);
    } catch (err) {
      // This error happens e.g., if you set the selection to a
      // point that isn't valid in the document.  TODO: Our
      // autoformat code perhaps stupidly does this sometimes,
      // at least when working on it.
      // It's better to just give up in this case, rather than
      // crash the entire cocalc.  The user will click somewhere
      // and be good to go again.
      return;
    }

    // Flip orientation of newDomRange if selection is backward,
    // since setBaseAndExtent (which we use below) is not oriented.
    if (Range.isBackward(selection)) {
      newDomRange = {
        endContainer: newDomRange.startContainer,
        endOffset: newDomRange.startOffset,
        startContainer: newDomRange.endContainer,
        startOffset: newDomRange.endOffset,
      };
    }

    // Compare the new DOM range we want to what's actually
    // selected.  If they are the same, done.  If different,
    // we change the selection in the DOM.
    if (
      domSelection.anchorNode?.isSameNode(newDomRange.startContainer) &&
      domSelection.focusNode?.isSameNode(newDomRange.endContainer) &&
      domSelection.anchorOffset === newDomRange.startOffset &&
      domSelection.focusOffset === newDomRange.endOffset
    ) {
      // It's correct already -- we're done.
      // console.log("useUpdateDOMSelection: selection already correct");
      return;
    }

    // Finally, make the change:
    domSelection.setBaseAndExtent(
      newDomRange.startContainer,
      newDomRange.startOffset,
      newDomRange.endContainer,
      newDomRange.endOffset
    );
  };

  // Always ensure DOM selection gets set to slate selection
  // right after the editor updates.  This is especially important
  // because the react update sets parts of the contenteditable
  // area, and can easily mess up or reset the cursor, so we have
  // to immediately set it back.
  useIsomorphicLayoutEffect(updateDOMSelection);

  // We also return this function, so can be called on scroll,
  // which is needed to support windowing.
  return updateDOMSelection;
};

export const useDOMSelectionChange = ({
  editor,
  state,
  readOnly,
}: {
  editor: ReactEditor;
  state: {
    isComposing: boolean;
    shiftKey: boolean;
    latestElement: DOMElement | null;
  };
  readOnly: boolean;
}) => {
  // Listen on the native `selectionchange` event to be able to update any time
  // the selection changes. This is required because React's `onSelect` is leaky
  // and non-standard so it doesn't fire until after a selection has been
  // released. This causes issues in situations where another change happens
  // while a selection is being dragged.

  const onDOMSelectionChange = useCallback(() => {
    if (readOnly || state.isComposing) {
      return;
    }

    const { activeElement } = window.document;
    const el = ReactEditor.toDOMNode(editor, editor);
    if (activeElement === el) {
      state.latestElement = activeElement;
      IS_FOCUSED.set(editor, true);
    } else {
      IS_FOCUSED.delete(editor);
    }

    const domSelection = window.getSelection();
    if (!domSelection) {
      Transforms.deselect(editor);
      return;
    }
    const { anchorNode, focusNode } = domSelection;

    if (!isSelectable(editor, anchorNode) || !isSelectable(editor, focusNode)) {
      return;
    }

    let range;
    try {
      range = ReactEditor.toSlateRange(editor, domSelection);
    } catch (_err) {
      // isSelectable should catch any situation where the above might cause an
      // error, but in practice it doesn't.  Just ignore selection change when this
      // happens.
      return;
    }
    const { selection } = editor;
    if (selection != null) {
      const info = editor.windowedListRef?.current?.render_info;
      if (info != null) {
        // Trickier case due to windowing.  We check if the DOM selection
        // changed due to the windowing system removing rows from the DOM.
        // In such cases, we end up with the DOM selection going outside
        // the visible range (it's in the part that is rendered but not
        // visible), so in that case, we just extend that side of the
        // DOM selection to where it was before.
        if (range.anchor.path[0] < info.visibleStartIndex) {
          range.anchor = selection.anchor;
        }
        if (range.focus.path[0] < info.visibleStartIndex) {
          range.focus = selection.focus;
        }
        if (range.anchor.path[0] > info.visibleStopIndex) {
          range.anchor = selection.anchor;
        }
        if (range.focus.path[0] > info.visibleStopIndex) {
          range.focus = selection.focus;
        }

        // Check if user is shift+clicking to select a range.
        // This is needed if you select a single point, then
        // scroll way down (so the point you selected is removed
        // from the DOM), then shift+click.  In the meantime,
        // as you scrolled down, the original selection gets
        // removed from the DOM, at least on some browsers (Safari
        // but not Chrome as of March 2021).  Fortunately, this
        // simple code below seems to takes care of all cases, and
        // doesn't break things even if the selection didn't get
        // removed, since the behavior is the same.
        if (state.shiftKey) {
          // What *should* actually happen on shift+click to extend a
          // selection is not so obvious!  For starters, the behavior
          // in text editors like CodeMirror, VSCode and Ace Editor
          // (set range.anchor to selection.anchor) is totally different
          // than rich editors like Word, Pages, and browser
          // contenteditable, which mostly *extend* the selection in
          // various ways.  We match exactly what default browser
          // selection does, since otherwise we would have to *change*
          // that when not using windowing or when everything is in
          // the visible window, which seems silly.
          const edges = Range.edges(selection);
          if (Point.isBefore(range.focus, edges[0])) {
            // Shift+click before the entire existing selection:
            range.anchor = edges[1];
          } else if (Point.isAfter(range.focus, edges[1])) {
            // Shift+click after the entire existing selection:
            range.anchor = edges[0];
          } else {
            // Shift+click inside the existing selection.  What browsers
            // do is they shrink selection so the new focus is
            // range.focus, and the new anchor is whichever of
            // selection.focus or selection.anchor makes the resulting
            // selection "longer".
            const a = Editor.string(
              editor,
              { focus: range.focus, anchor: selection.anchor },
              { voids: true }
            ).length;
            const b = Editor.string(
              editor,
              { focus: range.focus, anchor: selection.focus },
              { voids: true }
            ).length;
            range.anchor = a > b ? selection.anchor : selection.focus;
          }
        }
      }
    }

    if (selection == null || !Range.equals(selection, range)) {
      Transforms.select(editor, range);
    }
  }, [readOnly]);

  // Attach a native DOM event handler for `selectionchange`, because React's
  // built-in `onSelect` handler doesn't fire for all selection changes. It's a
  // leaky polyfill that only fires on keypresses or clicks. Instead, we want to
  // fire for any change to the selection inside the editor. (2019/11/04)
  // https://github.com/facebook/react/issues/5785
  useIsomorphicLayoutEffect(() => {
    window.document.addEventListener("selectionchange", onDOMSelectionChange);
    return () => {
      window.document.removeEventListener(
        "selectionchange",
        onDOMSelectionChange
      );
    };
  }, [onDOMSelectionChange]);

  return onDOMSelectionChange;
};

export function getWindowedSelection(editor: ReactEditor): Selection | null {
  const { selection } = editor;
  if (
    selection == null ||
    editor.windowedListRef?.current == null ||
    Range.isCollapsed(selection)
  ) {
    // No selection, or not using windowing, or collapsed so easy.
    return selection;
  }

  // Now we trim non-collapsed selection to part of window in the DOM.
  const info = editor.windowedListRef.current.render_info;
  if (info == null) return selection;
  // console.log(JSON.stringify({selection,info,}));
  const { anchor, focus } = selection;
  return { anchor: clipPoint(anchor, info), focus: clipPoint(focus, info) };
}

function clipPoint(point: Point, info): Point {
  const { overscanStartIndex, overscanStopIndex } = info;
  const n = point.path[0];
  if (n < overscanStartIndex) {
    return { path: [overscanStartIndex], offset: 0 };
  }
  if (n > overscanStopIndex) {
    return { path: [overscanStopIndex], offset: 0 };
  }
  return point;
}

function isSelectable(editor, node): boolean {
  return hasEditableTarget(editor, node) || isTargetInsideVoid(editor, node);
}
