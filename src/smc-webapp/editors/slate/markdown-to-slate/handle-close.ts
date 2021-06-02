/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant } from "slate";
import { State } from "./types";
import { getMarkdownToSlate } from "../elements";
import { register } from "./register";
import { parse } from "./parse";

function handleClose({ token, state, cache }) {
  if (!state.close_type) return;
  if (state.contents == null) {
    throw Error("bug -- state.contents must not be null");
  }

  // Currently collecting the contents to parse when we hit the close_type.
  if (token.type == state.open_type) {
    // Hitting same open type *again* (its nested), so increase nesting.
    state.nesting += 1;
  }

  if (token.type === state.close_type) {
    // Hit the close_type
    if (state.nesting > 0) {
      // We're nested, so just go back one.
      state.nesting -= 1;
    } else {
      // Not nested, so done: parse the accumulated array of children
      // using a new state:
      const child_state: State = { marks: state.marks, nesting: 0 };
      const children: Descendant[] = [];
      let isEmpty = true;
      // Note a RULE: "Block nodes can only contain other blocks, or inline and text nodes."
      // See https://docs.slatejs.org/concepts/10-normalizing
      // This means that all children nodes here have to be either *inline/text* or they
      // all have to be blocks themselves -- no mixing.  Our markdown parser I think also
      // does this, except for one weird special case which involves hidden:true that is
      // used for tight lists.

      state.tight = false;
      let markdown = "";
      for (const token2 of state.contents) {
        for (const node of parse(token2, child_state, cache)) {
          if (child_state.tight) {
            state.tight = true;
          }
          isEmpty = false;
          children.push(node);
        }
        markdown += child_state.markdown ?? "";
      }
      if (isEmpty) {
        // it is illegal for the children to be empty.
        children.push({ text: "" });
      }
      const i = state.close_type.lastIndexOf("_");
      const type = state.close_type.slice(0, i);
      delete state.close_type;
      delete state.contents;

      const markdownToSlate = getMarkdownToSlate(type);
      const node = markdownToSlate({
        type,
        token,
        children,
        state,
        isEmpty,
        markdown,
        cache,
      });
      if (type == "bullet_list" || type == "ordered_list") {
        // tight-ness is ONLY used by lists and we only want it to propagate
        // up to the enclosing list.
        delete state.tight;
      }
      if (node == null) {
        return [];
      }
      return [node];
    }
  }

  state.contents.push(token);
  return [];
}

register(handleClose);
