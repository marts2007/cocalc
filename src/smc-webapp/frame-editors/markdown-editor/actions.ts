/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Markdown Editor Actions
*/

import { debounce } from "lodash";
import { toggle_checkbox } from "smc-webapp/editors/task-editor/desc-rendering";
import * as $ from "jquery";
import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";
import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";
import { scrollToHeading } from "smc-webapp/editors/slate/control";
import { SlateEditor } from "smc-webapp/editors/slate/editable-markdown";
import { formatAction as slateFormatAction } from "smc-webapp/editors/slate/format";
import {
  TableOfContentsEntryList,
  TableOfContentsEntry,
} from "smc-webapp/r_misc";
import { fromJS } from "immutable";
import { parseTableOfContents } from "smc-webapp/markdown";
import {
  markdownPositionToSlatePoint,
  slatePointToMarkdownPosition,
  scrollIntoView as scrollSlateIntoView,
} from "smc-webapp/editors/slate/sync";

interface MarkdownEditorState extends CodeEditorState {
  custom_pdf_error_message: string; // currently used only in rmd editor, but we could easily add pdf output to the markdown editor
  building: boolean; // for Rmd
  build_log: string; // for Rmd
  build_err: string; // for Rmd
  build_exit: number; // for Rmd
  contents?: TableOfContentsEntryList; // table of contents data.
}

export class Actions extends CodeEditorActions<MarkdownEditorState> {
  private slateEditors: { [id: string]: SlateEditor } = {};

  _init2(): void {
    if (this.is_public) return;
    this._init_syncstring_value();
    this._init_spellcheck();

    this.store.on("close-frame", ({ id, type }) => {
      if (type == "slate" && this.slateEditors[id]) {
        delete this.slateEditors[id];
      }
    });

    this._syncstring.on(
      "change",
      debounce(this.updateTableOfContents.bind(this), 2000)
    );
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "markdown" };
    } else {
      // We will switch to this when slate is more mature...
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm",
        },
        second: {
          type: "markdown",
        },
      };
      /*
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm",
        },
        second: {
          type: "slate",
        },
      };
      */
    }
  }

  toggle_markdown_checkbox(id: string, index: number, checked: boolean): void {
    // Ensure that an editor state is saved into the
    // (TODO: make more generic, since other editors will exist that are not just codemirror...)
    this.set_syncstring_to_codemirror(id);
    // Then do the checkbox toggle.
    const value = toggle_checkbox(this._syncstring.to_str(), index, checked);
    this._syncstring.from_str(value);
    this.set_codemirror_to_syncstring();
    this._syncstring.save();
    this.setState({ value });
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;
    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    try {
      print_html({
        html: $(`#frame-${id}`).html(),
        project_id: this.project_id,
        path: this.path,
      });
    } catch (err) {
      this.set_error(err);
    }
  }

  // Never delete trailing whitespace for markdown files.
  delete_trailing_whitespace(): void {}

  // per-session sync-aware undo; aware of more than one editor type
  undo(id: string): void {
    if (this._get_frame_type(id) != "slate") {
      super.undo(id);
      return;
    }
    const value = this._syncstring.undo().to_str();
    this._syncstring.set(value, true);
    this._syncstring.commit();
    // Important: also set codemirror editor state, if there is one (otherwise it will be out of sync!)
    this._get_cm()?.setValueNoJump(value, true);
  }

  // per-session sync-aware redo ; aware of more than one editor type
  redo(id: string): void {
    if (this._get_frame_type(id) != "slate") {
      super.redo(id);
      return;
    }
    if (!this._syncstring.in_undo_mode()) {
      return;
    }
    const doc = this._syncstring.redo();
    if (doc == null) {
      // can't redo if version not defined/not available.
      return;
    }
    const value = doc.to_str();
    this._syncstring.set(value, true);
    this._syncstring.commit();
    // Important: also set codemirror editor state, as for undo above.
    this._get_cm()?.setValueNoJump(value, true);
  }

  async format_action(cmd, args, force_main: boolean = false): Promise<void> {
    const id = this._get_active_id();
    if (this._get_frame_type(id) != "slate" || this.slateEditors[id] == null) {
      super.format_action(cmd, args, force_main);
      return;
    }
    slateFormatAction(this.slateEditors[id], cmd, args);
  }

  public getSlateEditor(id?: string): SlateEditor | undefined {
    if (id == null) {
      // mainly for interactive use and debugging.
      for (const id0 in this.slateEditors) {
        return this.slateEditors[id0];
      }
      throw Error("no slate editors");
    }
    return this.slateEditors[id];
  }

  public registerSlateEditor(id: string, editor: SlateEditor): void {
    this.slateEditors[id] = editor;
  }

  public async show_table_of_contents(
    _id: string | undefined = undefined
  ): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "markdown_table_of_contents",
      "col",
      true,
      1 / 3
    );
    // the click to select TOC focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  public updateTableOfContents(force: boolean = false): void {
    if (
      !force &&
      !this.get_matching_frame({ type: "markdown_table_of_contents" })
    ) {
      // There is no table of contents frame so don't update that info.
      return;
    }
    const contents = fromJS(parseTableOfContents(this._syncstring.to_str()));
    this.setState({ contents });
  }

  public async scrollToHeading(entry: TableOfContentsEntry): Promise<void> {
    const id = this.show_focused_frame_of_type("slate");
    if (id == null) return;
    let editor = this.getSlateEditor(id);
    if (editor == null) {
      // if slate frame just created, have to wait until after it gets
      // rendered for the actual editor to get registered.
      await delay(1);
      editor = this.getSlateEditor(id);
    }
    if (editor == null) return;
    scrollToHeading(editor, parseInt(entry.id));
  }

  // for rendered markdown, switch frame type so that this rendered view
  // is instead editable.
  public edit(id: string): void {
    if (this.is_public) return;
    this.set_frame_type(id, "slate");
  }

  public readonly_view(id: string): void {
    this.set_frame_type(id, "markdown");
  }

  private async sync_cm_to_slate(
    id: string,
    editor_actions: Actions
  ): Promise<void> {
    const cm = editor_actions._cm[id];
    if (cm == null) return;
    const slate_id = this.show_focused_frame_of_type("slate");
    if (slate_id == null) return;
    this.set_active_id(id); // keep focus on the cm
    let editor = this.getSlateEditor(slate_id);
    if (editor == null) {
      // if slate frame just created, have to wait until after it gets
      // rendered for the actual editor to get registered.
      await delay(1);
      editor = this.getSlateEditor(slate_id);
    }
    if (editor == null) return;
    // important to get markdown from cm and not syncstring to get latest version.
    let point = markdownPositionToSlatePoint({
      markdown: cm.getValue(),
      pos: cm.getDoc().getCursor(),
      editor,
    });
    if (point == null) return;
    try {
      scrollSlateIntoView(editor, point);
    } catch (err) {
      // This will happen sometimes.
      // TODO: in fact, frequently due to inserting blank paragraphs
      // to make navigation easier... :-(
      console.log("point not found", point);
    }
  }

  private sync_slate_to_cm(id: string) {
    const editor = this.getSlateEditor(id);
    if (editor == null) return;
    const point = editor.selection?.focus;
    if (point == null) {
      return;
    }
    const pos = slatePointToMarkdownPosition(editor, point);
    if (pos == null) return;
    this.programmatical_goto_line(
      pos.line + 1, // 1 based (TODO: could use codemirror option)
      true,
      false,
      undefined,
      pos.ch
    );
  }

  public async sync(id: string, editor_actions: Actions): Promise<void> {
    const node = this._get_frame_node(id);
    if (!node) return;
    switch (node.get("type")) {
      case "slate":
        this.sync_slate_to_cm(id);
        return;
      case "cm":
        this.sync_cm_to_slate(id, editor_actions);
        return;
    }
  }
}
