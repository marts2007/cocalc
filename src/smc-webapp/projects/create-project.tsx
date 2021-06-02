/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new project
*/

import {
  React,
  ReactDOM,
  redux,
  useEffect,
  useIsMountedRef,
  useRef,
  useState,
  useTypedRedux,
} from "../app-framework";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";
import { delay } from "awaiting";
import {
  SoftwareEnvironment,
  SoftwareEnvironmentState,
  derive_project_img_name,
} from "../custom-software/selector";
import {
  Well,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert,
} from "../antd-bootstrap";
import { Row, Col } from "antd";
import { A, ErrorDisplay, Icon, Space } from "../r_misc";
import { COLORS } from "smc-util/theme";

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
}

type EditState = "edit" | "view" | "saving";

export const NewProjectCreator: React.FC<Props> = ({
  start_in_edit_mode,
  default_value,
}: Props) => {
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(
    start_in_edit_mode ? "edit" : "view"
  );
  const [title_text, set_title_text] = useState<string>(default_value ?? "");
  const [error, set_error] = useState<string>("");
  const [show_advanced, set_show_advanced] = useState<boolean>(false);
  const [title_prefill, set_title_prefill] = useState<boolean>(true);

  const [custom_software, set_custom_software] = useState<
    SoftwareEnvironmentState
  >({});

  const new_project_title_ref = useRef(null);

  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const customize_kucalc = useTypedRedux("customize", "kucalc");

  useEffect(() => {
    select_text();
  }, []);

  const is_mounted_ref = useIsMountedRef();

  async function select_text(): Promise<void> {
    // wait for next render loop so the title actually is in the DOM...
    await delay(1);
    ReactDOM.findDOMNode(new_project_title_ref.current)?.select();
  }

  function start_editing(): void {
    set_state("edit");
    set_title_text(default_value ?? "");
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    set_state("view");
    set_title_text(default_value ?? "");
    set_error("");
    set_custom_software({});
    set_show_advanced(false);
    set_title_prefill(true);
  }

  function toggle_editing(): void {
    if (state === "view") {
      start_editing();
    } else {
      cancel_editing();
    }
  }

  async function create_project(): Promise<void> {
    set_state("saving");
    const actions = redux.getActions("projects");
    let project_id: string;
    try {
      project_id = await actions.create_project({
        title: title_text,
        image: derive_project_img_name(custom_software),
        start: false, // do NOT want to start, due to apply_default_upgrades
      });
    } catch (err) {
      if (!is_mounted_ref.current) return;
      set_state("edit");
      set_error(`Error creating project -- ${err}`);
      return;
    }
    // We also update the customer billing information so apply_default_upgrades works.
    const billing_actions = redux.getActions("billing");
    if (billing_actions != null) {
      try {
        await billing_actions.update_customer();
        await actions.apply_default_upgrades({ project_id }); // see issue #4192
      } catch (err) {
        // Ignore error coming from this -- it's merely a convenience to
        // upgrade the project on creation; user could always do it manually,
        // and nothing in the UI guarantees it will happen.
      }
    }
    // switch_to=true is perhaps suggested by #4088
    actions.open_project({ project_id, switch_to: true });
    cancel_editing();
  }

  function render_info_alert(): JSX.Element | undefined {
    if (state === "saving") {
      return (
        <div style={{ marginTop: "30px" }}>
          <Alert bsStyle="info">
            <Icon name="cc-icon-cocalc-ring" spin />
            <Space /> Creating project...
          </Alert>
        </div>
      );
    }
  }

  function render_error(): JSX.Element | undefined {
    if (error) {
      return (
        <div style={{ marginTop: "30px" }}>
          <ErrorDisplay error={error} onClose={() => set_error("")} />
        </div>
      );
    }
  }

  function show_account_tab() {
    redux.getActions("page").set_active_tab("account");
  }

  function render_new_project_button(): JSX.Element | undefined {
    if (is_anonymous) {
      // anonymous users can't create projects...
      return (
        <Button
          onClick={show_account_tab}
          bsStyle={"success"}
          bsSize={"large"}
          style={{ width: "100%", margin: "30px 0" }}
        >
          Sign up now so you can create more projects and not lose your work!
        </Button>
      );
    }
    return (
      <Row>
        <Col xs={24}>
          <Button
            cocalc-test={"create-project"}
            bsStyle={"success"}
            bsSize={"large"}
            disabled={state !== "view"}
            onClick={toggle_editing}
            style={{ width: "100%" }}
          >
            <Icon name="plus-circle" /> Create New Project...
          </Button>
        </Col>
      </Row>
    );
  }

  function create_disabled() {
    return (
      // no name of new project
      title_text === "" ||
      // currently saving (?)
      state === "saving" ||
      // user wants a non-default image, but hasn't selected one yet
      ((custom_software.image_type === "custom" ||
        custom_software.image_type === "standard") &&
        custom_software.image_selected == null)
    );
  }

  function set_title(text: string): void {
    set_title_text(text);
    set_title_prefill(false);
  }

  function input_on_change(): void {
    const text = ReactDOM.findDOMNode(new_project_title_ref.current)?.value;
    set_title(text);
  }

  function handle_keypress(e): void {
    if (e.keyCode === 27) {
      cancel_editing();
    } else if (e.keyCode === 13 && title_text !== "") {
      create_project();
    }
  }

  function custom_software_on_change(obj: SoftwareEnvironmentState): void {
    if (obj.title_text != null && (!title_prefill || !title_text)) {
      set_title(obj.title_text);
    }
    set_custom_software(obj);
  }

  function render_advanced() {
    if (!show_advanced) return;
    return <SoftwareEnvironment onChange={custom_software_on_change} />;
  }

  function render_advanced_toggle(): JSX.Element | undefined {
    // we only support custom images on cocalc.com
    if (customize_kucalc !== KUCALC_COCALC_COM) return;
    if (show_advanced) return;
    return (
      <div style={{ margin: "10px 0 0" }}>
        <a
          onClick={() => set_show_advanced(true)}
          style={{ cursor: "pointer" }}
        >
          <b>Customize the software environment...</b>
        </a>
      </div>
    );
  }

  function render_input_section(): JSX.Element | undefined {
    return (
      <Well style={{ backgroundColor: "#FFF" }}>
        <Row>
          <Col sm={12}>
            <FormGroup>
              <FormControl
                ref={new_project_title_ref}
                type="text"
                placeholder="Project title"
                disabled={state === "saving"}
                value={title_text}
                onChange={input_on_change}
                onKeyDown={handle_keypress}
                autoFocus
              />
            </FormGroup>
            {render_advanced_toggle()}
          </Col>
          <Col sm={12}>
            <div style={{ color: COLORS.GRAY, marginLeft: "30px" }}>
              A <A href="https://doc.cocalc.com/project.html">project</A> is an
              isolated private computational workspace that you can share with
              others. You can easily change the project's title at any time in
              project settings.
            </div>
          </Col>
        </Row>
        {render_advanced()}
        <Row>
          <Col sm={24} style={{ marginTop: "10px" }}>
            <ButtonToolbar>
              <Button disabled={state === "saving"} onClick={cancel_editing}>
                Cancel
              </Button>
              <Button
                disabled={create_disabled()}
                onClick={() => create_project()}
                bsStyle="success"
              >
                Create Project
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
        <Row>
          <Col sm={24}>
            {render_error()}
            {render_info_alert()}
          </Col>
        </Row>
      </Well>
    );
  }

  function render_project_creation(): JSX.Element | undefined {
    if (state == "view") return;
    return (
      <Row style={{ width: "100%", paddingBottom: "20px" }}>
        <Col sm={24}>
          <Space />
          {render_input_section()}
        </Col>
      </Row>
    );
  }

  return (
    <div>
      {render_new_project_button()}
      {render_project_creation()}
    </div>
  );
};
