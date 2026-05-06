// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as path from 'path';
import * as fs from 'fs';

export interface FolderEntry {
  path: string;
  name?: string;
}

export interface GclConfig {
  depsFile: string;
  // База для резолва путей в проектном deps.js (gcl.json → depsRoot)
  depsRoot: string;
  closureLibraryRoot: string;
  closureLibraryDeps: string;
  // Директория base.js — все пути в closure-library deps.js заданы относительно неё
  googBaseDir: string;
  externsGlob: string[];
  projectRoot: string;
  workspaceRoot: string;
  // Папки для Multi-root Workspace (gcl.json → folders[])
  folders: FolderEntry[];
  // Путь к генерируемому .code-workspace файлу (рядом с gcl.json)
  workspaceFile: string;
}

export function loadConfig(workspaceRoot: string): GclConfig | null {
  const configPath = path.join(workspaceRoot, 'gcl.json');
  if (!fs.existsSync(configPath)) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }

  const closureLibraryRoot = path.resolve(
    workspaceRoot,
    (raw['closureLibraryRoot'] as string | undefined) ?? '../closure-library'
  );
  // closure/goog/ — это каталог с base.js, от которого отсчитываются
  // относительные пути внутри goog.addDependency(...)
  const googBaseDir = path.join(closureLibraryRoot, 'closure', 'goog');

  // Поддерживаем строку "./path" и объект { path, name }
  const rawFolders = (raw['folders'] as Array<string | { path: string; name?: string }> | undefined) ?? ['.'];
  const folders: FolderEntry[] = rawFolders.map(f => {
    if (typeof f === 'string') {
      return { path: path.resolve(workspaceRoot, f) };
    }
    return { path: path.resolve(workspaceRoot, f.path), name: f.name };
  });

  return {
    depsFile: path.resolve(workspaceRoot, (raw['depsFile'] as string | undefined) ?? './deps.js'),
    depsRoot: path.resolve(workspaceRoot, (raw['depsRoot'] as string | undefined) ?? '.'),
    closureLibraryRoot,
    closureLibraryDeps: path.join(googBaseDir, 'deps.js'),
    googBaseDir,
    externsGlob: (raw['externsGlob'] as string[] | undefined) ?? [],
    projectRoot: path.resolve(workspaceRoot, (raw['projectRoot'] as string | undefined) ?? '.'),
    workspaceRoot,
    folders,
    workspaceFile: path.join(workspaceRoot, 'gcc.code-workspace'),
  };
}
