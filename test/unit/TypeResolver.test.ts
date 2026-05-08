// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { describe, it, expect } from 'vitest';
import { resolveTypes } from '../../src/parser/TypeResolver';

describe('resolveTypes', () => {
  it('извлекает @type из const-объявления', () => {
    const content = '/** @type {myapp.Foo} */\nconst foo = new myapp.Foo();';
    const types = resolveTypes(content);
    expect(types.get('foo')).toBe('myapp.Foo');
  });

  it('извлекает @type из var-объявления', () => {
    const content = '/** @type {myapp.Bar} */\nvar bar = null;';
    const types = resolveTypes(content);
    expect(types.get('bar')).toBe('myapp.Bar');
  });

  it('извлекает @type из let-объявления', () => {
    const content = '/** @type {myapp.Baz} */\nlet baz;';
    const types = resolveTypes(content);
    expect(types.get('baz')).toBe('myapp.Baz');
  });

  it('извлекает @type из this.field = ... (убирает this.)', () => {
    const content = `
      function MyClass() {
        /** @type {myapp.Color} */
        this.color = null;
      }
    `;
    const types = resolveTypes(content);
    expect(types.get('color')).toBe('myapp.Color');
  });

  it('извлекает несколько аннотаций из одного файла', () => {
    const content = `
      /** @type {ns.TypeA} */
      const a = null;
      function Ctor() {
        /** @type {ns.TypeB} */
        this.b = null;
      }
    `;
    const types = resolveTypes(content);
    expect(types.get('a')).toBe('ns.TypeA');
    expect(types.get('b')).toBe('ns.TypeB');
  });

  it('возвращает пустую Map если @type нет', () => {
    const content = 'const x = 42;\nfunction foo() {}';
    expect(resolveTypes(content).size).toBe(0);
  });

  it('возвращает пустую Map для пустого файла', () => {
    expect(resolveTypes('').size).toBe(0);
  });

  it('трактует @type вне JSDoc-комментария как обычный комментарий', () => {
    // Одиночный /* ... */ без двойной звёздочки не считается JSDoc
    const content = '/* @type {ns.X} */\nconst x = null;';
    // resolveTypes ищет только /** ... */ комментарии
    expect(resolveTypes(content).get('x')).toBeUndefined();
  });

  it('работает внутри вложенных функций', () => {
    const content = `
      myapp.Outer = function() {};
      myapp.Outer.prototype.init = function() {
        /** @type {myapp.Inner} */
        this.inner = null;
      };
    `;
    const types = resolveTypes(content);
    expect(types.get('inner')).toBe('myapp.Inner');
  });
});
