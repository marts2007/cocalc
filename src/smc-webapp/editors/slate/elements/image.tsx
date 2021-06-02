/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useEffect, useRef, useState } from "smc-webapp/app-framework";
import {
  register,
  SlateElement,
  useFocused,
  useProcessLinks,
  useSelected,
  useSlate,
} from "./register";
import { useSetElement } from "./set-element";
import { dict } from "smc-util/misc";
import { FOCUSED_COLOR } from "../util";
import { Resizable } from "re-resizable";

// NOTE: We do NOT use maxWidth:100% since that ends up
// making the resizing screw up the aspect ratio.

export interface Image extends SlateElement {
  type: "image";
  isInline: true;
  isVoid: true;
  src: string;
  alt?: string;
  title?: string;
  width?: string | number;
  height?: string | number;
}

export function toSlate({ type, children, token }) {
  switch (type) {
    // IMPORTANT: this only gets called with type != 'image'
    // because of explicit code in ./html.tsx.
    case "html_inline":
    case "html_block":
      // token.content will be a string like this:
      //    <img src='https://wstein.org/bella-and-william.jpg' width=200px title='my pup' />
      // easiest way to parse this is with jquery (not by hand).
      const elt = $(token.content);
      const node = {
        type: "image",
        children,
        isInline: true,
        isVoid: true,
        src: elt.attr("src") ?? "",
        alt: elt.attr("alt") ?? "",
        title: elt.attr("title") ?? "",
        width: elt.attr("width"),
        height: elt.attr("height"),
      } as any;
      if (type == "html_inline") {
        return node;
      }
      return {
        type: "paragraph",
        children: [{ text: "" }, node, { text: "" }],
      };
    case "image":
      const attrs = dict(token.attrs as any);
      return {
        type: "image",
        children,
        isInline: true,
        isVoid: true,
        src: attrs.src,
        alt: attrs.alt,
        title: attrs.title,
      };
    default:
      throw Error("bug");
  }
}

function toFloat(s: number | string | undefined): number | undefined {
  if (s == null) return s;
  if (typeof s == "string" && s.endsWith("%")) return undefined;
  return typeof s == "number" ? s : parseFloat(s);
}

register({
  slateType: "image",

  fromSlate: ({ node }) => {
    // ![ALT](https://wstein.org/bella-and-william.jpg "title")
    let src = node.src ?? "";
    let alt = node.alt ?? "";
    let title = node.title ?? "";
    let width = node.width;
    let height = node.height;
    if (!width && !height && !src.match(/\s/)) {
      // no width, no height and src has no spaces in it!
      // Our markdown processes doesn't work when the
      // image url has a space (or at least it is a pain
      // to escape it), and using quotes doesn't easily
      // workaround that so we just use an img take when
      // src has whitespace (below).
      if (title.length > 0) {
        title = ` \"${title}\"`;
      }
      return `![${alt}](${src}${title})`;
    } else {
      // width or height require using html instead, unfortunately...
      width = width ? ` width="${width}"` : "";
      height = height ? ` height="${height}"` : "";
      title = title ? ` title="${title}"` : "";
      src = src ? `src="${src}"` : "";
      alt = alt ? ` alt="${alt}"` : "";
      // Important: this **must** start with '<img ' right now
      // due to our fairly naive parsing code for html blocks.
      //
      // Also, object-fit: allows us to specify the
      // width and height and have a general CSS max-width,
      // without screwing up the aspect ratio.
      return `<img ${src} ${alt} ${width} ${height} ${title} style="object-fit:cover"/>`;
    }
  },

  Element: ({ attributes, children, element }) => {
    const node = element as Image;
    const { src, alt, title } = node;

    const [width, setWidth] = useState<number | undefined>(toFloat(node.width));
    const [height, setHeight] = useState<number | undefined>(
      toFloat(node.height)
    );

    useEffect(() => {
      if (node.width && width != toFloat(node.width)) {
        setWidth(toFloat(node.width));
      }
      if (node.height && height != toFloat(node.height)) {
        setHeight(toFloat(node.height));
      }
    }, [element]);

    const focused = useFocused();
    const selected = useSelected();
    const border = `2px solid ${focused && selected ? FOCUSED_COLOR : "white"}`;

    const ref = useProcessLinks([src]);
    const imageRef = useRef<any>(null);

    const editor = useSlate();
    const setElement = useSetElement(editor, element);

    return (
      <span {...attributes}>
        <span ref={ref} contentEditable={false}>
          <Resizable
            style={{
              display: "inline-block",
              background: "#f0f0f0",
              border,
              maxWidth: "100%",
            }}
            lockAspectRatio={true}
            size={
              width != null && height != null
                ? {
                    width,
                    height,
                  }
                : undefined
            }
            onResizeStop={(_e, _direction, _ref, d) => {
              if (width == null || height == null) return;
              const new_width = width + d.width;
              const new_height = height + d.height;
              setElement({
                height: `${new_height}px`,
                width: `${new_width}px`,
              });
              editor.saveValue();
              setWidth(new_width);
              setHeight(new_height);
            }}
          >
            <img
              onLoad={() => {
                const elt = $(imageRef.current);
                const width = elt.width() ?? 0;
                const height = elt.height() ?? 0;
                setWidth(width);
                setHeight(height);
              }}
              ref={imageRef}
              src={src}
              alt={alt}
              title={title}
              style={{
                height: height ?? node.height,
                width: width ?? node.width,
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "cover",
              }}
            />
          </Resizable>
        </span>
        {children}
      </span>
    );
  },

  toSlate,
});
