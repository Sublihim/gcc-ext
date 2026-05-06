// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { NamespaceIndex } from '../index/NamespaceIndex';
import { SymbolCache } from '../parser/SymbolCache';
import { resolveReceiverType } from '../parser/InheritanceResolver';

const GOOG_CALL_RE = /goog\.(?:require|provide|module|requireType)\s*\(\s*['"]([^'"]+)['"]/;

export class DefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly index: NamespaceIndex,
    private readonly symbolCache: SymbolCache,
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const ns = this.extractNamespaceAtPosition(document, position);
    if (ns) {
      const entry = this.index.getByNamespace(ns);
      if (!entry) return undefined;
      const uri = vscode.Uri.file(entry.filePath);
      const targetPos = this.findDefinitionPosition(entry.filePath, ns);
      return new vscode.Location(uri, targetPos);
    }

    // Fallback: type-inference для receiver.method() через цепочку наследования
    return this.resolveMethodDefinition(document, position);
  }

  private extractNamespaceAtPosition(
    doc: vscode.TextDocument,
    pos: vscode.Position
  ): string | undefined {
    const line = doc.lineAt(pos.line).text;

    // Случай 1: курсор на строке goog.require/provide/requireType
    const m = GOOG_CALL_RE.exec(line);
    if (m && !line.includes('goog.module(')) {
      const nsStart = line.indexOf(m[1]);
      const nsEnd = nsStart + m[1].length;
      if (pos.character >= nsStart && pos.character <= nsEnd) {
        return m[1];
      }
    }

    // Случай 2: курсор на символе в коде (new foo.Bar(), @type {foo.Bar} и т.п.)
    const wordRange = doc.getWordRangeAtPosition(pos, /[\w.]+/);
    if (!wordRange) return undefined;

    const word = doc.getText(wordRange);
    const parts = word.split('.');
    // Перебираем с конца — курсор может стоять на методе: "foo.Bar.create"
    for (let len = parts.length; len > 0; len--) {
      const candidate = parts.slice(0, len).join('.');
      if (this.index.getByNamespace(candidate)) return candidate;
    }

    return undefined;
  }

  /**
   * Разрешает переход к определению метода через тип-инференс.
   * Используется когда стандартный поиск по namespace-индексу не дал результата —
   * например, cursor на someMethod в this.someMember.someMethod(), где тип someMember
   * объявлен через @type в базовом классе.
   */
  private resolveMethodDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Location | undefined {
    const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!wordRange) return undefined;
    const word = document.getText(wordRange);
    if (!word.includes('.')) return undefined;

    const lastDot = word.lastIndexOf('.');
    const receiver = word.slice(0, lastDot);
    const method = word.slice(lastDot + 1);

    const varName = receiver.startsWith('this.') ? receiver.slice(5) : receiver;
    if (!varName) return undefined;

    const typeName = resolveReceiverType(
      varName, document.uri.fsPath, document, this.symbolCache, this.index
    );
    if (!typeName) return undefined;

    const entry = this.index.getByNamespace(typeName);
    if (!entry) return undefined;

    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === entry.filePath);
    const symbols = this.symbolCache.get(entry.filePath, openDoc);

    const protoKey = `${typeName}.prototype.${method}`;
    const staticKey = `${typeName}.${method}`;
    const info = symbols.get(protoKey) ?? symbols.get(staticKey);
    if (!info) return undefined;

    return new vscode.Location(
      vscode.Uri.file(entry.filePath),
      new vscode.Position(info.line, 0)
    );
  }

  /**
   * Определяет позицию фактического определения символа в файле.
   * Приоритет: AST-символ из SymbolCache → goog.provide/module (fallback) → начало файла.
   */
  private findDefinitionPosition(filePath: string, namespace: string): vscode.Position {
    // Открытый документ передаём в кеш для получения актуального in-memory текста
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === filePath);
    const symbols = this.symbolCache.get(filePath, openDoc);

    const info = symbols.get(namespace);
    if (info) {
      return new vscode.Position(info.line, 0);
    }

    // Fallback: ищем goog.provide/goog.module в тексте файла
    return this.findProvidePosition(filePath, namespace, openDoc);
  }

  /** Fallback: линейный поиск goog.provide/goog.module в первых 100 строках */
  private findProvidePosition(
    filePath: string,
    namespace: string,
    openDoc?: vscode.TextDocument
  ): vscode.Position {
    try {
      const content = openDoc ? openDoc.getText() : fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const patterns = [
        `goog.provide('${namespace}')`, `goog.provide("${namespace}")`,
        `goog.module('${namespace}')`,  `goog.module("${namespace}")`,
      ];
      const limit = Math.min(lines.length, 100);
      for (let i = 0; i < limit; i++) {
        if (patterns.some(p => lines[i].includes(p))) {
          return new vscode.Position(i, 0);
        }
      }
    } catch {
      // файл недоступен
    }
    return new vscode.Position(0, 0);
  }
}
