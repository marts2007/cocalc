/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  useEffect,
  useFrameContext,
  useMemo,
  useState,
} from "smc-webapp/app-framework";
import { macros } from "smc-webapp/jquery-plugins/math-katex";
import { renderToString } from "katex";
import { startswith } from "smc-util/misc";
import { SlateCodeMirror } from "./codemirror";
import * as LRU from "lru-cache";
import { useFocused, useSelected } from "../slate-react";
import { useCollapsed } from "../elements/register";
import { FOCUSED_COLOR } from "../util";

const cache = new LRU({ max: 300 });

interface Props {
  value: string;
  isInline: boolean;
  onChange?: (string) => void;
}

export const SlateMath: React.FC<Props> = React.memo(
  ({ value, onChange, isInline }) => {
    const [editMode, setEditMode] = useState<boolean>(false);
    const frameContext = useFrameContext();

    const { err, __html } = useMemo(() => mathToHtml(value, isInline), [value]);

    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();

    useEffect(() => {
      if (focused && selected && collapsed) {
        setEditMode(true);
      }
    }, [selected, focused, collapsed]);

    function renderEditMode() {
      if (!editMode) return;
      return (
        <SlateCodeMirror
          value={value}
          onChange={(value) => {
            onChange?.(value.trim().replace(/^\s*[\r\n]/gm, ""));
          }}
          onBlur={() => setEditMode(false)}
          info="tex"
          options={{
            lineWrapping: true,
            autofocus: true,
          }}
          isInline={true}
        />
      );
    }

    function renderLaTeX() {
      return (
        <span
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // switch to edit mode when you click on it.
            setEditMode?.(true);
            frameContext.actions.set_active_id(frameContext.id);
          }}
        >
          {err ? (
            <span
              style={{
                backgroundColor: "#fff2f0",
                border: "1px solid #ffccc7",
                padding: "5px 10px",
              }}
            >
              {err}
            </span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html }}></span>
          )}
        </span>
      );
    }

    return (
      <span
        contentEditable={false}
        style={
          editMode
            ? {
                display: "block",
                padding: "10px",
                cursor: "pointer",
                border: "1px solid lightgrey",
                boxShadow: "8px 8px 4px #888",
                borderRadius: "5px",
                margin: "5px 10%",
              }
            : {
                display: startswith(value, "$$") ? "block" : "inline",
                cursor: "pointer",
                border:
                  focused && selected
                    ? `1px solid ${FOCUSED_COLOR}`
                    : undefined,
              }
        }
      >
        {renderEditMode()}
        {renderLaTeX()}
      </span>
    );
  }
);

function mathToHtml(
  math: string, // latex expression
  isInline: boolean
): { __html: string; err?: string } {
  const key = `${isInline}` + math;
  let { html, err } = (cache.get(key) ?? {}) as any;
  if (html != null) {
    return { __html: html ?? "", err };
  }
  if (!math.trim()) {
    // don't let it be empty since then it is not possible to see/select.
    math = "\\LaTeX";
  }
  try {
    html = renderToString(math, {
      displayMode: !isInline,
      macros,
    });
  } catch (error) {
    err = error.toString();
  }
  cache.set(key, { html, err });
  return { __html: html ?? "", err };
}
