// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { NamespaceIndex } from '../index/NamespaceIndex';

// Detects we are inside the string argument of goog.require/provide/requireType and captures the prefix typed so far
const IN_GOOG_REQUIRE_RE = /goog\.(?:require|provide|requireType)\s*\(\s*['"]([^'"]*)/;

export class CompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: NamespaceIndex) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] | undefined {
    const linePrefix = document.lineAt(position.line).text.substring(0, position.character);
    const m = IN_GOOG_REQUIRE_RE.exec(linePrefix);
    if (!m) return undefined;

    const prefix = m[1];
    const namespaces = this.index.getAllNamespaces();

    return namespaces
      .filter(ns => ns.startsWith(prefix))
      .map(ns => {
        const entry = this.index.getByNamespace(ns)!;
        const item = new vscode.CompletionItem(ns, vscode.CompletionItemKind.Module);
        item.detail = entry.filePath;
        item.sortText = ns;
        // Replace the typed prefix so the full namespace is inserted
        item.insertText = ns;
        return item;
      });
  }
}
