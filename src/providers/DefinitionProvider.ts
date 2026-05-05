// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { NamespaceIndex } from '../index/NamespaceIndex';

const GOOG_CALL_RE = /goog\.(?:require|provide)\s*\(\s*['"]([^'"]+)['"]/;

export class DefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: NamespaceIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const ns = this.extractNamespaceAtPosition(document, position);
    if (!ns) return undefined;

    const entry = this.index.getByNamespace(ns);
    if (!entry) return undefined;

    const uri = vscode.Uri.file(entry.filePath);
    const targetPos = this.findProvidePosition(entry.filePath, ns);
    return new vscode.Location(uri, targetPos);
  }

  private extractNamespaceAtPosition(
    doc: vscode.TextDocument,
    pos: vscode.Position
  ): string | undefined {
    const line = doc.lineAt(pos.line).text;

    // Случай 1: курсор на строке goog.require/provide
    const m = GOOG_CALL_RE.exec(line);
    if (m) {
      const nsStart = line.indexOf(m[1]);
      const nsEnd = nsStart + m[1].length;
      // Реагируем только если курсор физически внутри строки с неймспейсом,
      // а не просто где-то на той же строке
      if (pos.character >= nsStart && pos.character <= nsEnd) {
        return m[1];
      }
    }

    // Случай 2: курсор на символе в коде (new foo.Bar(), foo.Bar.method())
    const wordRange = doc.getWordRangeAtPosition(pos, /[\w.]+/);
    if (!wordRange) return undefined;

    const word = doc.getText(wordRange);
    const parts = word.split('.');
    // Курсор может стоять на методе: "foo.bar.Baz.create" — в индексе есть "foo.bar.Baz".
    // Перебираем с конца, пока не найдём совпадение в индексе
    for (let len = parts.length; len > 0; len--) {
      const candidate = parts.slice(0, len).join('.');
      if (this.index.getByNamespace(candidate)) return candidate;
    }

    return undefined;
  }

  // Сканируем только первые 100 строк: goog.provide всегда в шапке файла
  private findProvidePosition(filePath: string, namespace: string): vscode.Position {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const patterns = [
        `goog.provide('${namespace}')`,
        `goog.provide("${namespace}")`,
      ];
      const limit = Math.min(lines.length, 100);
      for (let i = 0; i < limit; i++) {
        if (patterns.some(p => lines[i].includes(p))) {
          return new vscode.Position(i, 0);
        }
      }
    } catch {
      // файл недоступен — переходим к началу файла
    }
    return new vscode.Position(0, 0);
  }
}
