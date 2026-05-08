// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { NamespaceEntry } from './DepsParser';

export class NamespaceIndex {
  private readonly byNamespace = new Map<string, NamespaceEntry>();
  // Вторичный индекс по файлу — нужен для find references, диагностики.
  // Внутренняя Map<namespace, entry> даёт O(1) дедупликацию при двойной загрузке deps.js.
  private readonly byFile = new Map<string, Map<string, NamespaceEntry>>();
  // Ленивый кэш отсортированного списка namespace'ов; сбрасывается в add() и clear()
  private sortedCache: string[] | null = null;

  add(entry: NamespaceEntry): void {
    // Запись проекта перекрывает запись closure-library при совпадении namespace
    this.byNamespace.set(entry.namespace, entry);
    this.sortedCache = null;

    let nsMap = this.byFile.get(entry.filePath);
    if (!nsMap) {
      nsMap = new Map();
      this.byFile.set(entry.filePath, nsMap);
    }
    // O(1) защита от дублей — оба deps.js могут ссылаться на один файл
    nsMap.set(entry.namespace, entry);
  }

  getByNamespace(ns: string): NamespaceEntry | undefined {
    return this.byNamespace.get(ns);
  }

  getByFile(filePath: string): NamespaceEntry[] {
    const nsMap = this.byFile.get(filePath);
    return nsMap ? Array.from(nsMap.values()) : [];
  }

  getAllNamespaces(): string[] {
    return Array.from(this.byNamespace.keys());
  }

  /**
   * Возвращает все namespace'ы, начинающиеся с prefix.
   * Использует отсортированный кэш и бинарный поиск — O(log n + k),
   * где k — количество совпадений.
   */
  getNamespacesWithPrefix(prefix: string): string[] {
    if (!prefix) return this.getAllNamespaces();
    const sorted = this.getSorted();

    // Бинарный поиск первого namespace >= prefix
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }

    const result: string[] = [];
    for (let i = lo; i < sorted.length && sorted[i].startsWith(prefix); i++) {
      result.push(sorted[i]);
    }
    return result;
  }

  size(): number {
    return this.byNamespace.size;
  }

  /**
   * Полностью очищает индекс. Вызывать только при полной перегенерации
   * (например, при переиндексации deps.js).
   */
  clear(): void {
    this.byNamespace.clear();
    this.byFile.clear();
    this.sortedCache = null;
  }

  private getSorted(): string[] {
    if (!this.sortedCache) {
      this.sortedCache = Array.from(this.byNamespace.keys()).sort();
    }
    return this.sortedCache;
  }
}
