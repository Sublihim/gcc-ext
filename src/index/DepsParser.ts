// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as path from 'path';

export interface NamespaceEntry {
  namespace: string;
  /** Абсолютный путь к JS-файлу */
  filePath: string;
  /** Все неймспейсы, объявленные в этом файле */
  provides: string[];
  /** Все зависимости, требуемые этим файлом */
  requires: string[];
}

// Разбирает строки вида:
//   goog.addDependency('path', ['ns1', ...], ['dep1', ...])
//   goog.addDependency('path', ['ns1'], ['dep1'], {lang: 'es6'})  // 4-й аргумент игнорируется
const DEP_RE =
  /goog\.addDependency\(\s*['"]([^'"]+)['"]\s*,\s*(\[[^\]]*\])\s*,\s*(\[[^\]]*\])/g;

// Извлекает строковые значения из литерала массива: ['foo.Bar', "baz.Qux"] → ['foo.Bar', 'baz.Qux']
const STR_RE = /['"]([^'"]+)['"]/g;

function extractStrings(arrayLiteral: string): string[] {
  const results: string[] = [];
  // Глобальный regex хранит позицию между вызовами — сброс обязателен при повторном использовании
  STR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STR_RE.exec(arrayLiteral)) !== null) {
    results.push(m[1]);
  }
  return results;
}

export function parseDepsFile(content: string, googBaseDir: string): NamespaceEntry[] {
  const entries: NamespaceEntry[] = [];
  // Сброс позиции — DEP_RE с флагом /g запоминает lastIndex между вызовами parseDepsFile
  DEP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = DEP_RE.exec(content)) !== null) {
    // Query-строка после .js? используется для cache-busting при отладочной загрузке — отбрасываем
    const relPath = m[1].replace(/\?.*$/, '');
    const provides = extractStrings(m[2]);
    const requires = extractStrings(m[3]);
    // Путь в deps.js относительный (от googBaseDir), приводим к абсолютному
    const filePath = path.resolve(googBaseDir, relPath);

    // Один файл может объявлять несколько неймспейсов — создаём запись для каждого,
    // потому что индекс ищет по неймспейсу, а не по файлу
    for (const ns of provides) {
      entries.push({ namespace: ns, filePath, provides, requires });
    }
  }

  return entries;
}
