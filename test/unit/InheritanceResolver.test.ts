// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { resolveMethodInHierarchy, resolveReceiverType } from '../../src/parser/InheritanceResolver';
import { SymbolCache } from '../../src/parser/SymbolCache';
import { NamespaceIndex } from '../../src/index/NamespaceIndex';
import { makeTextDocument, registerTextDocument, clearMockDocuments } from '../__mocks__/vscode';
import type { NamespaceEntry } from '../../src/index/DepsParser';

const FIXTURES = path.resolve(__dirname, '../fixtures/source');

function readFixture(name: string) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function makeEntry(ns: string, filePath: string): NamespaceEntry {
  return { namespace: ns, filePath, provides: [ns], requires: [], moduleType: 'provide' };
}

describe('resolveMethodInHierarchy', () => {
  let index: NamespaceIndex;
  let cache: SymbolCache;

  const fooPath = path.join(FIXTURES, 'basic_class.js');
  const barPath = path.join(FIXTURES, 'inheritance.js');

  beforeEach(() => {
    clearMockDocuments();
    index = new NamespaceIndex();
    cache = new SymbolCache();

    // Регистрируем fixture-документы
    registerTextDocument(makeTextDocument(fooPath, readFixture('basic_class.js')));
    registerTextDocument(makeTextDocument(barPath, readFixture('inheritance.js')));

    index.add(makeEntry('myapp.Foo', fooPath));
    index.add(makeEntry('myapp.Bar', barPath));
  });

  it('находит прямой метод в типе без подъёма по иерархии', () => {
    const result = resolveMethodInHierarchy('myapp.Foo', 'getName', cache, index);
    expect(result).toBeDefined();
    expect(result!.resolvedType).toBe('myapp.Foo');
    expect(result!.info).toBeDefined();
  });

  it('предпочитает prototype-метод перед статическим', () => {
    // myapp.Foo имеет как prototype.getName, так и staticHelper
    const result = resolveMethodInHierarchy('myapp.Foo', 'getName', cache, index);
    expect(result!.info.kind).toBe('method');
  });

  it('находит метод у дочернего класса (Bar.prototype.serialize)', () => {
    const result = resolveMethodInHierarchy('myapp.Bar', 'serialize', cache, index);
    expect(result).toBeDefined();
    expect(result!.resolvedType).toBe('myapp.Bar');
  });

  it('возвращает undefined для неизвестного типа', () => {
    const result = resolveMethodInHierarchy('unknown.Type', 'someMethod', cache, index);
    expect(result).toBeUndefined();
  });

  it('возвращает undefined для несуществующего метода', () => {
    const result = resolveMethodInHierarchy('myapp.Foo', 'nonExistentMethod', cache, index);
    expect(result).toBeUndefined();
  });

  it('защита от циклов: A extends B extends A не зависает', () => {
    const aPath = '/fake/a.js';
    const bPath = '/fake/b.js';
    const aContent = '/** @constructor @extends {CycleB} */\nCycleA = function() {};\ngoog.inherits(CycleA, CycleB);';
    const bContent = '/** @constructor @extends {CycleA} */\nCycleB = function() {};\ngoog.inherits(CycleB, CycleA);';

    registerTextDocument(makeTextDocument(aPath, aContent));
    registerTextDocument(makeTextDocument(bPath, bContent));
    index.add(makeEntry('CycleA', aPath));
    index.add(makeEntry('CycleB', bPath));

    const result = resolveMethodInHierarchy('CycleA', 'method', cache, index);
    expect(result).toBeUndefined();
  });
});

describe('resolveReceiverType', () => {
  let index: NamespaceIndex;
  let cache: SymbolCache;

  const barPath = path.join(FIXTURES, 'inheritance.js');

  beforeEach(() => {
    clearMockDocuments();
    index = new NamespaceIndex();
    cache = new SymbolCache();
    registerTextDocument(makeTextDocument(barPath, readFixture('inheritance.js')));
    index.add(makeEntry('myapp.Bar', barPath));
  });

  it('находит @type для поля в текущем файле', () => {
    // inheritance.js имеет /** @type {string} */ this.tag = 'bar'
    const doc = makeTextDocument(barPath, readFixture('inheritance.js'));
    const result = resolveReceiverType('tag', barPath, doc, cache, index);
    expect(result).toBe('string');
  });

  it('возвращает undefined для несуществующего поля', () => {
    const doc = makeTextDocument(barPath, readFixture('inheritance.js'));
    const result = resolveReceiverType('nonExistentField', barPath, doc, cache, index);
    expect(result).toBeUndefined();
  });

  it('ограничение глубины: depth >= MAX возвращает undefined', () => {
    const doc = makeTextDocument(barPath, readFixture('inheritance.js'));
    // Вызываем с depth=20 напрямую
    const result = resolveReceiverType('tag', barPath, doc, cache, index, new Set(), 20);
    expect(result).toBeUndefined();
  });

  it('защита от циклов через visited', () => {
    const doc = makeTextDocument(barPath, readFixture('inheritance.js'));
    const visited = new Set([barPath]);
    const result = resolveReceiverType('tag', barPath, doc, cache, index, visited);
    expect(result).toBeUndefined();
  });
});
