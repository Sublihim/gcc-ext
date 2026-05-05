// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GclConfig } from '../config/GclConfig';
import { NamespaceIndex } from './NamespaceIndex';
import { parseDepsFile } from './DepsParser';

export class IndexManager implements vscode.Disposable {
  readonly index = new NamespaceIndex();

  private readonly statusBar: vscode.StatusBarItem;
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  // Таймер дебаунса — чтобы не переиндексировать при каждом промежуточном сохранении
  private reindexTimer: NodeJS.Timeout | undefined;
  // Флаг: watcher'ы создаются один раз — повторный вызов initialize() не дублирует их
  private watchersSetup = false;

  constructor(
    private readonly config: GclConfig,
    private readonly channel: vscode.OutputChannel,
  ) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.statusBar.command = 'gcl.showStats';
    this.statusBar.show();
  }

  async initialize(): Promise<void> {
    this.statusBar.text = '$(sync~spin) GCL: индексирование...';
    this.statusBar.tooltip = 'Google Closure Library: indexing deps.js';
    this.reindex();
    if (!this.watchersSetup) {
      this.setupWatchers();
      this.watchersSetup = true;
    }
  }

  private reindex(): void {
    this.index.clear();
    // closure-library грузится первой — записи проекта перекрывают её при коллизии неймспейсов
    // Пути в closure-library deps.js относительны от googBaseDir (директория base.js)
    this.loadDepsFile(this.config.closureLibraryDeps, 'closure-library', this.config.googBaseDir);
    // Пути в проектном deps.js относительны от depsRoot (корень проекта)
    this.loadDepsFile(this.config.depsFile, 'project', this.config.depsRoot);
    const count = this.index.size();
    this.statusBar.text = `$(symbol-namespace) GCL: ${count} ns`;
    this.statusBar.tooltip = `Google Closure Library: ${count} namespaces indexed`;
  }

  private loadDepsFile(filePath: string, label: string, baseDir: string): void {
    if (!fs.existsSync(filePath)) {
      this.channel.appendLine(`[warn] deps.js not found (${label}): ${filePath}`);
      return;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const entries = parseDepsFile(content, baseDir);
      for (const entry of entries) {
        this.index.add(entry);
      }
      this.channel.appendLine(`[info] loaded ${entries.length} entries from ${label} deps.js`);
    } catch (err) {
      this.channel.appendLine(`[error] failed to parse ${label} deps.js: ${err}`);
    }
  }

  private setupWatchers(): void {
    this.watchFile(this.config.depsFile);
    this.watchFile(this.config.closureLibraryDeps);
  }

  private watchFile(filePath: string): void {
    if (!fs.existsSync(path.dirname(filePath))) return;

    // RelativePattern с Uri.file() вместо строкового glob — единственный способ
    // следить за файлами вне workspace (closure-library лежит рядом с проектом)
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(filePath)),
      path.basename(filePath)
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const scheduleReindex = () => {
      // Дебаунс 500 мс: сбрасываем таймер при каждом событии,
      // переиндексируем только после паузы в изменениях
      if (this.reindexTimer) clearTimeout(this.reindexTimer);
      this.reindexTimer = setTimeout(() => this.reindex(), 500);
    };

    watcher.onDidChange(scheduleReindex);
    watcher.onDidCreate(scheduleReindex);
    this.watchers.push(watcher);
  }

  dispose(): void {
    if (this.reindexTimer) clearTimeout(this.reindexTimer);
    this.statusBar.dispose();
    this.watchers.forEach(w => w.dispose());
  }
}
