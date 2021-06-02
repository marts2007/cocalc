/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that shows rendered markdown.
//
// It also:
//
//    - [x] tracks and restores scroll position
//    - [x] is scrollable
//    - [x] is zoomable
//    - [x] math is properly typeset

import { Markdown } from "smc-webapp/r_misc";
import { is_different, path_split } from "smc-util/misc";
import { debounce } from "lodash";
import { React, ReactDOM, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";
import { EditorState } from "../frame-tree/types";
import { Actions } from "./actions";
import { Path } from "../frame-tree/path";

interface Props {
  actions: Actions;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  editor_state: EditorState;
  reload_images: boolean;
  is_current: boolean;
}

function should_memoize(prev, next): boolean {
  return !is_different(prev, next, [
    "id",
    "project_id",
    "path",
    "font_size",
    "read_only",
    "value",
    "reload_images",
    "is_current",
  ]);
}

export const RenderedMarkdown: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions,
    id,
    path,
    project_id,
    font_size,
    value,
    editor_state,
    reload_images,
    is_current,
  } = props;

  const scroll = React.useRef<HTMLDivElement>(null);

  const scaling = use_font_size_scaling(font_size);

  // once when mounted
  React.useEffect(() => {
    restore_scroll();
  }, []);

  function on_scroll(): void {
    const elt = ReactDOM.findDOMNode(scroll.current);
    if (elt == null) {
      return;
    }
    const scroll_val = $(elt).scrollTop();
    actions.save_editor_state(id, { scroll: scroll_val });
  }

  async function restore_scroll(): Promise<void> {
    const scroll_val = editor_state.get("scroll");
    const elt = $(ReactDOM.findDOMNode(scroll.current));
    try {
      if (elt.length === 0) {
        return;
      }
      await delay(0); // wait until render happens
      elt.scrollTop(scroll_val);
      await delay(0);
      elt.css("opacity", 1);

      // do any scrolling after image loads
      elt.find("img").on("load", function () {
        elt.scrollTop(scroll_val);
      });
    } finally {
      // for sure change opacity to 1 so visible after
      // doing whatever scrolling above
      elt.css("opacity", 1);
    }
  }

  function goto_source_line(event) {
    let elt = event.target;
    while (elt != null && elt.dataset?.sourceLine == null) {
      elt = elt.parentElement;
    }
    if (elt == null) return;
    const line = elt.dataset?.sourceLine;
    if (line != null) {
      actions.programmatical_goto_line(line);
      return;
    }
  }

  const style: CSS = {
    overflowY: "auto",
    width: "100%",
    opacity: 0, // changed to 1 after initial scroll to avoid flicker
  };
  const style_inner: CSS = {
    ...{
      padding: "40px 70px",
      backgroundColor: "white",
      overflowY: "auto",
    },
    ...{
      // transform: scale() and transformOrigin: "0 0" or "center 0"
      // doesn't work well. Changing the base font size is fine.
      fontSize: `${100 * scaling}%`,
    },
  };

  return (
    <div className="smc-vfill" style={{ backgroundColor: "#eee" }}>
      <Path is_current={is_current} path={path} project_id={project_id} />
      <div
        style={style}
        ref={scroll}
        onScroll={debounce(() => on_scroll(), 200)}
        /* this cocalc-editor-div class is needed for a safari hack only */
        className={"cocalc-editor-div smc-vfill"}
      >
        <div style={style_inner} className="smc-vfill">
          <Markdown
            line_numbers={true}
            onDoubleClick={goto_source_line}
            value={value}
            project_id={project_id}
            file_path={path_split(path).head}
            safeHTML={true}
            reload_images={reload_images}
            highlight_code={true}
          />
        </div>
      </div>
    </div>
  );
}, should_memoize);

RenderedMarkdown.displayName = "MarkdownEditor-RenderedMarkdown";
