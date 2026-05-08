// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

// Минимальный mock VSCode API для unit-тестов.
// Покрывает только то, что реально используется в src/.

import { vi } from 'vitest';

// --- Uri ---

export class Uri {
  constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    public readonly path: string,
  ) {}

  static file(p: string): Uri {
    return new Uri('file', p, p);
  }

  static parse(s: string): Uri {
    const fsPath = s.replace(/^file:\/\//, '');
    return new Uri('file', fsPath, fsPath);
  }

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

// --- Position / Range / Location ---

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export class Location {
  public readonly range: Range;
  constructor(public readonly uri: Uri, posOrRange: Position | Range) {
    this.range = posOrRange instanceof Range
      ? posOrRange
      : new Range(posOrRange, posOrRange);
  }
}

// --- MarkdownString ---

export class MarkdownString {
  public value: string;
  constructor(value?: string, public readonly isTrusted?: boolean) {
    this.value = value ?? '';
  }
  appendMarkdown(text: string): this {
    this.value += text;
    return this;
  }
  appendCodeblock(text: string, _lang?: string): this {
    this.value += `\`\`\`\n${text}\n\`\`\``;
    return this;
  }
}

// --- Hover ---

export class Hover {
  constructor(
    public readonly contents: MarkdownString | string,
    public readonly range?: Range,
  ) {}
}

// --- CompletionItem / CompletionItemKind ---

export enum CompletionItemKind {
  Text = 0, Method = 1, Function = 2, Constructor = 3,
  Field = 4, Variable = 5, Class = 6, Interface = 7,
  Module = 8, Property = 9, Unit = 10, Value = 11,
  Enum = 12, Keyword = 13, Snippet = 14, Color = 15,
  File = 16, Reference = 17, Folder = 18,
}

export class CompletionItem {
  public detail?: string;
  public sortText?: string;
  public insertText?: string;
  public range?: Range;
  constructor(public label: string, public kind?: CompletionItemKind) {}
}

// --- StatusBarItem mock ---

function makeStatusBarItem() {
  return {
    text: '',
    tooltip: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
}

// --- window ---

export const window = {
  createStatusBarItem: vi.fn(() => makeStatusBarItem()),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
};

// --- workspace ---

// Хранилище mock-документов: тесты регистрируют через registerTextDocument()
const _mockDocs: Map<string, MockTextDocument> = new Map();

export function registerTextDocument(doc: MockTextDocument): void {
  _mockDocs.set(doc.uri.fsPath, doc);
}

export function clearMockDocuments(): void {
  _mockDocs.clear();
}

export const workspace = {
  textDocuments: [] as MockTextDocument[],
  onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  openTextDocument: vi.fn(async (uriOrPath: Uri | string) => {
    const fsPath = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
    const doc = _mockDocs.get(fsPath);
    if (!doc) throw new Error(`[vscode mock] openTextDocument: файл не зарегистрирован: ${fsPath}`);
    return doc;
  }),
  asRelativePath: vi.fn((p: string | Uri) => (typeof p === 'string' ? p : p.fsPath)),
};

// --- TextDocument mock helper ---

export interface MockTextDocument {
  uri: Uri;
  fileName: string;
  version: number;
  lineCount: number;
  getText(range?: Range): string;
  lineAt(lineOrPos: number | Position): { text: string; lineNumber: number };
  getWordRangeAtPosition(pos: Position, regex?: RegExp): Range | undefined;
}

export function makeTextDocument(fsPath: string, content: string, version = 1): MockTextDocument {
  const lines = content.split('\n');
  return {
    uri: Uri.file(fsPath),
    fileName: fsPath,
    version,
    lineCount: lines.length,
    getText: (range?: Range) => {
      if (!range) return content;
      // Извлекаем подстроку по диапазону строк и символов
      const startLine = range.start.line;
      const endLine = range.end.line;
      if (startLine === endLine) {
        return (lines[startLine] ?? '').slice(range.start.character, range.end.character);
      }
      const parts: string[] = [];
      parts.push((lines[startLine] ?? '').slice(range.start.character));
      for (let l = startLine + 1; l < endLine; l++) parts.push(lines[l] ?? '');
      parts.push((lines[endLine] ?? '').slice(0, range.end.character));
      return parts.join('\n');
    },
    lineAt: (lineOrPos: number | Position) => {
      const lineNum = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
      return { text: lines[lineNum] ?? '', lineNumber: lineNum };
    },
    getWordRangeAtPosition: (pos: Position, regex: RegExp = /\w+/): Range | undefined => {
      const lineText = lines[pos.line] ?? '';
      // Ищем все совпадения regex в строке и возвращаем то, что содержит pos.character
      const pattern = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lineText)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (pos.character >= start && pos.character <= end) {
          return new Range(new Position(pos.line, start), new Position(pos.line, end));
        }
      }
      return undefined;
    },
  };
}

// --- StatusBarAlignment (используется IndexManager) ---

export enum StatusBarAlignment { Left = 1, Right = 2 }

// --- Disposable ---

export class Disposable {
  constructor(private readonly _callOnDispose?: () => void) {}
  dispose(): void { this._callOnDispose?.(); }
}

// --- EventEmitter (не используется в тестах, но нужен для импорта) ---

export class EventEmitter<T> {
  event = vi.fn();
  fire = vi.fn();
  dispose = vi.fn();
}
