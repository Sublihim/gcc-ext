// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect, beforeEach } from 'vitest';
import { NamespaceIndex } from '../../src/index/NamespaceIndex';
import type { NamespaceEntry } from '../../src/index/DepsParser';

function makeEntry(ns: string, filePath = '/project/foo.js'): NamespaceEntry {
  return { namespace: ns, filePath, provides: [ns], requires: [], moduleType: 'provide' };
}

describe('NamespaceIndex', () => {
  let index: NamespaceIndex;

  beforeEach(() => { index = new NamespaceIndex(); });

  it('add + getByNamespace возвращает добавленную запись', () => {
    const e = makeEntry('myapp.Foo');
    index.add(e);
    expect(index.getByNamespace('myapp.Foo')).toBe(e);
  });

  it('getByNamespace возвращает undefined для неизвестного namespace', () => {
    expect(index.getByNamespace('unknown.Ns')).toBeUndefined();
  });

  it('проектная запись перекрывает library-запись при совпадении namespace', () => {
    const libEntry = makeEntry('myapp.Foo', '/closure/goog/foo.js');
    const projEntry = makeEntry('myapp.Foo', '/project/src/foo.js');
    index.add(libEntry);
    index.add(projEntry);
    expect(index.getByNamespace('myapp.Foo')).toBe(projEntry);
  });

  it('getByPrefix возвращает только совпадающие namespace', () => {
    index.add(makeEntry('myapp.Foo'));
    index.add(makeEntry('myapp.Bar'));
    index.add(makeEntry('other.Baz'));
    const result = index.getNamespacesWithPrefix('myapp.');
    expect(result).toContain('myapp.Foo');
    expect(result).toContain('myapp.Bar');
    expect(result).not.toContain('other.Baz');
  });

  it('getByPrefix с пустой строкой возвращает все namespace', () => {
    index.add(makeEntry('a.A'));
    index.add(makeEntry('b.B'));
    expect(index.getNamespacesWithPrefix('')).toHaveLength(2);
  });

  it('getByPrefix возвращает пустой массив при отсутствии совпадений', () => {
    index.add(makeEntry('myapp.Foo'));
    expect(index.getNamespacesWithPrefix('xyz.')).toEqual([]);
  });

  it('clear очищает индекс: getByNamespace возвращает undefined', () => {
    index.add(makeEntry('myapp.Foo'));
    index.clear();
    expect(index.getByNamespace('myapp.Foo')).toBeUndefined();
  });

  it('clear сбрасывает size до 0', () => {
    index.add(makeEntry('myapp.Foo'));
    index.clear();
    expect(index.size()).toBe(0);
  });

  it('getByFile возвращает все записи для файла', () => {
    const file = '/project/shared.js';
    index.add({ namespace: 'ns.Alpha', filePath: file, provides: ['ns.Alpha', 'ns.Beta'], requires: [], moduleType: 'provide' });
    index.add({ namespace: 'ns.Beta', filePath: file, provides: ['ns.Alpha', 'ns.Beta'], requires: [], moduleType: 'provide' });
    index.add(makeEntry('other.X', '/other/x.js'));
    const entries = index.getByFile(file);
    expect(entries).toHaveLength(2);
    const ns = entries.map(e => e.namespace);
    expect(ns).toContain('ns.Alpha');
    expect(ns).toContain('ns.Beta');
  });

  it('getByFile возвращает пустой массив для неизвестного файла', () => {
    expect(index.getByFile('/nonexistent.js')).toEqual([]);
  });

  it('повторный add одной записи не создаёт дубликат', () => {
    const e = makeEntry('myapp.Foo');
    index.add(e);
    index.add(e);
    expect(index.size()).toBe(1);
  });

  it('бинарный поиск: большой индекс находит корректное подмножество', () => {
    for (let i = 0; i < 200; i++) {
      index.add(makeEntry(`myapp.ns${String(i).padStart(3, '0')}.Class`));
    }
    // Проверяем что все записи вернулись (prefix myapp.)
    const all = index.getNamespacesWithPrefix('myapp.');
    expect(all).toHaveLength(200);
    // Более узкий prefix
    const narrow = index.getNamespacesWithPrefix('myapp.ns0');
    // ns000..ns009 + ns010..ns099 начинаются на ns0, итого 100 штук (000-099)
    expect(narrow).toHaveLength(100);
  });
});
