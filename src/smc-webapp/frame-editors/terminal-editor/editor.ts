/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level React component for the terminal
*/

import { createEditor } from "../frame-tree/editor";
import { TerminalFrame } from "./terminal";
import { CommandsGuide } from "./commands-guide";
import { set } from "smc-util/misc";

export const terminal = {
  short: "Terminal",
  name: "Terminal",
  icon: "terminal",
  component: TerminalFrame,
  buttons: set([
    /*"print", */
    "decrease_font_size",
    "increase_font_size",
    /* "find", */
    "paste",
    "copy",
    "kick_other_users_out",
    "pause",
    "edit_init_script",
    "clear",
    "help",
    "connection_status",
    "guide",
    /*"reload" */
  ]),
  hide_public: true, // never show this editor option for public view
  clear_info: {
    text:
      "Clearing this Terminal terminates a running program, respawns the shell, and cleans up the display buffer.",
    confirm: "Yes, clean up!",
  },
  guide_info: {
    title: "Guide",
    descr: "Show a panel guiding you working with the terminal.",
  },
};

const commands_guide = {
  short: "Guide",
  name: "Guide",
  icon: "book",
  component: CommandsGuide,
  buttons: set(["decrease_font_size", "increase_font_size"]),
};

const EDITOR_SPEC = {
  terminal,
  commands_guide,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TerminalEditor",
});
