/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Node, Text } from "slate";
import {
  ensure_ends_in_newline,
  indent,
  li_indent,
  markdown_escape,
  markdown_quote,
} from "./util";
const linkify = require("linkify-it")();

function serialize(node: Node, info: { parent: Node; index?: number }): string {
  //console.log("serialize", node);
  if (Text.isText(node)) {
    //console.log("  serialize as text", node);
    let text = node.text;
    if (!node.code && info.parent.type != "code") {
      text = markdown_escape(text);
    }
    if (node.bold) {
      text = `**${text}**`;
    }
    if (node.italic) {
      text = `_${text}_`;
    }
    if (node.underline) {
      text = `<u>${text}</u>`;
    }
    if (node.strikethrough) {
      text = `~~${text}~~`;
    }
    if (node.code) {
      text = `\`${text}\``;
    }
    return text;
  }

  switch (node.type) {
    case "bullet_list":
    case "ordered_list":
      // console.log("  serializing as list", node);
      const v: string[] = [];
      for (let i = 0; i < node.children.length; i++) {
        v.push(
          ensure_ends_in_newline(
            serialize(node.children[i], {
              parent: node,
              index: i,
            })
          )
        );
      }
      let s = v.join("");
      if (s[s.length - 2] != "\n") {
        // lists should end with two new lines.
        s += "\n";
      }
      return s;
  }

  const children = node.children
    .map((n) => serialize(n, { parent: node }))
    .join("");

  switch (node.type) {
    case "list_item":
      if (info?.parent == null) {
        return li_indent(`- ${children}`);
      } else if (info.parent.type == "bullet_list") {
        return li_indent(`- ${children}`);
      } else if (info.parent.type == "ordered_list") {
        return li_indent(
          `${
            (info.index ?? 0) + ((info.parent.attrs as any)?.start ?? 1)
          }. ${children}`
        );
      } else {
        // Unknown list type??
        return children;
      }
    case "heading":
      let h = "#";
      for (let n = 1; n < parseInt((node.tag as string).slice(1)); n++) {
        h += "#";
      }
      return `${h} ${children}\n\n`;
    case "paragraph":
      return `${children}${node.tight ? "\n" : "\n\n"}`;
    case "math":
      return node.value as string;
    case "checkbox":
      return node.checked ? "[x] " : "[ ] ";
    case "hr":
      return "\n---\n\n";
    case "html_block":
      return node.html as string;
    case "blockquote":
      return markdown_quote(children);
    case "html_inline":
      return node.html as string;
    case "emoji":
      return `:${node.markup}:`;
    case "link":
      // [my website](wstein.org "here")
      const attrs = (node as any).attrs;
      const href = attrs.href ? `${attrs.href}` : "";
      const title = attrs.title ? ` "${attrs.title}"` : "";
      let link;
      if (title == "" && children == href && linkify.test(href)) {
        // special case where the url is easily parsed by the linkify plugin.
        link = href;
      } else {
        link = `[${children}](${href}${title})`;
      }
      return link;
    case "code_block":
      return indent(ensure_ends_in_newline(children), 4) + "\n";
    case "fence":
      return "```\n" + ensure_ends_in_newline(children) + "```\n\n";
    default:
      // console.log("WARNING: serialize Node as UNKNOWN", { node, children });
      return `${children}\n`;
  }
}

export function slate_to_markdown(data: Node[]): string {
  console.log("slate_to_markdown", JSON.stringify(data, undefined, 2));
  const r = data.map((node) => serialize(node, { parent: node })).join("");
  (window as any).y = { doc: { ...data }, r };
  return r;
}
