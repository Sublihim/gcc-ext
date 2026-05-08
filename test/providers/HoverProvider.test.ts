// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HoverProvider } from '../../src/providers/HoverProvider';
import { NamespaceIndex } from '../../src/index/NamespaceIndex';
import { SymbolCache } from '../../src/parser/SymbolCache';
import {
  makeTextDocument, registerTextDocument, clearMockDocuments, Position,
} from '../__mocks__/vscode';
import type { NamespaceEntry } from '../../src/index/DepsParser';

const FIXTURES = path.resolve(__dirname, '../fixtures/source');

function readFixture(name: string) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function makeEntry(ns: string, filePath: string, moduleType: 'provide' | 'goog' = 'provide'): NamespaceEntry {
  return { namespace: ns, filePath, provides: [ns], requires: [], moduleType };
}

describe('HoverProvider', () => {
  let index: NamespaceIndex;
  let cache: SymbolCache;
  let provider: HoverProvider;

  const fooPath  = path.join(FIXTURES, 'basic_class.js');
  const barPath  = path.join(FIXTURES, 'inheritance.js');
  const modPath  = path.join(FIXTURES, 'goog_module.js');
  const implPath = path.join(FIXTURES, 'interface_impl.js');

  beforeEach(() => {
    clearMockDocuments();
    index = new NamespaceIndex();
    cache = new SymbolCache();
    provider = new HoverProvider(index, cache);

    registerTextDocument(makeTextDocument(fooPath, readFixture('basic_class.js')));
    registerTextDocument(makeTextDocument(barPath, readFixture('inheritance.js')));
    registerTextDocument(makeTextDocument(modPath, readFixture('goog_module.js')));
    registerTextDocument(makeTextDocument(implPath, readFixture('interface_impl.js')));

    index.add(makeEntry('myapp.Foo', fooPath));
    index.add({ namespace: 'myapp.Bar', filePath: barPath, provides: ['myapp.Bar'], requires: ['myapp.Foo', 'myapp.ISerializable'], moduleType: 'provide' });
    index.add(makeEntry('myapp.module.Thing', modPath, 'goog'));
    index.add(makeEntry('myapp.ISerializable', implPath));
    index.add(makeEntry('myapp.JsonSerializer', implPath));
  });

  it('hover на goog.require содержит путь к файлу', async () => {
    const line = "goog.require('myapp.Foo');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 18);
    const hover = await provider.provideHover(doc, pos);
    expect(hover).toBeDefined();
    expect((hover!.contents as any).value).toContain(fooPath);
  });

  it('hover на namespace с extends показывает extends', async () => {
    const line = "goog.require('myapp.Foo');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 18);
    const hover = await provider.provideHover(doc, pos);
    expect((hover!.contents as any).value).toContain('extends');
    expect((hover!.contents as any).value).toContain('goog.events.EventTarget');
  });

  it('hover на namespace с implements показывает implements', async () => {
    const line = "goog.require('myapp.Bar');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 18);
    const hover = await provider.provideHover(doc, pos);
    const val = (hover!.contents as any).value;
    expect(val).toContain('implements');
    expect(val).toContain('myapp.ISerializable');
  });

  it('hover на goog.module-namespace показывает type: goog.module', async () => {
    const line = "goog.require('myapp.module.Thing');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 20);
    const hover = await provider.provideHover(doc, pos);
    expect((hover!.contents as any).value).toContain('goog.module');
  });

  it('hover показывает requires если они есть', async () => {
    const line = "goog.require('myapp.Bar');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 18);
    const hover = await provider.provideHover(doc, pos);
    const val = (hover!.contents as any).value;
    expect(val).toContain('requires');
  });

  it('hover показывает jsdoc если есть', async () => {
    const line = "goog.require('myapp.Foo');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 18);
    const hover = await provider.provideHover(doc, pos);
    const val = (hover!.contents as any).value;
    expect(val).toContain('Базовый класс Foo');
  });

  it('hover вне namespace возвращает undefined', async () => {
    const doc = makeTextDocument('/project/test.js', 'const x = 42;');
    const hover = await provider.provideHover(doc, new Position(0, 5));
    expect(hover).toBeUndefined();
  });

  it('hover на @interface показывает kind=interface', async () => {
    const line = "goog.require('myapp.ISerializable');";
    const doc = makeTextDocument('/project/test.js', line);
    const pos = new Position(0, 20);
    const hover = await provider.provideHover(doc, pos);
    expect((hover!.contents as any).value).toContain('interface');
  });
});
