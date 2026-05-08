// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { NamespaceIndex } from '../index/NamespaceIndex';
import { SymbolCache } from '../parser/SymbolCache';
import { resolveReceiverType, resolveMethodInHierarchy } from '../parser/InheritanceResolver';

// Группа 1 — тип вызова (require/provide/module/requireType), группа 2 — namespace
const GOOG_CALL_RE = /goog\.(require|provide|module|requireType)\s*\(\s*['"]([^'"]+)['"]/;

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
    // goog.module исключаем — это объявление, не ссылка
    const m = GOOG_CALL_RE.exec(line);
    if (m && m[1] !== 'module') {
      const ns = m[2];
      const nsStart = line.indexOf(ns, m.index);
      const nsEnd = nsStart + ns.length;
      if (pos.character >= nsStart && pos.character <= nsEnd) {
        return ns;
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

    // Случай: this.someMethod() — receiver === "this".
    // В GCL-коде this всегда ссылается на экземпляр класса (не стрелочные функции).
    if (varName === 'this') {
      const entries = this.index.getByFile(document.uri.fsPath);
      for (const entry of entries) {
        const result = resolveMethodInHierarchy(entry.namespace, method, this.symbolCache, this.index);
        if (!result) continue;
        const defEntry = this.index.getByNamespace(result.resolvedType);
        if (!defEntry) continue;
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === defEntry.filePath);
        return new vscode.Location(
          vscode.Uri.file(defEntry.filePath),
          new vscode.Position(
            result.info.line,
            this.getSymbolColumn(defEntry.filePath, result.info.line, method, openDoc)
          )
        );
      }
      return undefined;
    }

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
      new vscode.Position(
        info.line,
        this.getSymbolColumn(entry.filePath, info.line, method, openDoc)
      )
    );
  }

  /**
   * Определяет позицию фактического определения символа в файле.
   * Приоритет: AST-символ из SymbolCache → goog.provide/module (fallback) → начало файла.
   */
  private findDefinitionPosition(filePath: string, namespace: string): vscode.Position {
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === filePath);
    const symbols = this.symbolCache.get(filePath, openDoc);

    const info = symbols.get(namespace);
    if (info) {
      // Ищем точную колонку — последний сегмент dotted-имени в строке
      const shortName = namespace.includes('.') ? namespace.split('.').pop()! : namespace;
      return new vscode.Position(
        info.line,
        this.getSymbolColumn(filePath, info.line, shortName, openDoc)
      );
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
          return new vscode.Position(i, lines[i].indexOf(namespace));
        }
      }
    } catch (e) {
      console.warn('[DefinitionProvider] не удалось прочитать файл:', filePath, e);
    }
    return new vscode.Position(0, 0);
  }

  /**
   * Возвращает колонку символа symbolName в строке lineNum файла.
   * Использует открытый документ если доступен, иначе читает файл с диска.
   */
  private getSymbolColumn(
    filePath: string,
    lineNum: number,
    symbolName: string,
    openDoc?: vscode.TextDocument
  ): number {
    try {
      const lineText = openDoc
        ? openDoc.lineAt(lineNum).text
        : fs.readFileSync(filePath, 'utf8').split('\n')[lineNum] ?? '';
      const col = lineText.indexOf(symbolName);
      return col >= 0 ? col : 0;
    } catch {
      return 0;
    }
  }
}
