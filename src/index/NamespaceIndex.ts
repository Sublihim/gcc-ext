// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import { NamespaceEntry } from './DepsParser';

export class NamespaceIndex {
  private readonly byNamespace = new Map<string, NamespaceEntry>();
  // Вторичный индекс по файлу — нужен для будущих фич (find references, диагностика)
  private readonly byFile = new Map<string, NamespaceEntry[]>();

  add(entry: NamespaceEntry): void {
    // Запись проекта перекрывает запись closure-library при совпадении неймспейса
    this.byNamespace.set(entry.namespace, entry);

    let list = this.byFile.get(entry.filePath);
    if (!list) {
      list = [];
      this.byFile.set(entry.filePath, list);
    }
    // Оба deps.js могут ссылаться на один файл — защита от дублей в byFile
    if (!list.some(e => e.namespace === entry.namespace)) {
      list.push(entry);
    }
  }

  getByNamespace(ns: string): NamespaceEntry | undefined {
    return this.byNamespace.get(ns);
  }

  getByFile(filePath: string): NamespaceEntry[] {
    return this.byFile.get(filePath) ?? [];
  }

  getAllNamespaces(): string[] {
    return Array.from(this.byNamespace.keys());
  }

  size(): number {
    return this.byNamespace.size;
  }

  clear(): void {
    this.byNamespace.clear();
    this.byFile.clear();
  }
}
