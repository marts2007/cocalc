/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { useFocused, useSelected } from "../slate-react";

import {
  ReactDOM,
  useEffect,
  useFrameContext,
  useRef,
  useActions as useReduxActions,
} from "smc-webapp/app-framework";
import { Range } from "slate";
import { path_split } from "smc-util/misc";
import { Actions } from "smc-webapp/frame-editors/markdown-editor/actions";
import {
  useSlate as useSlate0,
  useSlateStatic as useSlateStatic0,
} from "../slate-react";
import { SlateEditor } from "../editable-markdown";

// Exactly like the normal useSlate hook, except return type is
// SlateEditor, which we know since we're only using this in CoCalc
// where we only use our enhanced type.
export const useSlate = () => {
  return useSlate0() as SlateEditor;
};

export const useSlateStatic = () => {
  return useSlateStatic0() as SlateEditor;
};

// Whether or not the current selection exists and is collapsed (i.e., not
// a range).
export const useCollapsed = () => {
  const editor = useSlate();
  return editor.selection != null && Range.isCollapsed(editor.selection);
};

export const useProcessLinks = (deps?) => {
  // TODO: implementation is very ugly!
  const ref = useRef<any>(null);
  const { project_id, path } = useFrameContext();
  useEffect(() => {
    if (ref.current == null) return;
    const elt = $(ReactDOM.findDOMNode(ref.current));
    require("smc-webapp/process-links"); // ensure loaded
    (elt as any).process_smc_links({
      project_id,
      file_path: path_split(path).head, // TODO: inefficient to compute this every time.
    });
  }, deps);
  return ref;
};

// The actions for the ambient markdown editor; we just hang this
// on the useSlate context.  The right way is to write our own
// context-based useActions hook of course, which would be useful
// all over the place!
export function useActions(): Actions {
  const { project_id, path } = useFrameContext();
  return useReduxActions(project_id, path);
}
