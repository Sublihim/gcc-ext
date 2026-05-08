// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import { SymbolInfo, scanSymbols } from './SymbolScanner';
import { resolveTypes } from './TypeResolver';

// Максимальное количество файлов в LRU-кеше.
// 64 достаточно для типичной рабочей сессии и не создаёт давления на память
// даже при файловой базе в тысячи файлов.
const MAX_CACHED_FILES = 64;

interface CacheEntry {
  /** Версия контента: document.version для открытых файлов, mtime для закрытых */
  key: string;
  symbols: Map<string, SymbolInfo>;
  /** Результат resolveTypes: varName → typeName. Кешируется вместе с символами */
  typeMap: Map<string, string>;
}

/**
 * LRU-кеш символов JS-файлов поверх SymbolScanner.
 *
 * Порядок вставки в Map используется как LRU-порядок:
 * при hit запись удаляется и вставляется снова (в конец),
 * при переполнении удаляется первый элемент (самый старый).
 */
export class SymbolCache implements vscode.Disposable {
  private readonly lru = new Map<string, CacheEntry>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    // Инвалидируем при любом изменении текста открытого документа
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        this.invalidate(e.document.uri.fsPath);
      })
    );
  }

  /**
   * Возвращает карту символов для файла.
   * Если передан `document` — использует его in-memory текст (актуален для открытых файлов).
   * Иначе читает с диска и сверяет mtime.
   */
  get(filePath: string, document?: vscode.TextDocument): Map<string, SymbolInfo> {
    // Фаза 1: определяем ключ версии (без чтения контента)
    let key: string;
    if (document) {
      key = String(document.version);
    } else {
      try {
        key = String(fs.statSync(filePath).mtimeMs);
      } catch {
        console.warn('[SymbolCache] не удалось получить stat для файла:', filePath);
        return new Map();
      }
    }

    // Фаза 2: единая проверка кэша
    const cached = this.lru.get(filePath);
    if (cached && cached.key === key) {
      this.touch(filePath, cached);
      return cached.symbols;
    }

    // Фаза 3: читаем контент только при промахе кэша
    let content: string;
    if (document) {
      content = document.getText();
    } else {
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        console.warn('[SymbolCache] не удалось прочитать файл:', filePath);
        return new Map();
      }
    }

    // Пересканируем файл; resolveTypes запускается один раз и кешируется
    const symbols = scanSymbols(content, filePath);
    const typeMap = resolveTypes(content);

    // Не кешируем пустой результат для непустого файла: если парсер ничего не нашёл,
    // следующий вызов повторит сканирование после возможного фикса или перезапуска
    if (symbols.size === 0 && typeMap.size === 0 && content.trim().length > 0) {
      console.warn('[SymbolCache] пустой результат сканирования, файл не закеширован:', filePath);
      return symbols;
    }

    this.set(filePath, { key, symbols, typeMap });
    return symbols;
  }

  /**
   * Возвращает кешированную карту @type-аннотаций для файла.
   * Вызывает get() чтобы убедиться, что запись актуальна.
   */
  getTypeMap(filePath: string, document?: vscode.TextDocument): Map<string, string> {
    this.get(filePath, document);
    return this.lru.get(filePath)?.typeMap ?? new Map();
  }

  invalidate(filePath: string): void {
    this.lru.delete(filePath);
  }

  dispose(): void {
    this.lru.clear();
    for (const d of this.subscriptions) d.dispose();
    this.subscriptions.length = 0;
  }

  /** LRU hit: переставить запись в конец Map */
  private touch(filePath: string, entry: CacheEntry): void {
    this.lru.delete(filePath);
    this.lru.set(filePath, entry);
  }

  /** Добавить/обновить запись, вытеснив самую старую при переполнении */
  private set(filePath: string, entry: CacheEntry): void {
    this.lru.delete(filePath);
    if (this.lru.size >= MAX_CACHED_FILES) {
      // Первый ключ в Map — самый старый (LRU)
      const oldest = this.lru.keys().next().value;
      if (oldest !== undefined) this.lru.delete(oldest);
    }
    this.lru.set(filePath, entry);
  }
}
