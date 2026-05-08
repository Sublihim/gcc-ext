// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { parseDepsFile } from '../../src/index/DepsParser';

const FIXTURES_DEPS = path.resolve(__dirname, '../fixtures/deps');
const BASE_DIR = '/closure/goog';

describe('parseDepsFile', () => {
  it('парсит одну строку с одним provide', () => {
    const content = "goog.addDependency('foo/bar.js', ['myapp.Foo'], ['goog.events']);";
    const entries = parseDepsFile(content, BASE_DIR);
    expect(entries).toHaveLength(1);
    expect(entries[0].namespace).toBe('myapp.Foo');
    expect(entries[0].filePath).toBe(path.resolve(BASE_DIR, 'foo/bar.js'));
    expect(entries[0].requires).toEqual(['goog.events']);
    expect(entries[0].moduleType).toBe('provide');
  });

  it('создаёт отдельную запись для каждого namespace при нескольких provide', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DEPS, 'multi_ns.deps.js'), 'utf8');
    const entries = parseDepsFile(content, BASE_DIR);
    expect(entries).toHaveLength(3);
    const namespaces = entries.map(e => e.namespace);
    expect(namespaces).toContain('myapp.Alpha');
    expect(namespaces).toContain('myapp.Beta');
    expect(namespaces).toContain('myapp.Gamma');
    // Все три записи указывают на один файл
    const filePaths = new Set(entries.map(e => e.filePath));
    expect(filePaths.size).toBe(1);
  });

  it('все записи из multi_ns имеют одинаковый provides-массив', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DEPS, 'multi_ns.deps.js'), 'utf8');
    const entries = parseDepsFile(content, BASE_DIR);
    for (const e of entries) {
      expect(e.provides).toEqual(['myapp.Alpha', 'myapp.Beta', 'myapp.Gamma']);
    }
  });

  it('определяет moduleType=goog по 4-му параметру', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DEPS, 'goog_module.deps.js'), 'utf8');
    const entries = parseDepsFile(content, BASE_DIR);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e.moduleType).toBe('goog');
    }
  });

  it('поддерживает двойные кавычки в 4-м параметре', () => {
    const content = 'goog.addDependency(\'m.js\', [\'ns.A\'], [], {"module": "goog"});';
    const entries = parseDepsFile(content, BASE_DIR);
    expect(entries[0].moduleType).toBe('goog');
  });

  it('срезает query-строку из пути', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DEPS, 'with_query.deps.js'), 'utf8');
    const entries = parseDepsFile(content, BASE_DIR);
    for (const e of entries) {
      expect(e.filePath).not.toContain('?');
    }
  });

  it('путь с query-строкой резолвится корректно', () => {
    const content = "goog.addDependency('lazy/x.js?hash=abc', ['ns.X'], []);";
    const entries = parseDepsFile(content, BASE_DIR);
    expect(entries[0].filePath).toBe(path.resolve(BASE_DIR, 'lazy/x.js'));
  });

  it('возвращает пустой массив для пустого файла', () => {
    expect(parseDepsFile('', BASE_DIR)).toEqual([]);
  });

  it('игнорирует строки-комментарии и пустые строки', () => {
    const content = '// комментарий\n\n/* блок */\n';
    expect(parseDepsFile(content, BASE_DIR)).toEqual([]);
  });

  it('парсит basic.deps.js и возвращает правильное число записей', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DEPS, 'basic.deps.js'), 'utf8');
    const entries = parseDepsFile(content, BASE_DIR);
    // 3 строки → 3 namespace (каждая с одним provide)
    expect(entries).toHaveLength(3);
  });

  it('резолвит relative path через переданный baseDir', () => {
    const base = '/custom/base';
    const content = "goog.addDependency('sub/file.js', ['ns.Sub'], []);";
    const entries = parseDepsFile(content, base);
    expect(entries[0].filePath).toBe(path.resolve(base, 'sub/file.js'));
  });

  it('повторный вызов с тем же контентом даёт тот же результат (сброс lastIndex)', () => {
    const content = "goog.addDependency('a.js', ['ns.A'], []);";
    const first = parseDepsFile(content, BASE_DIR);
    const second = parseDepsFile(content, BASE_DIR);
    expect(first).toEqual(second);
  });
});
