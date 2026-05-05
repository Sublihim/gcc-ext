// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { NamespaceIndex } from '../index/NamespaceIndex';

const GOOG_CALL_RE = /goog\.(?:require|provide)\s*\(\s*['"]([^'"]+)['"]/;

export class HoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: NamespaceIndex) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;
    const m = GOOG_CALL_RE.exec(line);
    if (!m) return undefined;

    // Показываем hover только если курсор стоит внутри строки с неймспейсом
    const nsStart = line.indexOf(m[1]);
    const nsEnd = nsStart + m[1].length;
    if (position.character < nsStart || position.character > nsEnd) return undefined;

    const ns = m[1];
    const entry = this.index.getByNamespace(ns);
    if (!entry) return undefined;

    const md = new vscode.MarkdownString(undefined, true);
    md.appendCodeblock(entry.filePath, 'text');

    if (entry.requires.length > 0) {
      md.appendMarkdown(`\n**requires:** \`${entry.requires.join('`, `')}\``);
    }

    const jsdoc = this.readJsdoc(entry.filePath, ns);
    if (jsdoc) {
      md.appendMarkdown(`\n\n---\n${jsdoc}`);
    }

    return new vscode.Hover(md);
  }

  // Читает JSDoc-комментарий непосредственно перед строкой goog.provide в целевом файле.
  // Ищем только в первых 100 строках — goog.provide всегда объявлен в шапке файла.
  private readJsdoc(filePath: string, namespace: string): string | undefined {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const patterns = [`goog.provide('${namespace}')`, `goog.provide("${namespace}")`];

      for (let i = 0; i < Math.min(lines.length, 100); i++) {
        if (!patterns.some(p => lines[i].includes(p))) continue;

        // Поднимаемся вверх от строки goog.provide, собирая строки комментария.
        // Останавливаемся на первой непустой и не-комментарной строке.
        const commentLines: string[] = [];
        for (let j = i - 1; j >= 0 && j >= i - 20; j--) {
          const trimmed = lines[j].trim();
          if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            commentLines.unshift(lines[j]);
          } else {
            break;
          }
        }

        const raw = commentLines.join('\n').trim();
        if (!raw || !raw.includes('/*')) return undefined;
        // Убираем маркеры /** и */ и ведущие " * " для отображения в Markdown
        return raw
          .replace(/^\/\*+/, '')
          .replace(/\*+\/$/, '')
          .replace(/^\s*\*\s?/gm, '')
          .trim();
      }
    } catch {
      // файл недоступен
    }
    return undefined;
  }
}
