// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

/**
 * Ищет @type-аннотации переменных в тексте документа.
 *
 * Покрывает GCL-паттерны:
 *   /** @type {Ns.Sub.Color} *\/  this.color_ = ...
 *   /** @type {Ns.Sub.Color} *\/  const c = ...
 *   /** @type {Ns.Sub.Color} *\/\nvar c = ...
 *
 * Возвращает Map<varName, typeName>.
 * varName — имя переменной без "this." (например "color_", "c").
 */
export function resolveTypes(content: string): Map<string, string> {
  const result = new Map<string, string>();

  // Ищем блоки /** ... */ непосредственно перед объявлением переменной.
  // Группа 1 — тело комментария, группа 2 — имя переменной.
  const BLOCK_RE = /(\/\*\*[\s\S]*?\*\/)\s*(?:this\.|(?:var|const|let)\s+)?(\w+)/g;
  const AT_TYPE_RE = /@type\s*\{([^}]+)\}/;

  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const comment = m[1];
    const varName = m[2];
    const typeMatch = AT_TYPE_RE.exec(comment);
    if (typeMatch) {
      result.set(varName, typeMatch[1].trim());
    }
  }

  return result;
}
