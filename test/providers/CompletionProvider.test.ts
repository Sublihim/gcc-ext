// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionProvider } from '../../src/providers/CompletionProvider';
import { NamespaceIndex } from '../../src/index/NamespaceIndex';
import { makeTextDocument, Position } from '../__mocks__/vscode';
import type { NamespaceEntry } from '../../src/index/DepsParser';

function makeEntry(ns: string): NamespaceEntry {
  return { namespace: ns, filePath: `/project/${ns}.js`, provides: [ns], requires: [], moduleType: 'provide' };
}

function makeDoc(lineText: string, cursorChar: number) {
  return makeTextDocument('/project/test.js', lineText, 1);
}

describe('CompletionProvider', () => {
  let index: NamespaceIndex;
  let provider: CompletionProvider;

  beforeEach(() => {
    index = new NamespaceIndex();
    ['myapp.Foo', 'myapp.Bar', 'myapp.util.Helper', 'other.Baz'].forEach(ns => index.add(makeEntry(ns)));
    provider = new CompletionProvider(index);
  });

  it('возвращает completions внутри goog.require с prefix', () => {
    const line = "  goog.require('myapp.';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 20); // курсор после 'myapp.'
    const items = provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    const labels = items!.map(i => i.label);
    expect(labels).toContain('myapp.Foo');
    expect(labels).toContain('myapp.Bar');
    expect(labels).toContain('myapp.util.Helper');
    expect(labels).not.toContain('other.Baz');
  });

  it('возвращает все namespace при пустом prefix', () => {
    const line = "goog.require('');";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 14); // курсор между пустыми кавычками
    const items = provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    expect(items!.length).toBe(4);
  });

  it('возвращает undefined вне goog.require/provide', () => {
    const line = "const x = 'myapp.Foo';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 15);
    expect(provider.provideCompletionItems(doc, pos)).toBeUndefined();
  });

  it('работает с goog.provide()', () => {
    const line = "goog.provide('myapp.';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 20);
    const items = provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    expect(items!.map(i => i.label)).toContain('myapp.Foo');
  });

  it('работает с goog.requireType()', () => {
    const line = "goog.requireType('myapp.';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 24);
    const items = provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThan(0);
  });

  it('CompletionItem.range охватывает весь текст между кавычками', () => {
    const line = "goog.require('myapp.Foo');";
    const doc = makeDoc(line, 1);
    // Курсор в середине namespace
    const pos = new Position(0, 20);
    const items = provider.provideCompletionItems(doc, pos);
    expect(items).toBeDefined();
    const item = items![0];
    expect(item.range).toBeDefined();
    expect(item.range!.start.character).toBeLessThanOrEqual(14); // после открывающей кавычки
    expect(item.range!.end.character).toBeGreaterThanOrEqual(20);
  });

  it('не содержит undefined-элементов после фильтрации', () => {
    const line = "goog.require('myapp.';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 20);
    const items = provider.provideCompletionItems(doc, pos);
    expect(items?.every(i => i !== undefined)).toBe(true);
  });

  it('detail содержит путь к файлу', () => {
    const line = "goog.require('myapp.Foo';";
    const doc = makeDoc(line, 1);
    const pos = new Position(0, 22);
    const items = provider.provideCompletionItems(doc, pos);
    const fooItem = items?.find(i => i.label === 'myapp.Foo');
    expect(fooItem?.detail).toBe('/project/myapp.Foo.js');
  });
});
