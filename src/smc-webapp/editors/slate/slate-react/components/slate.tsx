import * as React from "react";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Descendant } from "slate";

import { ReactEditor } from "../plugin/react-editor";
import { FocusedContext } from "../hooks/use-focused";
import { EditorContext } from "../hooks/use-slate-static";
import { SlateContext } from "../hooks/use-slate";
import { EDITOR_TO_ON_CHANGE } from "../utils/weak-maps";

/**
 * A wrapper around the provider to handle `onChange` events, because the editor
 * is a mutable singleton so it won't ever register as "changed" otherwise.
 */

export const Slate = (props: {
  editor: ReactEditor;
  value: Descendant[];
  children: React.ReactNode;
  onChange: (value: Descendant[]) => void;
}) => {
  const { editor, children, onChange, value, ...rest } = props;
  const [ticks, setTick] = useState(0);
  const context: [ReactEditor] = useMemo(() => {
    editor.children = value;
    editor.ticks = ticks;
    Object.assign(editor, rest);
    return [editor];
  }, [ticks, value, ...Object.values(rest)]);

  const onContextChange = useCallback(() => {
    onChange(editor.children);
    setTick(ticks + 1);
  }, [ticks, onChange]);

  EDITOR_TO_ON_CHANGE.set(editor, onContextChange);

  useEffect(() => {
    return () => {
      EDITOR_TO_ON_CHANGE.set(editor, () => {});
    };
  }, []);

  return (
    <SlateContext.Provider value={context}>
      <EditorContext.Provider value={editor}>
        <FocusedContext.Provider value={ReactEditor.isFocused(editor)}>
          {children}
        </FocusedContext.Provider>
      </EditorContext.Provider>
    </SlateContext.Provider>
  );
};
