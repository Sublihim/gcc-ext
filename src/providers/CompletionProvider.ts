// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { NamespaceIndex } from '../index/NamespaceIndex';

// Поддерживает только однострочные вызовы goog.require/provide/requireType.
// Для полной поддержки многострочных вызовов потребуется AST-анализ открытого документа.
const IN_GOOG_REQUIRE_RE = /goog\.(?:require|provide|requireType)\s*\(\s*(['"])([^'"]*)/;

export class CompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: NamespaceIndex) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.substring(0, position.character);
    const m = IN_GOOG_REQUIRE_RE.exec(linePrefix);
    if (!m) return undefined;

    const prefix = m[2];

    // Позиция начала аргумента (сразу после открывающей кавычки)
    const argStart = m.index + m[0].length - prefix.length;

    // Конец заменяемого диапазона: ищем закрывающую кавычку после курсора
    const lineSuffix = lineText.substring(position.character);
    const closingMatch = lineSuffix.match(/^([^'"]*)['"]/);
    const argEnd = closingMatch
      ? position.character + closingMatch[1].length
      : position.character;

    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, argStart),
      new vscode.Position(position.line, argEnd)
    );

    const namespaces = this.index.getNamespacesWithPrefix(prefix);

    return namespaces.map(ns => {
      const entry = this.index.getByNamespace(ns);
      if (!entry) return undefined;

      const item = new vscode.CompletionItem(ns, vscode.CompletionItemKind.Module);
      item.detail = entry.filePath;
      item.sortText = ns;
      item.insertText = ns;
      // Явно задаём range — заменяем весь набранный текст между кавычками,
      // чтобы избежать дублирования при вставке
      item.range = replaceRange;
      return item;
    }).filter((item): item is vscode.CompletionItem => item !== undefined);
  }
}
