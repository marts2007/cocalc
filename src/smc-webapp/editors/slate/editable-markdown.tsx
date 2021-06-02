/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that allows WYSIWYG editing of markdown.

const EXPENSIVE_DEBUG = false; // EXTRA SLOW -- turn off before release!

import { Map } from "immutable";

import { EditorState } from "smc-webapp/frame-editors/frame-tree/types";
import { createEditor, Descendant, Range, Transforms } from "slate";
import { withFix4131, withNonfatalRange } from "./patches";
import { Slate, ReactEditor, Editable, withReact } from "./slate-react";
import { debounce, isEqual } from "lodash";
import {
  CSS,
  React,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useIsMountedRef,
} from "smc-webapp/app-framework";
import { Actions } from "smc-webapp/frame-editors/markdown-editor/actions";

import { Path } from "smc-webapp/frame-editors/frame-tree/path";
import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";
import { Element } from "./element";
import { Leaf } from "./leaf";
import { withAutoFormat } from "./format";
import { withNormalize } from "./normalize";
import { withInsertBreakHack } from "./elements/link";
import { estimateSize } from "./elements";
import { getHandler as getKeyboardHandler } from "./keyboard";

import { useUpload, withUpload } from "./upload";

import { slateDiff } from "./slate-diff";
import { applyOperations } from "./operations";
import { slatePointToMarkdownPosition } from "./sync";

import { useMentions } from "./slate-mentions";
import { mentionableUsers } from "smc-webapp/editors/markdown-input/mentionable-users";
import { createMention } from "./elements/mention";
import { submit_mentions } from "smc-webapp/editors/markdown-input/mentions";

import { useSearch, SearchHook } from "./search";
import { EditBar, useLinkURL, useListProperties, useMarks } from "./edit-bar";

import { useBroadcastCursors, useCursorDecorate } from "./cursors";

import { markdown_to_html } from "smc-webapp/markdown";

// (??) A bit longer is better, due to escaping of markdown and multiple users
// with one user editing source and the other editing with slate.
// const SAVE_DEBOUNCE_MS = 1500;
import { SAVE_DEBOUNCE_MS } from "smc-webapp/frame-editors/code-editor/const";

import { delay } from "awaiting";

export interface SlateEditor extends ReactEditor {
  ignoreNextOnChange?: boolean;
  syncCausedUpdate?: boolean;
  saveValue: (force?) => void;
  dropzoneRef?: any;
  applyingOperations?: boolean;
  lastSelection?: Range;
  curSelection?: Range;
  inverseSearch: (boolean?) => Promise<void>;
  hasUnsavedChanges?: boolean;
  markdownValue?: string;
  getMarkdownValue: () => string;
  getPlainValue: () => string;
  getSourceValue: (fragment?) => string;
  syncCache?: any;
  search: SearchHook;
}

// Whether or not to use windowing (=only rendering visible elements).
// I'm going to disable this by default (for production
// releases), but re-enable it frequently for development.
// There are a LOT of missing features when using windowing,
// including subtle issues with selection, scroll state, etc.
// IMPORTANT: Do not set this to false unless you want to make
// slate editing **basically unusable** at scale beyond a few pages!!
const USE_WINDOWING = true;

// Why window?  Unfortunately, due to how slate is designed, actually editing
// text is "unusable" for even medium size documents
// without using windowing. E.g., with say 200 top level blocks,
// just trying to enter random characters quickly on a superfast laptop
// shows nothing until you pause for a moment.  Totally unacceptable.
// This is for lots of reasons, including things like decorations being
// recomputed, caching not really working, DOM being expensive.
// Even click-dragging and selecting a range breaks often due to
// things being slow.
// In contrast, with windowing, everything is **buttery smooth**.
// Making this overscan small makes things even faster, and also
// minimizes interference when two users are editing at once.
// ** This must be at least 1 or our algorithm for maintaining the
// DOM selection state will not work.**
// Setting the count to 10 and editing moby dick **does** feel slightly
// laggy, whereas around 2 or 3 and it feels super snappy.
const OVERSCAN_ROW_COUNT = 2;

const STYLE = {
  width: "100%",
  overflow: "auto",
} as CSS;

interface Props {
  actions: Actions;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  reload_images: boolean;
  is_current?: boolean;
  is_fullscreen?: boolean;
  editor_state?: EditorState;
  cursors: Map<string, any>;
}

export const EditableMarkdown: React.FC<Props> = React.memo(
  ({
    actions,
    id,
    font_size,
    read_only,
    value,
    project_id,
    path,
    is_current,
    is_fullscreen,
    editor_state,
    cursors,
  }) => {
    const isMountedRef = useIsMountedRef();

    const editor = useMemo(() => {
      const cur = actions.getSlateEditor(id);
      if (cur != null) return cur;
      const ed = withNonfatalRange(
        withFix4131(
          withInsertBreakHack(
            withNormalize(
              withUpload(
                withAutoFormat(
                  withIsInline(withIsVoid(withReact(createEditor())))
                )
              )
            )
          )
        )
      ) as SlateEditor;
      actions.registerSlateEditor(id, ed);

      ed.getSourceValue = (fragment?) => {
        return fragment ? slate_to_markdown(fragment) : ed.getMarkdownValue();
      };

      ed.getMarkdownValue = () => {
        if (ed.markdownValue != null && !ed.hasUnsavedChanges) {
          return ed.markdownValue;
        }
        ed.markdownValue = slate_to_markdown(ed.children, {
          cache: ed.syncCache,
        });
        return ed.markdownValue;
      };

      ed.getPlainValue = (fragment?) => {
        const markdown = ed.getSourceValue(fragment);
        return $("<div>" + markdown_to_html(markdown) + "</div>").text();
      };

      ed.saveValue = (force?) => {
        if (!force && !editor.hasUnsavedChanges) {
          return;
        }
        if (force) {
          editor.markdownValue = undefined;
        }
        editor.hasUnsavedChanges = false;
        setSyncstringFromSlate();

        actions.ensure_syncstring_is_saved();
      };

      ed.syncCache = {};

      return ed as SlateEditor;
    }, []);

    const [editorValue, setEditorValue] = useState<Descendant[]>(() =>
      markdown_to_slate(value, false, editor.syncCache)
    );

    const rowSizeEstimator = useCallback((node) => {
      return estimateSize({ node, fontSize: font_size });
    }, []);

    const mentions = useMentions({
      editor,
      insertMention: (editor, account_id) => {
        Transforms.insertNodes(editor, [
          createMention(account_id),
          { text: " " },
        ]);
        submit_mentions(project_id, path, [{ account_id, description: "" }]);
      },
      matchingUsers: (search) => mentionableUsers(project_id, search),
    });

    const search: SearchHook = (editor.search = useSearch({ editor }));

    const { marks, updateMarks } = useMarks(editor);

    const { linkURL, updateLinkURL } = useLinkURL(editor);

    const { listProperties, updateListProperties } = useListProperties(editor);

    const updateScrollState = useMemo(
      () =>
        debounce(() => {
          const scroll = scrollRef.current?.scrollTop;
          if (scroll != null) {
            actions.save_editor_state(id, { scroll });
          }
        }, 500),
      []
    );

    const updateWindowedScrollState = useMemo(
      () =>
        debounce(() => {
          if (!USE_WINDOWING) return;
          const scroll =
            editor.windowedListRef.current?.render_info?.visibleStartIndex;
          if (scroll != null) {
            actions.save_editor_state(id, { scroll });
          }
        }, 500),
      []
    );

    const broadcastCursors = useBroadcastCursors({
      editor,
      broadcastCursors: (x) => actions.set_cursor_locs(x),
    });
    const cursorDecorate = useCursorDecorate({
      editor,
      cursors,
      value,
      search,
    });

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const didRestoreRef = useRef<boolean>(false);
    const restoreScroll = async () => {
      if (didRestoreRef.current) return; // so we only ever do this once.
      didRestoreRef.current = true;

      const scroll = editor_state?.get("scroll");
      if (scroll == null) return;

      // First test for windowing support
      if (USE_WINDOWING) {
        await new Promise(requestAnimationFrame);
        // Standard embarassing hacks due to waiting to load and measure cells...
        editor.windowedListRef.current?.scrollToItem(scroll, "start");
        await delay(10);
        editor.windowedListRef.current?.scrollToItem(scroll, "start");
        await delay(500);
        editor.windowedListRef.current?.scrollToItem(scroll, "start");
        return;
      }

      // No windowing
      if (scrollRef.current == null) {
        return;
      }
      const elt = $(scrollRef.current);
      // wait until render happens
      await new Promise(requestAnimationFrame);
      elt.scrollTop(scroll);
      await delay(0);
      // do any scrolling after image loads
      elt.find("img").on("load", function () {
        elt.scrollTop(scroll);
      });
    };

    useEffect(() => {
      if (value != "Loading...") {
        restoreScroll();
      }
    }, [value]);

    function setSyncstringFromSlate() {
      const v = editor.getMarkdownValue();
      actions.set_value(v);
    }

    // We don't want to do saveValue too much, since it presumably can be slow,
    // especially if the document is large. By debouncing, we only do this when
    // the user pauses typing for a moment. Also, this avoids making too many commits.
    const saveValueDebounce = useMemo(
      () => debounce(() => editor.saveValue(), SAVE_DEBOUNCE_MS),
      []
    );

    function onKeyDown(e) {
      if (read_only) {
        e.preventDefault();
        return;
      }

      mentions.onKeyDown(e);
      if (e.defaultPrevented) return;

      if (!ReactEditor.isFocused(editor)) {
        // E.g., when typing into a codemirror editor embedded
        // in slate, we get the keystrokes, but at the same time
        // the (contenteditable) editor itself is not focused.
        return;
      }

      const handler = getKeyboardHandler(e);
      if (handler != null) {
        const extra = { actions, id, search };
        if (handler({ editor, extra })) {
          e.preventDefault();
          // key was handled.
          return;
        }
      }
    }

    useEffect(() => {
      if (!is_current) {
        if (editor.hasUnsavedChanges) {
          // just switched from focused to not and there was
          // an unsaved change, so save state.
          editor.hasUnsavedChanges = false;
          setSyncstringFromSlate();
          actions.ensure_syncstring_is_saved();
        }
      }
    }, [is_current]);

    // Make sure to save the state of the slate editor
    // to the syncstring *before* merging in a change
    // from upstream.
    useEffect(() => {
      function before_change() {
        // Important -- ReactEditor.isFocused(editor)  is *false* when
        // you're editing some inline void elements (e.g., code blocks),
        // since the focus leaves slate and goes to codemirror (say).
        if (ReactEditor.isFocused(editor) && is_current) {
          setSyncstringFromSlate();
        }
      }
      actions.get_syncstring().on("before-change", before_change);
      return () => actions.get_syncstring().off("before-change", before_change);
    }, []);

    useEffect(() => {
      if (value == editor.markdownValue) {
        // Setting to current value, so no-op.
        return;
      }

      editor.markdownValue = value;
      const previousEditorValue = editor.children;

      // we only use the latest version of the document
      // for caching purposes.
      editor.syncCache = {};
      const nextEditorValue = markdown_to_slate(value, false, editor.syncCache);

      const operations = slateDiff(previousEditorValue, nextEditorValue);
      // Applying this operation below will immediately trigger
      // an onChange, which it is best to ignore to save time and
      // also so we don't update the source editor (and other browsers)
      // with a view with things like loan $'s escaped.'
      if (operations.length > 0) {
        editor.ignoreNextOnChange = editor.syncCausedUpdate = true;
        applyOperations(editor, operations);
      }

      if (EXPENSIVE_DEBUG) {
        const stringify = require("json-stable-stringify");
        // We use JSON rather than isEqual here, since {foo:undefined}
        // is not equal to {}, but they JSON the same, and this is
        // fine for our purposes.
        if (stringify(editor.children) != stringify(nextEditorValue)) {
          console.log(
            "**BUG!  slateDiff did not properly transform editor! See window.diffBug **"
          );
          (window as any).diffBug = {
            previousEditorValue,
            nextEditorValue,
            editorValue: editor.children,
            operations,
            stringify,
            slateDiff,
          };
        }
      }
    }, [value]);

    if ((window as any).cc != null) {
      // This only gets set when running in cc-in-cc dev mode.
      const { Editor, Node, Path, Range, Text } = require("slate");
      (window as any).cc.slate = {
        editor,
        Transforms,
        ReactEditor,
        Node,
        Path,
        Editor,
        Range,
        Text,
      };
    }

    editor.inverseSearch = async function inverseSearch(
      force?: boolean
    ): Promise<void> {
      if (
        !force &&
        (is_fullscreen || !actions.get_matching_frame({ type: "cm" }))
      ) {
        // - if user is fullscreen assume they just want to WYSIWYG edit
        // and double click is to select.  They can use sync button to
        // force opening source panel.
        // - if no source view, also don't do anything.  We only let
        // double click do something when there is an open source view,
        // since double click is used for selecting.
        return;
      }
      // delay to give double click a chance to change current focus.
      // This takes surprisingly long!
      let t = 0;
      while (editor.selection == null) {
        await delay(1);
        t += 50;
        if (t > 2000) return; // give up
      }
      const point = editor.selection?.anchor; // using anchor since double click selects word.
      if (point == null) {
        return;
      }
      const pos = slatePointToMarkdownPosition(editor, point);
      if (pos == null) return;
      actions.programmatical_goto_line(
        pos.line + 1, // 1 based (TODO: could use codemirror option)
        true,
        false, // it is REALLY annoying to switch focus to be honest, e.g., because double click to select a word is common in WYSIWYG editing.  If change this to true, make sure to put an extra always 50ms delay above due to focus even order.
        undefined,
        pos.ch
      );
    };

    const onChange = (newEditorValue) => {
      if (!isMountedRef.current) return;
      broadcastCursors();
      updateMarks();
      updateLinkURL();
      updateListProperties();
      try {
        // Track where the last editor selection was,
        // since this is very useful to know, e.g., for
        // understanding cursor movement, format fallback, etc.
        // @ts-ignore
        if (editor.lastSelection == null && editor.selection != null) {
          // initialize
          // @ts-ignore
          editor.lastSelection = editor.curSelection = editor.selection;
        }
        // @ts-ignore
        if (!isEqual(editor.selection, editor.curSelection)) {
          // @ts-ignore
          editor.lastSelection = editor.curSelection;
          if (editor.selection != null) {
            // @ts-ignore
            editor.curSelection = editor.selection;
          }
        }

        if (editorValue === newEditorValue) {
          // Editor didn't actually change value so nothing to do.
          return;
        }

        if (!editor.ignoreNextOnChange) {
          editor.hasUnsavedChanges = true;
          // markdown value now not known.
          editor.markdownValue = undefined;
        }

        setEditorValue(newEditorValue);

        // Update mentions state whenever editor actually changes.
        // This may pop up the mentions selector.
        mentions.onChange();

        if (!is_current) {
          // Do not save when editor not current since user could be typing
          // into another editor of the same underlying document.   This will
          // cause bugs (e.g., type, switch from slate to codemirror, type, and
          // see what you typed into codemirror disappear). E.g., this
          // happens due to a spurious change when the editor is defocused.

          return;
        }
        saveValueDebounce();
      } finally {
        editor.ignoreNextOnChange = false;
      }
    };

    useEffect(() => {
      editor.syncCausedUpdate = false;
    }, [editorValue]);

    let slate = (
      <Slate editor={editor} value={editorValue} onChange={onChange}>
        <Editable
          className={USE_WINDOWING ? "smc-vfill" : undefined}
          readOnly={read_only}
          renderElement={Element}
          renderLeaf={Leaf}
          onKeyDown={onKeyDown}
          onBlur={() => {
            editor.saveValue();
            updateMarks();
          }}
          onFocus={updateMarks}
          decorate={cursorDecorate}
          divref={scrollRef}
          onScroll={
            USE_WINDOWING ? updateWindowedScrollState : updateScrollState
          }
          style={
            USE_WINDOWING
              ? undefined
              : {
                  position: "relative", // CRITICAL!!! Without this, editor will sometimes scroll the entire frame off the screen.  Do NOT delete position:'relative'.  5+ hours of work to figure this out!  Note that this isn't needed when using windowing above.
                  minWidth: "80%",
                  padding: "70px",
                  background: "white",
                  overflow:
                    "auto" /* for this overflow, see https://github.com/ianstormtaylor/slate/issues/3706 */,
                }
          }
          windowing={
            USE_WINDOWING
              ? {
                  rowStyle: {
                    padding: "0 70px",
                    minHeight: "0.1px",
                    backgroundColor:
                      "white" /* to avoid overlapping transparent effect when initially measuring */,
                  },
                  overscanRowCount: OVERSCAN_ROW_COUNT,
                  marginTop: "40px",
                  marginBottom: "40px",
                  rowSizeEstimator,
                }
              : undefined
          }
        />
      </Slate>
    );
    let body = (
      <div
        className="smc-vfill"
        style={{ overflow: "auto", backgroundColor: "white" }}
      >
        <Path is_current={is_current} path={path} project_id={project_id} />
        <EditBar
          Search={search.Search}
          isCurrent={is_current}
          marks={marks}
          linkURL={linkURL}
          listProperties={listProperties}
          editor={editor}
        />
        <div
          className="smc-vfill"
          style={{
            ...STYLE,
            fontSize: font_size,
          }}
        >
          {mentions.Mentions}
          {slate}
        </div>
      </div>
    );
    return useUpload(project_id, path, editor, body);
  }
);

const withIsVoid = (editor) => {
  const { isVoid } = editor;

  editor.isVoid = (element) => {
    return element.isVoid != null ? element.isVoid : isVoid(element);
  };

  return editor;
};

const withIsInline = (editor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.isInline != null ? element.isInline : isInline(element);
  };

  return editor;
};
