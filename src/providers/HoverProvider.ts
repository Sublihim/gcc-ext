// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { NamespaceIndex } from '../index/NamespaceIndex';
import { SymbolCache } from '../parser/SymbolCache';
import { resolveReceiverType, resolveMethodInHierarchy } from '../parser/InheritanceResolver';

const GOOG_CALL_RE = /goog\.(?:require|provide|module|requireType)\s*\(\s*['"]([^'"]+)['"]/;

export class HoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly index: NamespaceIndex,
    private readonly symbolCache: SymbolCache,
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {

    // --- Шаг 1: строка goog.require/provide/module/requireType ---
    const line = document.lineAt(position.line).text;
    const googMatch = GOOG_CALL_RE.exec(line);
    if (googMatch) {
      const nsStart = line.indexOf(googMatch[1]);
      const nsEnd = nsStart + googMatch[1].length;
      if (position.character >= nsStart && position.character <= nsEnd) {
        return this.hoverForNamespace(googMatch[1], document);
      }
    }

    // --- Шаг 2 + 3: символ или метод в коде ---
    const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!wordRange) return undefined;
    const word = document.getText(wordRange);

    // Шаг 2: прямое совпадение с namespace в индексе (перебор суффиксов)
    const parts = word.split('.');
    for (let len = parts.length; len > 0; len--) {
      const candidate = parts.slice(0, len).join('.');
      const entry = this.index.getByNamespace(candidate);
      if (entry) {
        return this.hoverForNamespace(candidate, document);
      }
    }

    // Шаг 3: тип-инференс для метода — receiver.method()
    if (word.includes('.')) {
      return this.hoverForMethod(word, document, position);
    }

    return undefined;
  }

  /** Собирает hover-карточку для namespace из индекса */
  private hoverForNamespace(
    ns: string,
    document: vscode.TextDocument
  ): vscode.Hover | undefined {
    const entry = this.index.getByNamespace(ns);
    if (!entry) return undefined;

    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === entry.filePath);
    const symbols = this.symbolCache.get(entry.filePath, openDoc);
    const info = symbols.get(ns);

    const md = new vscode.MarkdownString(undefined, true);
    md.appendCodeblock(entry.filePath, 'text');

    if (entry.moduleType === 'goog') {
      md.appendMarkdown('\n**type:** `goog.module`');
    }

    if (info?.kind) {
      md.appendMarkdown(`\n**kind:** \`${info.kind}\``);
    }
    if (info?.extends?.length) {
      md.appendMarkdown(`\n**extends:** \`${info.extends.join('`, `')}\``);
    }
    if (info?.implements?.length) {
      md.appendMarkdown(`\n**implements:** \`${info.implements.join('`, `')}\``);
    }

    if (entry.requires.length > 0) {
      md.appendMarkdown(`\n**requires:** \`${entry.requires.join('`, `')}\``);
    }

    if (info?.jsdoc) {
      md.appendMarkdown(`\n\n---\n${info.jsdoc}`);
    }

    return new vscode.Hover(md);
  }

  /**
   * Тип-инференс для вызова метода: receiver.method.
   * Ищет @type-аннотацию на receiver в текущем документе,
   * затем находит TypeName.prototype.method в SymbolCache.
   */
  private hoverForMethod(
    word: string,
    document: vscode.TextDocument,
    _position: vscode.Position
  ): vscode.Hover | undefined {
    const lastDot = word.lastIndexOf('.');
    if (lastDot < 0) return undefined;

    const receiver = word.slice(0, lastDot);   // "this.color_" или "color_" или "c"
    const method   = word.slice(lastDot + 1);   // "getColor"

    // Нормализуем receiver: убираем ведущий "this."
    const varName = receiver.startsWith('this.') ? receiver.slice(5) : receiver;
    if (!varName) return undefined;

    // Случай: this.someMethod() — receiver === "this", ищем метод в иерархии классов файла
    if (varName === 'this') {
      return this.hoverForThisMethod(method, document);
    }

    const typeName = resolveReceiverType(
      varName, document.uri.fsPath, document, this.symbolCache, this.index
    );
    if (!typeName) return undefined;

    const entry = this.index.getByNamespace(typeName);
    if (!entry) return undefined;

    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === entry.filePath);
    const symbols = this.symbolCache.get(entry.filePath, openDoc);

    // Пробуем prototype-метод, затем статический
    const protoKey  = `${typeName}.prototype.${method}`;
    const staticKey = `${typeName}.${method}`;
    const info = symbols.get(protoKey) ?? symbols.get(staticKey);
    if (!info?.jsdoc) return undefined;

    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${typeName}.prototype.${method}**`);
    if (info.kind) md.appendMarkdown(` *(${info.kind})*`);
    md.appendMarkdown(`\n\n---\n${info.jsdoc}`);
    return new vscode.Hover(md);
  }

  /**
   * Hover для this.someMethod(): определяет классы текущего файла и ищет метод
   * вверх по цепочке @extends через resolveMethodInHierarchy.
   */
  private hoverForThisMethod(
    method: string,
    document: vscode.TextDocument
  ): vscode.Hover | undefined {
    const entries = this.index.getByFile(document.uri.fsPath);
    for (const entry of entries) {
      const result = resolveMethodInHierarchy(entry.namespace, method, this.symbolCache, this.index);
      if (!result?.info.jsdoc) continue;
      const { resolvedType, info } = result;
      const md = new vscode.MarkdownString(undefined, true);
      md.appendMarkdown(`**${resolvedType}.prototype.${method}**`);
      if (info.kind) md.appendMarkdown(` *(${info.kind})*`);
      md.appendMarkdown(`\n\n---\n${info.jsdoc}`);
      return new vscode.Hover(md);
    }
    return undefined;
  }
}
