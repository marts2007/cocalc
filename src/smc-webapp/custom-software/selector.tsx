/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux, useState } from "../app-framework";
import { ComputeImages, ComputeImage, ComputeImageTypes } from "./init";
import { SiteName, CompanyName, HelpEmailLink } from "../customize";
import { Markdown, SearchInput, Icon } from "../r_misc";
import { CUSTOM_SOFTWARE_HELP_URL } from "./util";
import { COLORS } from "smc-util/theme";

import {
  Row,
  Col,
  FormGroup,
  ControlLabel,
  ListGroup,
  ListGroupItem,
  Radio,
} from "react-bootstrap";

const BINDER_URL = "https://mybinder.readthedocs.io/en/latest/";

const cs_list_style: Readonly<React.CSSProperties> = Object.freeze({
  height: "250px",
  overflowX: "hidden" as "hidden",
  overflowY: "scroll" as "scroll",
  border: `1px solid ${COLORS.GRAY_LL}`,
  borderRadius: "5px",
  marginBottom: "0px",
});

const entries_item_style: Readonly<React.CSSProperties> = Object.freeze({
  width: "100%",
  margin: "2px 0px",
  padding: "5px",
  border: "none",
  textAlign: "left" as "left",
});

export interface CustomSoftwareState {
  image_selected?: string;
  title_text?: string;
  image_type?: ComputeImageTypes;
}

interface Props {
  onChange: (obj: CustomSoftwareState) => void;
}

export const CustomSoftware: React.FC<Props> = ({ onChange }) => {
  const images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images"
  );

  const [search_img, set_search_img] = useState<string>("");

  const [image_selected, set_image_selected] = useState<string | undefined>(
    undefined
  );
  const set_title_text = useState<string | undefined>(undefined)[1];
  const [image_type, set_image_type] = useState<ComputeImageTypes>("official");

  function set_state(
    image_selected: string | undefined,
    title_text: string | undefined,
    image_type: ComputeImageTypes
  ): void {
    set_image_selected(image_selected);
    set_title_text(title_text);
    set_image_type(image_type);
    onChange({ image_selected, title_text, image_type });
  }

  function render_custom_image_entries() {
    if (images == null) return;

    const search_hit = (() => {
      if (search_img.length > 0) {
        return (img: ComputeImage) =>
          img.get("search_str", "").indexOf(search_img.toLowerCase()) >= 0;
      } else {
        return (_img: ComputeImage) => true;
      }
    })();

    const entries: JSX.Element[] = images
      .filter((img) => img.get("type", "") === "custom")
      .filter(search_hit)
      .sortBy((img) => img.get("display", "").toLowerCase())
      .entrySeq()
      .map((e) => {
        const [id, img] = e;
        const display = img.get("display", "");
        return (
          <ListGroupItem
            key={id}
            active={image_selected === id}
            onClick={() => set_state(id, display, image_type)}
            style={entries_item_style}
            bsSize={"small"}
          >
            {display}
          </ListGroupItem>
        );
      })
      .toArray();

    if (entries.length > 0) {
      return <ListGroup style={cs_list_style}>{entries}</ListGroup>;
    } else {
      if (search_img.length > 0) {
        return <div>No search hits.</div>;
      } else {
        return <div>No custom software available</div>;
      }
    }
  }

  function search(val: string): void {
    set_search_img(val);
    set_state(undefined, undefined, image_type);
  }

  function render_custom_images() {
    if (image_type !== "custom") return;

    return (
      <>
        <div style={{ display: "flex" }}>
          <SearchInput
            placeholder={"Search…"}
            autoFocus={false}
            value={search_img}
            on_escape={() => set_search_img("")}
            on_change={search}
            style={{ flex: "1" }}
          />
        </div>
        {render_custom_image_entries()}
        <div style={{ color: COLORS.GRAY, margin: "15px 0" }}>
          Contact us to add more or give feedback:{" "}
          <HelpEmailLink color={COLORS.GRAY} />.
        </div>
      </>
    );
  }

  function render_selected_custom_image_info() {
    if (image_type !== "custom" || image_selected == null || images == null) {
      return;
    }

    const id: string = image_selected;
    const data = images.get(id);
    if (data == null) {
      // we have a serious problem
      console.warn(`compute_image data missing for '${id}'`);
      return;
    }
    // some fields are derived in the "Table" when the data comes in
    const img: ComputeImage = data;
    const disp = img.get("display");
    const desc = img.get("desc", "");
    const url = img.get("url");
    const src = img.get("src");
    const disp_tag = img.get("display_tag");

    const render_source = () => {
      if (src == null || src.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          Source: <code>{src}</code>
        </div>
      );
    };

    const render_url = () => {
      if (url == null || url.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          <a href={url} target={"_blank"} rel={"noopener"}>
            <Icon name="external-link-alt" /> Website
          </a>
        </div>
      );
    };

    return (
      <>
        <h3 style={{ marginTop: "5px" }}>{disp}</h3>
        <div style={{ marginTop: "5px" }}>
          Image ID: <code>{disp_tag}</code>
        </div>
        <div
          style={{ marginTop: "10px", overflowY: "auto", maxHeight: "200px" }}
        >
          <Markdown value={desc} className={"cc-custom-image-desc"} />
        </div>
        {render_source()}
        {render_url()}
      </>
    );
  }

  function render_type_selection() {
    return (
      <>
        <ControlLabel>Software environment</ControlLabel>

        <FormGroup>
          <Radio
            checked={image_type === "official"}
            id={"default-compute-image"}
            onChange={() => {
              set_state(undefined, undefined, "official");
            }}
          >
            <b>Default</b>: large repository of software, maintained by{" "}
            <CompanyName />, running <SiteName />.{" "}
            <a
              href={`${window.app_base_url}/doc/software.html`}
              target={"_blank"}
              rel={"noopener"}
            >
              More info...
            </a>
          </Radio>

          {images != null && images.size > 0 ? (
            <Radio
              checked={image_type === "custom"}
              label={"Custom software environment"}
              id={"custom-compute-image"}
              onChange={() => {
                set_state(undefined, undefined, "custom");
              }}
            >
              <b>Custom</b>
              <sup>
                <em>beta</em>
              </sup>
              : 3rd party software environments, e.g.{" "}
              <a href={BINDER_URL} target={"_blank"} rel={"noopener"}>
                Binder
              </a>
              .{" "}
              <a href={CUSTOM_SOFTWARE_HELP_URL} target={"_blank"}>
                More info...
              </a>
            </Radio>
          ) : (
            "There are no customized software environments available."
          )}
        </FormGroup>
      </>
    );
  }

  return (
    <Row>
      <Col sm={12} style={{ marginTop: "10px" }}>
        {render_type_selection()}
      </Col>

      <Col sm={6}>{render_custom_images()}</Col>
      <Col sm={6}>{render_selected_custom_image_info()}</Col>
    </Row>
  );
};
