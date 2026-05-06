// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { NamespaceIndex } from '../index/NamespaceIndex';
import { SymbolCache } from './SymbolCache';

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
  visited: Set<string> = new Set()
): string | undefined {
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
      if (!parentEntry) continue;

      const parentDoc = vscode.workspace.textDocuments.find(
        d => d.uri.fsPath === parentEntry.filePath
      );

      const result = resolveReceiverType(
        varName, parentEntry.filePath, parentDoc,
        symbolCache, index, visited
      );
      if (result) return result;
    }
  }

  return undefined;
}
