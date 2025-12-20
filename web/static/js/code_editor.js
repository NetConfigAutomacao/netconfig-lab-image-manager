/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

(function () {
  const STYLE_ID = 'code-editor-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .code-editor {
        background: rgba(15,23,42,0.92);
        border: 1px solid rgba(56,189,248,0.25);
        border-radius: 10px;
        padding: 10px;
        color: #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .code-editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        gap: 8px;
      }
      .code-editor-path {
        font-size: 12px;
        color: #cbd5e1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .code-editor-lang {
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(56,189,248,0.35);
        color: #e2e8f0;
        background: rgba(56,189,248,0.08);
        white-space: nowrap;
      }
      .code-editor-body {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0;
        align-items: stretch;
        border: 1px solid rgba(56,189,248,0.15);
        border-radius: 8px;
        overflow: hidden;
        background: rgba(10,14,26,0.9);
      }
      .code-editor-gutter {
        padding: 10px 8px 10px 10px;
        background: rgba(15,23,42,0.9);
        color: #64748b;
        text-align: right;
        user-select: none;
        font-size: 13px;
        line-height: 1.5;
        min-width: 42px;
        border-right: 1px solid rgba(56,189,248,0.12);
        white-space: pre;
      }
      .code-editor-textarea {
        width: 100%;
        padding: 10px;
        background: transparent;
        border: none;
        outline: none;
        resize: vertical;
        color: #e2e8f0;
        font-size: 13px;
        line-height: 1.5;
        font-family: inherit;
        min-height: 220px;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  }

  function detectLanguageFromPath(path, content) {
    const lower = (path || '').toLowerCase();
    if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'YAML';
    if (lower.endsWith('.json')) return 'JSON';
    if (lower.endsWith('.py')) return 'Python';
    if (lower.endsWith('.sh')) return 'Shell';
    if (lower.endsWith('.txt')) return 'Text';
    if (lower.endsWith('.conf') || lower.endsWith('.ini')) return 'Config';
    if (lower.endsWith('.md')) return 'Markdown';
    if (lower.endsWith('.js')) return 'JavaScript';
    if (lower.endsWith('.ts')) return 'TypeScript';
    const trimmed = (content || '').trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'JSON';
    if (trimmed.indexOf(':') !== -1 && trimmed.indexOf('\n') !== -1) return 'YAML';
    return 'Text';
  }

  function createCodeEditor(options) {
    injectStyles();
    const opts = options || {};
    const container = opts.container;
    if (!container) {
      throw new Error('container is required for createCodeEditor');
    }

    const initialValue = opts.value || '';
    const lang = opts.language || detectLanguageFromPath(opts.path, initialValue);
    const onSave = typeof opts.onSave === 'function' ? opts.onSave : null;
    const onCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;

    const root = document.createElement('div');
    root.className = 'code-editor';

    const header = document.createElement('div');
    header.className = 'code-editor-header';

    const pathEl = document.createElement('div');
    pathEl.className = 'code-editor-path';
    pathEl.textContent = opts.path || opts.label || 'arquivo';

    const langEl = document.createElement('div');
    langEl.className = 'code-editor-lang';
    langEl.textContent = lang || 'Text';

    header.appendChild(pathEl);
    header.appendChild(langEl);

    const body = document.createElement('div');
    body.className = 'code-editor-body';

    const gutter = document.createElement('pre');
    gutter.className = 'code-editor-gutter';

    const textarea = document.createElement('textarea');
    textarea.className = 'code-editor-textarea';
    textarea.value = initialValue;

    function updateGutter() {
      const lines = textarea.value.split('\n').length || 1;
      let buf = '';
      for (let i = 1; i <= lines; i += 1) {
        buf += i + '\n';
      }
      gutter.textContent = buf;
    }

    function insertAtCursor(text) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.slice(0, start) + text + val.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      updateGutter();
    }

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertAtCursor('  ');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (onSave) onSave(textarea.value);
      } else if (e.key === 'Enter') {
        const start = textarea.selectionStart;
        const val = textarea.value;
        const before = val.slice(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const currentLine = before.slice(lineStart);
        const indentMatch = currentLine.match(/^[\t ]+/);
        const indent = indentMatch ? indentMatch[0] : '';
        setTimeout(function () {
          insertAtCursor(indent);
        }, 0);
      } else if (e.key === 'Escape') {
        if (onCancel) onCancel();
      }
    });

    textarea.addEventListener('input', updateGutter);
    textarea.addEventListener('scroll', function () {
      gutter.scrollTop = textarea.scrollTop;
    });

    body.appendChild(gutter);
    body.appendChild(textarea);
    root.appendChild(header);
    root.appendChild(body);

    container.innerHTML = '';
    container.appendChild(root);
    updateGutter();

    return {
      getValue: function () { return textarea.value; },
      setValue: function (v) { textarea.value = v || ''; updateGutter(); },
      focus: function () { textarea.focus(); },
      destroy: function () { root.remove(); }
    };
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.createCodeEditor = createCodeEditor;
  window.NetConfigApp.detectLanguageFromPath = detectLanguageFromPath;
})();
