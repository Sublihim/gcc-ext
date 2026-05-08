// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { scanSymbols } from '../../src/parser/SymbolScanner';

const FIXTURES = path.resolve(__dirname, '../fixtures/source');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function scan(name: string) {
  const filePath = path.join(FIXTURES, name);
  return scanSymbols(readFixture(name), filePath);
}

describe('scanSymbols — basic_class.js', () => {
  it('обнаруживает символ myapp.Foo', () => {
    const symbols = scan('basic_class.js');
    expect(symbols.has('myapp.Foo')).toBe(true);
  });

  it('myapp.Foo имеет kind=constructor (из @constructor)', () => {
    const symbols = scan('basic_class.js');
    expect(symbols.get('myapp.Foo')?.kind).toBe('constructor');
  });

  it('goog.inherits добавляет extends в myapp.Foo', () => {
    const symbols = scan('basic_class.js');
    const ext = symbols.get('myapp.Foo')?.extends;
    expect(ext).toBeDefined();
    expect(ext).toContain('goog.events.EventTarget');
  });

  it('обнаруживает прототипный метод getName', () => {
    const symbols = scan('basic_class.js');
    expect(symbols.has('myapp.Foo.prototype.getName')).toBe(true);
  });

  it('prototype.getName имеет kind=method', () => {
    const symbols = scan('basic_class.js');
    expect(symbols.get('myapp.Foo.prototype.getName')?.kind).toBe('method');
  });

  it('обнаруживает статический метод staticHelper', () => {
    const symbols = scan('basic_class.js');
    expect(symbols.has('myapp.Foo.staticHelper')).toBe(true);
  });

  it('jsdoc для getName содержит текст комментария', () => {
    const symbols = scan('basic_class.js');
    const jsdoc = symbols.get('myapp.Foo.prototype.getName')?.jsdoc;
    expect(jsdoc).toBeDefined();
    expect(jsdoc).toContain('@return');
  });
});

describe('scanSymbols — inheritance.js', () => {
  it('обнаруживает myapp.Bar с kind=constructor', () => {
    const symbols = scan('inheritance.js');
    expect(symbols.get('myapp.Bar')?.kind).toBe('constructor');
  });

  it('myapp.Bar имеет @extends myapp.Foo', () => {
    const symbols = scan('inheritance.js');
    const ext = symbols.get('myapp.Bar')?.extends;
    expect(ext).toContain('myapp.Foo');
  });

  it('myapp.Bar имеет @implements myapp.ISerializable', () => {
    const symbols = scan('inheritance.js');
    const impl = symbols.get('myapp.Bar')?.implements;
    expect(impl).toContain('myapp.ISerializable');
  });
});

describe('scanSymbols — goog_module.js', () => {
  it('обнаруживает символ Thing (короткое имя в goog.module)', () => {
    const symbols = scan('goog_module.js');
    expect(symbols.has('Thing')).toBe(true);
  });

  it('Thing.prototype.doSomething обнаружен', () => {
    const symbols = scan('goog_module.js');
    expect(symbols.has('Thing.prototype.doSomething')).toBe(true);
  });

  it('Thing.create обнаружен как статический символ', () => {
    const symbols = scan('goog_module.js');
    expect(symbols.has('Thing.create')).toBe(true);
  });
});

describe('scanSymbols — goog_scope.js', () => {
  it('символ внутри goog.scope обнаружен', () => {
    const symbols = scan('goog_scope.js');
    expect(symbols.has('myapp.scoped.Widget')).toBe(true);
  });

  it('prototype.render внутри goog.scope обнаружен', () => {
    const symbols = scan('goog_scope.js');
    expect(symbols.has('myapp.scoped.Widget.prototype.render')).toBe(true);
  });
});

describe('scanSymbols — interface_impl.js', () => {
  it('myapp.ISerializable имеет kind=interface', () => {
    const symbols = scan('interface_impl.js');
    expect(symbols.get('myapp.ISerializable')?.kind).toBe('interface');
  });

  it('myapp.JsonSerializer имеет kind=constructor', () => {
    const symbols = scan('interface_impl.js');
    expect(symbols.get('myapp.JsonSerializer')?.kind).toBe('constructor');
  });

  it('myapp.JsonSerializer implements myapp.ISerializable', () => {
    const symbols = scan('interface_impl.js');
    const impl = symbols.get('myapp.JsonSerializer')?.implements;
    expect(impl).toContain('myapp.ISerializable');
  });

  it('myapp.ISerializable.prototype.serialize обнаружен', () => {
    const symbols = scan('interface_impl.js');
    expect(symbols.has('myapp.ISerializable.prototype.serialize')).toBe(true);
  });
});

describe('scanSymbols — enums.js', () => {
  it('обнаруживает myapp.TypesEnum', () => {
    const symbols = scan('enums.js');
    expect(symbols.has('myapp.TypesEnum')).toBe(true);
  });

  it('myapp.TypesEnum имеет kind=enum', () => {
    const symbols = scan('enums.js');
    expect(symbols.get('myapp.TypesEnum')?.kind).toBe('enum');
  });

  it('myapp.TypesEnum содержит jsdoc с @enum', () => {
    const symbols = scan('enums.js');
    const jsdoc = symbols.get('myapp.TypesEnum')?.jsdoc;
    expect(jsdoc).toBeDefined();
    expect(jsdoc).toContain('@enum');
  });
});

describe('scanSymbols — typedef.js', () => {
  it('обнаруживает myapp.UserType', () => {
    const symbols = scan('typedef.js');
    expect(symbols.has('myapp.UserType')).toBe(true);
  });

  it('myapp.UserType имеет kind=typedef', () => {
    const symbols = scan('typedef.js');
    expect(symbols.get('myapp.UserType')?.kind).toBe('typedef');
  });

  it('jsdoc содержит @typedef', () => {
    const symbols = scan('typedef.js');
    expect(symbols.get('myapp.UserType')?.jsdoc).toContain('@typedef');
  });

  it('inline typedef без goog.provide также распознаётся', () => {
    const content = `
/** @typedef {{x: number, y: number}} */
myapp.Point;
    `;
    const symbols = scanSymbols(content, '/fake/inline.js');
    expect(symbols.get('myapp.Point')?.kind).toBe('typedef');
  });
});

describe('scanSymbols — es5_static.js', () => {
  it('обнаруживает myapp.StaticES5.create', () => {
    const symbols = scan('es5_static.js');
    expect(symbols.has('myapp.StaticES5.create')).toBe(true);
  });

  it('обнаруживает myapp.StaticES5.log', () => {
    const symbols = scan('es5_static.js');
    expect(symbols.has('myapp.StaticES5.log')).toBe(true);
  });

  it('jsdoc для create содержит @return', () => {
    const symbols = scan('es5_static.js');
    expect(symbols.get('myapp.StaticES5.create')?.jsdoc).toContain('@return');
  });

  it('jsdoc для log содержит @param', () => {
    const symbols = scan('es5_static.js');
    expect(symbols.get('myapp.StaticES5.log')?.jsdoc).toContain('@param');
  });
});

describe('scanSymbols — граничные случаи', () => {
  it('пустой файл возвращает пустую Map', () => {
    const symbols = scanSymbols('', '/fake/empty.js');
    expect(symbols.size).toBe(0);
  });

  it('файл без символов возвращает пустую Map', () => {
    const content = '// просто комментарий\nconst x = 42;\n';
    const symbols = scanSymbols(content, '/fake/no_symbols.js');
    // Только примитивное присваивание — символов с функциями нет
    expect(symbols.size).toBe(0);
  });
});
