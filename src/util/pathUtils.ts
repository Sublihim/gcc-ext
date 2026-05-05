// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as path from 'path';
import * as vscode from 'vscode';

export function toUri(absolutePath: string): vscode.Uri {
  return vscode.Uri.file(absolutePath);
}

export function toRelative(absolutePath: string, base: string): string {
  return path.relative(base, absolutePath);
}
