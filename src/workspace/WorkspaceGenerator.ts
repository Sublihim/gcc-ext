// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { GclConfig } from '../config/GclConfig';

export function generateWorkspaceFile(config: GclConfig): vscode.Uri {
  const workspaceDir = path.dirname(config.workspaceFile);

  // Пути в .code-workspace должны быть относительными от директории самого файла
  const folders = config.folders.map(entry => {
    const rel = path.relative(workspaceDir, entry.path).replace(/\\/g, '/') || '.';
    return entry.name ? { path: rel, name: entry.name } : { path: rel };
  });

  const content = JSON.stringify({ folders, settings: {} }, null, 2);
  fs.writeFileSync(config.workspaceFile, content, 'utf8');

  return vscode.Uri.file(config.workspaceFile);
}
