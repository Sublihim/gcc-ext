// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { NamespaceIndex } from '../index/NamespaceIndex';
import { SymbolCache } from './SymbolCache';
import { SymbolInfo } from './SymbolScanner';

// Максимальная глубина рекурсии по цепочке @extends.
// Защищает от патологических иерархий и циклов, не обнаруженных через visited.
const MAX_INHERITANCE_DEPTH = 20;

/**
 * Ищет @type-аннотацию для поля varName, начиная с файла filePath,
 * затем рекурсивно поднимаясь по всей цепочке @extends.
 *
 * Используется для разрешения типов унаследованных членов: если
 * this.someMember объявлен в базовом классе, а не в текущем файле,
 * функция найдёт его тип, пройдя по всем предкам.
 *
 * Параметр visited хранит уже посещённые filePath — защищает от циклов.
 */
export function resolveReceiverType(
  varName: string,
  filePath: string,
  document: vscode.TextDocument | undefined,
  symbolCache: SymbolCache,
  index: NamespaceIndex,
  visited: Set<string> = new Set(),
  depth: number = 0
): string | undefined {
  if (depth >= MAX_INHERITANCE_DEPTH) return undefined;
  if (visited.has(filePath)) return undefined;
  visited.add(filePath);

  // Ищем @type для varName в текущем файле (typeMap уже кеширован в SymbolCache)
  const typeMap = symbolCache.getTypeMap(filePath, document);
  const found = typeMap.get(varName);
  if (found) return found;

  // Не нашли — идём вверх по цепочке extends всех классов в файле
  const symbols = symbolCache.get(filePath, document);
  for (const [, symInfo] of symbols) {
    if (symInfo.kind !== 'class' && symInfo.kind !== 'constructor') continue;
    if (!symInfo.extends?.length) continue;

    for (const parentName of symInfo.extends) {
      const parentEntry = index.getByNamespace(parentName);
      if (!parentEntry) {
        console.warn('[InheritanceResolver] родительский namespace не найден в индексе:', parentName);
        continue;
      }

      const parentDoc = vscode.workspace.textDocuments.find(
        d => d.uri.fsPath === parentEntry.filePath
      );

      const result = resolveReceiverType(
        varName, parentEntry.filePath, parentDoc,
        symbolCache, index, visited, depth + 1
      );
      if (result) return result;
    }
  }

  return undefined;
}

/**
 * Ищет метод methodName в типе typeName и вверх по цепочке @extends.
 * Не использует @type-аннотации — только ищет prototype/static-ключи в SymbolCache.
 * Параметр visited защищает от циклов в иерархии.
 * Предпочитает kind='method' над 'static' при совпадении обоих ключей.
 */
export function resolveMethodInHierarchy(
  typeName: string,
  methodName: string,
  symbolCache: SymbolCache,
  index: NamespaceIndex,
  visited: Set<string> = new Set(),
  depth: number = 0
): { resolvedType: string; info: SymbolInfo } | undefined {
  if (depth >= MAX_INHERITANCE_DEPTH) return undefined;
  if (visited.has(typeName)) return undefined;
  visited.add(typeName);

  const entry = index.getByNamespace(typeName);
  if (!entry) return undefined;

  const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === entry.filePath);
  const symbols = symbolCache.get(entry.filePath, openDoc);

  const protoKey  = `${typeName}.prototype.${methodName}`;
  const staticKey = `${typeName}.${methodName}`;
  const protoInfo  = symbols.get(protoKey);
  const staticInfo = symbols.get(staticKey);
  // Предпочитаем prototype-метод; static берём только как fallback
  const info = protoInfo ?? staticInfo;
  if (info) return { resolvedType: typeName, info };

  // Поднимаемся по @extends
  const classInfo = symbols.get(typeName);
  if (classInfo?.extends?.length) {
    for (const parent of classInfo.extends) {
      const result = resolveMethodInHierarchy(parent, methodName, symbolCache, index, visited, depth + 1);
      if (result) return result;
    }
  }

  return undefined;
}
