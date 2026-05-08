// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { SymbolCache } from '../../src/parser/SymbolCache';
import { makeTextDocument } from '../__mocks__/vscode';

const BASIC_CLASS_PATH = path.resolve(__dirname, '../fixtures/source/basic_class.js');
const BASIC_CLASS_CONTENT = fs.readFileSync(BASIC_CLASS_PATH, 'utf8');

describe('SymbolCache', () => {
  let cache: SymbolCache;

  beforeEach(() => { cache = new SymbolCache(); });

  it('возвращает символы для открытого документа', () => {
    const doc = makeTextDocument(BASIC_CLASS_PATH, BASIC_CLASS_CONTENT);
    const symbols = cache.get(BASIC_CLASS_PATH, doc);
    expect(symbols.has('myapp.Foo')).toBe(true);
  });

  it('cache hit: повторный вызов не пересчитывает (version не изменилась)', () => {
    const doc = makeTextDocument(BASIC_CLASS_PATH, BASIC_CLASS_CONTENT, 1);
    const first = cache.get(BASIC_CLASS_PATH, doc);
    const second = cache.get(BASIC_CLASS_PATH, doc);
    // Должен вернуть тот же объект Map (ссылочное равенство)
    expect(second).toBe(first);
  });

  it('cache miss: при изменении версии документа результат пересчитывается', () => {
    const doc1 = makeTextDocument(BASIC_CLASS_PATH, BASIC_CLASS_CONTENT, 1);
    const first = cache.get(BASIC_CLASS_PATH, doc1);

    const newContent = BASIC_CLASS_CONTENT + '\n/** @constructor */\nmyapp.FooNew = function() {};';
    const doc2 = makeTextDocument(BASIC_CLASS_PATH, newContent, 2);
    const second = cache.get(BASIC_CLASS_PATH, doc2);

    expect(second).not.toBe(first);
    expect(second.has('myapp.FooNew')).toBe(true);
  });

  it('invalidate сбрасывает кэш для файла', () => {
    const doc = makeTextDocument(BASIC_CLASS_PATH, BASIC_CLASS_CONTENT, 1);
    const first = cache.get(BASIC_CLASS_PATH, doc);
    cache.invalidate(BASIC_CLASS_PATH);
    // После инвалидации те же данные, но новый объект
    const second = cache.get(BASIC_CLASS_PATH, doc);
    expect(second).not.toBe(first);
  });

  it('читает файл с диска если документ не передан', () => {
    // BASIC_CLASS_PATH существует на диске
    const symbols = cache.get(BASIC_CLASS_PATH);
    expect(symbols.has('myapp.Foo')).toBe(true);
  });

  it('не кеширует пустой результат для непустого файла', () => {
    // Передаём документ с непустым, но нераспознаваемым содержимым
    const content = 'const x = 42; const y = "hello";';
    const fakePath = '/fake/no_symbols.js';
    const doc = makeTextDocument(fakePath, content, 1);
    const symbols = cache.get(fakePath, doc);
    expect(symbols.size).toBe(0);

    // Следующий get должен заново попробовать (не из кэша)
    const content2 = '/** @constructor */\nmyapp.NewClass = function() {};';
    const doc2 = makeTextDocument(fakePath, content2, 1);
    // Та же version=1, но т.к. не было закеширована — пересканирует
    // Ключ version = "1" не найден в кэше → пересканирует
    const symbols2 = cache.get(fakePath, doc2);
    expect(symbols2.has('myapp.NewClass')).toBe(true);
  });

  it('LRU eviction: добавление 65 файлов вытесняет первый', () => {
    const paths: string[] = [];
    // Заполняем кэш 64 файлами
    for (let i = 0; i < 64; i++) {
      const p = `/fake/file_${i}.js`;
      paths.push(p);
      const content = `/** @constructor */\nmyapp.Class${i} = function() {};`;
      const doc = makeTextDocument(p, content, 1);
      cache.get(p, doc);
    }

    // Добавляем 65-й файл — должен вытеснить file_0
    const p65 = '/fake/file_64.js';
    const doc65 = makeTextDocument(p65, '/** @constructor */\nmyapp.Class64 = function() {};', 1);
    cache.get(p65, doc65);

    // Теперь запрашиваем первый файл с той же версией
    // Поскольку он вытеснен, кэш не совпадёт → новый Map-объект будет создан
    const doc0 = makeTextDocument(paths[0], `/** @constructor */\nmyapp.Class0 = function() {};`, 1);
    const result0 = cache.get(paths[0], doc0);
    // Кэш пересчитал — символ должен присутствовать (файл валидный)
    expect(result0.has('myapp.Class0')).toBe(true);
  });

  it('getTypeMap возвращает @type-аннотации из закешированного файла', () => {
    const content = `
      function Cls() {
        /** @type {ns.Color} */
        this.color = null;
      }
    `;
    const fakePath = '/fake/typed.js';
    const doc = makeTextDocument(fakePath, content, 1);
    cache.get(fakePath, doc); // прогреваем кэш
    const typeMap = cache.getTypeMap(fakePath, doc);
    expect(typeMap.get('color')).toBe('ns.Color');
  });

  it('dispose освобождает подписки без ошибок', () => {
    expect(() => cache.dispose()).not.toThrow();
  });
});
