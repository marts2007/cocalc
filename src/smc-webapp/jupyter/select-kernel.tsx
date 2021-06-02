/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// help users selecting a kernel

import { React, Component, Rendered, CSS } from "../app-framework";
import {
  Map as ImmutableMap,
  List,
  OrderedMap /*, List as ImmutableList*/,
} from "immutable";
import * as misc from "smc-util/misc";
import { Icon, Loading } from "../r_misc";
import { Col, Row } from "../antd-bootstrap";
import * as Antd from "antd";
import { Descriptions, Radio, Typography } from "antd";
import { Kernel } from "./util";
import { COLORS } from "smc-util/theme";
import { JupyterActions } from "./browser-actions";

const main_style: CSS = {
  padding: "20px 10px",
  overflowY: "auto",
  overflowX: "hidden",
} as const;

const section_style: CSS = {
  marginTop: "2em",
};

interface KernelSelectorProps {
  actions: JupyterActions;
  site_name: string;
  kernel?: string;
  kernel_info?: any;
  default_kernel?: string;
  ask_jupyter_kernel?: boolean;
  kernel_selection?: ImmutableMap<string, string>;
  kernels_by_name?: OrderedMap<string, ImmutableMap<string, string>>;
  kernels_by_language?: OrderedMap<string, List<string>>;
  closestKernel?: Kernel;
}

interface KernelSelectorState {}

export class KernelSelector extends Component<
  KernelSelectorProps,
  KernelSelectorState
> {
  constructor(props: KernelSelectorProps, context: any) {
    super(props, context);
    this.state = {};
  }

  // the idea here is to not set the kernel, but still render the notebook.
  // looks like that's not easy, and well, probably incompatible with classical jupyter.

  /*
    <Row style={row_style} className={"pull-right"}>
      {this.close_button()}
    </Row>

  close_button() {
    return (
      <Button
        key={"close"}
        bsStyle={"default"}
        onClick={() => this.props.actions.select_kernel(null)}
      >
        {"View without kernel"}
      </Button>
    );
  }
  */

  kernel_name(name: string): string | undefined {
    return this.kernel_attr(name, "display_name");
  }

  kernel_attr(name: string, attr: string): string | undefined {
    if (this.props.kernels_by_name == null) return undefined;
    const k = this.props.kernels_by_name.get(name);
    if (k == null) return undefined;
    return k.get(attr, name);
  }

  render_suggested_link(cocalc) {
    if (cocalc == null) return;
    const url: string | undefined = cocalc.get("url");
    const descr: string | undefined = cocalc.get("description", "");
    if (url != null) {
      return (
        <a href={url} target={"_blank"} rel={"noopener"}>
          {descr}
        </a>
      );
    } else {
      return descr;
    }
  }

  render_kernel_button(name: string, show_icon: boolean = true): Rendered {
    const lang = this.kernel_attr(name, "language");
    let icon: Rendered | undefined = undefined;
    if (lang != null && show_icon) {
      if (["python", "r", "sagemath", "octave", "julia"].indexOf(lang) >= 0) {
        icon = <Icon name={`cc-icon-${lang}`} />;
      } else if (lang.startsWith("bash")) {
        icon = <Icon name={"terminal"} />;
      }
      // TODO do other languages have icons?
    }
    return (
      <Radio.Button
        key={`kernel-${lang}-${name}`}
        onClick={() => this.props.actions.select_kernel(name)}
        style={{ marginBottom: "5px" }}
      >
        {icon} {this.kernel_name(name) || name}
      </Radio.Button>
    );
  }

  render_suggested() {
    if (
      this.props.kernel_selection == null ||
      this.props.kernels_by_name == null
    )
      return;

    const entries: Rendered[] = [];
    const kbn = this.props.kernels_by_name;

    this.props.kernel_selection
      .sort((a, b) => {
        // try to find the display name, otherwise fallback to kernel ID
        const name_a = this.kernel_name(a) || a;
        const name_b = this.kernel_name(b) || b;
        return name_a.localeCompare(name_b);
      })
      .map((name, lang) => {
        const cocalc: ImmutableMap<string, any> = kbn.getIn(
          [name, "metadata", "cocalc"],
          null
        );
        if (cocalc == null) return;
        const prio: number = cocalc.get("priority", 0);

        // drop those below 10, priority is too low
        if (prio < 10) return;

        const label = this.render_kernel_button(name);

        entries.push(
          <Descriptions.Item key={lang} label={label}>
            <div>{this.render_suggested_link(cocalc)}</div>
          </Descriptions.Item>
        );
      });

    if (entries.length == 0) return;

    return (
      <Descriptions
        title="Suggested kernels"
        bordered
        column={1}
        style={section_style}
      >
        {entries}
      </Descriptions>
    );
  }

  private render_custom(): Rendered {
    return (
      <Descriptions bordered column={1} style={section_style}>
        <Descriptions.Item label={"Custom kernels"}>
          <a onClick={() => this.props.actions.custom_jupyter_kernel_docs()}>
            How to create a custom kernel...
          </a>
        </Descriptions.Item>
      </Descriptions>
    );
  }

  render_all_langs(): Rendered[] | undefined {
    if (this.props.kernels_by_language == null) return;

    const label_style: React.CSSProperties = {
      fontWeight: "bold",
      color: COLORS.GRAY_D,
    };

    const all: Rendered[] = [];
    this.props.kernels_by_language.forEach((names, lang) => {
      const kernels = names.map((name) =>
        this.render_kernel_button(name, false)
      );

      const label = <span style={label_style}>{misc.capitalize(lang)}</span>;

      all.push(
        <Descriptions.Item key={lang} label={label}>
          <Radio.Group buttonStyle={"solid"} defaultValue={null}>
            {kernels}
          </Radio.Group>
        </Descriptions.Item>
      );
      return true;
    });

    return all;
  }

  render_all() {
    if (this.props.kernels_by_language == null) return;

    return (
      <Descriptions
        title="All kernels by language"
        bordered
        column={1}
        style={section_style}
      >
        {this.render_all_langs()}
      </Descriptions>
    );
  }

  render_last() {
    const name = this.props.default_kernel;
    if (name == null) return;
    if (this.props.kernels_by_name == null) return;
    // also don't render "last", if we do not know that kernel!
    if (!this.props.kernels_by_name.has(name)) return;

    return (
      <Descriptions bordered column={1} style={section_style}>
        <Descriptions.Item label={"Quick select"}>
          <div>
            Your most recently selected kernel is{" "}
            {this.render_kernel_button(name)}.
          </div>
        </Descriptions.Item>
        <Descriptions.Item label={"Make default"}>
          <Antd.Checkbox
            checked={!this.props.ask_jupyter_kernel}
            onChange={(e) => this.dont_ask_again_click(e.target.checked)}
          >
            Do not ask again. Instead, default to your most recent selection.
          </Antd.Checkbox>
          <div>
            <Typography.Text type="secondary">
              You can always change the kernel by clicking on the kernel
              selector at the top right.
            </Typography.Text>
          </div>
        </Descriptions.Item>
      </Descriptions>
    );
  }

  dont_ask_again_click(checked: boolean) {
    this.props.actions.kernel_dont_ask_again(checked);
  }

  render_top() {
    if (this.props.kernel == null || this.props.kernel_info == null) {
      let msg: Rendered;
      // kernel, but no info means it is not known
      if (this.props.kernel != null && this.props.kernel_info == null) {
        msg = (
          <>
            Your notebook kernel <code>"{this.props.kernel}"</code> does not
            exist on {this.props.site_name}.
          </>
        );
      } else {
        msg = <>This notebook has no kernel.</>;
      }
      return (
        <Row style={{ marginLeft: 0, marginRight: 0 }}>
          <strong>{msg}</strong> A working kernel is required in order to
          evaluate the code in the notebook. Please select one for the
          programming language you want to work with.
        </Row>
      );
    } else {
      const name = this.kernel_name(this.props.kernel);
      const current =
        name != null ? `The currently selected kernel is "${name}"` : "";

      return (
        <Row style={{ marginLeft: 0, marginRight: 0 }}>
          <strong>Select a new kernel.</strong> <span>{current}</span>
        </Row>
      );
    }
  }

  render_unknown() {
    const closestKernel = this.props.closestKernel;
    if (this.props.kernel_info != null || closestKernel == null) return;
    const closestKernelName = closestKernel.get("name");
    if (closestKernelName == null) return;

    return (
      <Descriptions
        bordered
        column={1}
        style={{ backgroundColor: COLORS.RED_L }}
      >
        <Descriptions.Item label={"Unknown Kernel"}>
          A similar kernel might be{" "}
          {this.render_kernel_button(closestKernelName)}.
        </Descriptions.Item>
      </Descriptions>
    );
  }

  render_footer(): Rendered {
    return (
      <Row style={{ color: COLORS.GRAY, paddingBottom: "2em" }}>
        <strong>Note:</strong> You can always change the selected kernel later
        in the »Kernel« menu or by clicking on the kernel information at the top
        right.
      </Row>
    );
  }

  render_close_button(): Rendered | undefined {
    if (this.props.kernel == null || this.props.kernel_info == null) return;
    return (
      <Antd.Button
        style={{ float: "right" }}
        onClick={() => this.props.actions.hide_select_kernel()}
      >
        Close
      </Antd.Button>
    );
  }

  render_body(): Rendered {
    if (
      this.props.kernels_by_name == null ||
      this.props.kernel_selection == null
    ) {
      return (
        <Row>
          <Loading />
        </Row>
      );
    } else {
      return (
        <>
          {this.render_top()}
          {this.render_unknown()}
          {this.render_last()}
          {this.render_suggested()}
          {this.render_all()}
          {this.render_custom()}
          <hr />
          {this.render_footer()}
        </>
      );
    }
  }

  render_head(): Rendered {
    return (
      <Antd.Row justify="space-between">
        <Antd.Col flex={1}>
          <h3>Select a Kernel</h3>
        </Antd.Col>
        <Antd.Col flex={"auto"}>{this.render_close_button()}</Antd.Col>
      </Antd.Row>
    );
  }

  render(): Rendered {
    return (
      <div style={main_style} className={"smc-vfill"}>
        <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
          {this.render_head()}
          {this.render_body()}
        </Col>
      </div>
    );
  }
}
