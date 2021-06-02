/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the Jupyter notebook frame tree editor
*/

import { Editor } from "./editor";
import { JupyterEditorActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

import { init_jupyter_classic_support } from "../../jupyter/jupyter-classic-support";

export function register_cocalc_jupyter(): void {
  register_file_editor({
    ext: "ipynb",
    component: Editor,
    Actions: JupyterEditorActions,
    is_public: false,
  });
}

init_jupyter_classic_support(register_cocalc_jupyter);

// We always register for "ipynb-cocalc-jupyter" purely as a hack so that
// we can still easily grab what we need to open an ipynb file
// using cocalc-jupyter, even if things are configured to
// use jupyter classic.  This is needed, e.g., for course
// restrictions.
register_file_editor({
  ext: "ipynb-cocalc-jupyter",
  component: Editor,
  Actions: JupyterEditorActions,
  is_public: false,
});
