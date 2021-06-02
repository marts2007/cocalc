/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { RenderElementProps } from "./slate-react";
import { getRender } from "./elements";

export const Element: React.FC<RenderElementProps> = (props) => {
  const Component = getRender(props.element["type"]);
  return React.createElement(Component, props);
};
