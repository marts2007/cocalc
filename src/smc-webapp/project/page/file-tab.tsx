/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/
const { file_options } = require("../../editor");
import { NavItem } from "react-bootstrap";
import {
  React,
  ReactDOM,
  useActions,
  useEffect,
  useMemo,
  useRedux,
  useRef,
  useState,
  useTypedRedux,
} from "../../app-framework";
import { path_split, path_to_tab, trunc_left } from "smc-util/misc";
import { HiddenXS, Icon, Tip } from "../../r_misc";
import { COLORS } from "smc-util/theme";
import { PROJECT_INFO_TITLE } from "../info";
import { IS_SAFARI } from "../../feature";

export const FIXED_PROJECT_TABS = {
  files: {
    label: "Files",
    icon: "folder-open-o",
    tooltip: "Browse files",
    no_anonymous: false,
  },
  new: {
    label: "New",
    icon: "plus-circle",
    tooltip: "Create new file, folder, worksheet or terminal",
    no_anonymous: false,
  },
  log: {
    label: "Log",
    icon: "history",
    tooltip: "Log of project activity",
    no_anonymous: false,
  },
  search: {
    label: "Find",
    icon: "search",
    tooltip: "Search files in the project",
    no_anonymous: false,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    tooltip: "Project settings and controls",
    no_anonymous: true,
  },
  info: {
    label: PROJECT_INFO_TITLE,
    icon: "microchip",
    tooltip: "Running processes, resource usage, …",
    no_anonymous: true,
  },
} as const;

export const DEFAULT_FILE_TAB_STYLES = {
  width: 250,
  borderRadius: "5px 5px 0px 0px",
  flexShrink: 1,
  overflow: "hidden",
} as const;

interface Props0 {
  project_id: string;
  label?: string;
}
interface PropsPath extends Props0 {
  path: string;
  name?: undefined;
}
interface PropsName extends Props0 {
  path?: undefined;
  name: keyof typeof FIXED_PROJECT_TABS;
}
type Props = PropsPath | PropsName;

export const FileTab: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, path, name, label: label_prop } = props;
  let label = label_prop; // label might be modified in some situations
  const [x_hovered, set_x_hovered] = useState<boolean>(false);
  const actions = useActions({ project_id });
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab"
  );
  // this is smc-project/project-status/types::ProjectStatus
  const project_status = useTypedRedux({ project_id }, "status");
  const status_alert =
    name === "info" && project_status?.get("alerts")?.size > 0;

  // True if this tab is currently selected:
  const is_selected: boolean = useMemo(() => {
    return active_project_tab == (path != null ? path_to_tab(path) : name);
  }, [active_project_tab, path, name]);

  // True if there is activity (e.g., active output) in this tab
  const has_activity = useRedux(
    ["open_files", path ?? "", "has_activity"],
    project_id
  );

  const tab_ref = useRef(null);
  useEffect(() => {
    // This is a hack to get around a Firefox or react-sortable-hoc bug.  See
    // the long comment in src/smc-webapp/projects/projects-nav.tsx about
    // how to reproduce.
    if (tab_ref.current == null) return;
    ReactDOM.findDOMNode(tab_ref.current)?.children[0].removeAttribute("href");
  });

  function close_file(e) {
    e.stopPropagation();
    e.preventDefault();
    if (path == null || actions == null) return;
    actions.close_tab(path);
  }

  function click(e): void {
    if (actions == null) return;
    if (path != null) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) {
        // shift/ctrl/option clicking on *file* tab opens in a new popout window.
        actions.open_file({
          path,
          new_browser_window: true,
        });
      } else {
        actions.set_active_tab(path_to_tab(path));
      }
    } else if (name != null) {
      actions.set_active_tab(name);
    }
  }

  // middle mouse click closes
  function onMouseDown(e) {
    if (e.button === 1) {
      close_file(e);
    }
  }

  function render_displayed_label({ path, label }) {
    if (path != null) {
      // We ONLY show tooltip for filename (it provides the full path).
      // The "ltr" below is needed because of the direction 'rtl' in label_style, which
      // we have to compensate for in some situations, e.g.., a file name "this is a file!"
      // will have the ! moved to the beginning by rtl.
      const shift_open_info = (
        <span style={{ color: COLORS.GRAY }}>
          Hint: Shift-Click to open in new window.
        </span>
      );
      // The ! after name is needed since TS doesn't infer that if path is null then name is not null,
      // though our union type above guarantees this.
      const tooltip = (
        <span style={{ fontWeight: "bold" }}>
          {path != null ? path : FIXED_PROJECT_TABS[name!].tooltip}
        </span>
      );

      return (
        <div style={label_style}>
          <span style={{ direction: "ltr" }}>
            <Tip
              title={tooltip}
              tip={shift_open_info}
              stable={false}
              placement={"bottom"}
            >
              {label}
            </Tip>
          </span>
        </div>
      );
    } else {
      return <HiddenXS>{label}</HiddenXS>;
    }
  }

  let style: React.CSSProperties;
  if (path != null) {
    if (is_selected) {
      style = { ...DEFAULT_FILE_TAB_STYLES, backgroundColor: COLORS.BLUE_BG };
    } else {
      style = DEFAULT_FILE_TAB_STYLES;
    }
  } else {
    // highlight info tab if there is at least one alert
    if (status_alert) {
      style = { backgroundColor: COLORS.ATND_BG_RED_L };
    } else {
      style = { flex: "none" };
    }
  }

  const icon_style: React.CSSProperties = { fontSize: "15pt" };
  if (path != null) {
    icon_style.fontSize = "10pt";
  }
  if (has_activity) {
    icon_style.color = "orange";
  }

  const content_style: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
  if (path != null) {
    content_style.display = "flex";
  }

  const label_style: React.CSSProperties = {
    flex: 1,
    padding: "0 5px",
    overflow: "hidden",
  };

  if (label == null) {
    if (name != null) {
      label = FIXED_PROJECT_TABS[name].label;
    } else if (path != null) {
      label = path_split(path).tail;
    }
  }
  if (label == null) throw Error("label must not be null");

  const i = label.lastIndexOf("/");
  if (i !== -1) {
    if (IS_SAFARI) {
      // Safari's implementation of direction rtl combined with
      // ellipses is really buggy.  E.g.,
      //   https://developer.apple.com/forums/thread/87131
      // so for Safari we just show the filename as usual.  I tried
      // for many hours to find a palatable workaround, but failed.
      // So we just do something really naive but probably sort of
      // useful.
      label = trunc_left(label, 20);
    } else {
      // using a full path for the label instead of just a filename
      label_style.textOverflow = "ellipsis";
      // so the ellipsis are on the left side of the path, which is most useful
      label_style.direction = "rtl";
      label_style.padding = "0 1px"; // need less since have ...
    }
  }

  const x_button_style: React.CSSProperties = {
    float: "right",
    whiteSpace: "nowrap",
  };
  if (x_hovered) {
    x_button_style.color = "lightblue";
  }

  const icon =
    path != null
      ? file_options(path)?.icon ?? "code-o"
      : FIXED_PROJECT_TABS[name!].icon;

  const displayed_label: JSX.Element = render_displayed_label({ path, label });

  const color = is_selected
    ? "white"
    : status_alert
    ? COLORS.BS_RED
    : undefined;

  return (
    <NavItem
      ref={tab_ref}
      style={style}
      active={is_selected}
      onClick={click}
      cocalc-test={label}
      onMouseDown={onMouseDown}
    >
      <div
        style={{
          width: "100%",
          color,
          cursor: "pointer",
        }}
      >
        <div style={x_button_style}>
          {path != null && (
            <Icon
              onMouseOver={() => {
                set_x_hovered(true);
              }}
              onMouseOut={() => {
                set_x_hovered(false);
                actions?.clear_ghost_file_tabs();
              }}
              name="times"
              onClick={close_file}
            />
          )}
        </div>
        <div style={content_style}>
          <Icon style={icon_style} name={icon} /> {displayed_label}
        </div>
      </div>
    </NavItem>
  );
});
