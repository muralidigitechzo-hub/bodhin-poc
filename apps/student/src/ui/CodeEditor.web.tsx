/** Code editor (web): CodeMirror 6 — syntax colours, auto-indent, bracket matching, undo. MIT-licensed, no branding. */
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import type { CmLang } from '@/playground/stacks';

const ext = (l: CmLang) =>
  ({ html: [html()], css: [css()], javascript: [javascript()], typescript: [javascript({ typescript: true })], jsx: [javascript({ jsx: true })], python: [python()], sql: [sql()], java: [java()], cpp: [cpp()], rust: [rust()], php: [php()], plain: [] })[l];

export function CodeEditor({ value, onChange, lang, label, readOnly, minHeight = 280 }: { value: string; onChange: (v: string) => void; lang: CmLang; label: string; readOnly?: boolean; minHeight?: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup, keymap.of([indentWithTab]), oneDark, ...ext(lang), EditorState.readOnly.of(!!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
          EditorView.updateListener.of((u) => u.docChanged && cb.current(u.state.doc.toString())),
          EditorView.theme({ '&': { height: '100%', fontSize: '14px' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', minHeight: `${minHeight}px` } }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
  }, [lang, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // external changes (reset / load starter)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return React.createElement('div', { ref: host, style: { height: '100%', minHeight, borderRadius: 12, overflow: 'hidden', background: '#282c34' } });
}
