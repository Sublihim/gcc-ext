// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sublihim. Co-authored with Claude Sonnet 4.6 (Anthropic).

import * as vscode from 'vscode';
import { loadConfig } from './config/GclConfig';
import { IndexManager } from './index/IndexManager';
import { DefinitionProvider } from './providers/DefinitionProvider';
import { CompletionProvider } from './providers/CompletionProvider';
import { HoverProvider } from './providers/HoverProvider';
import { generateWorkspaceFile } from './workspace/WorkspaceGenerator';

let indexManager: IndexManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return;

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const config = loadConfig(workspaceRoot);

  if (!config) {
    console.log('[gcc-ext] gcl.json not found, extension inactive');
    return;
  }

  const channel = vscode.window.createOutputChannel('GCL');
  context.subscriptions.push(channel);

  indexManager = new IndexManager(config, channel);

  try {
    await indexManager.initialize();
  } catch (err) {
    vscode.window.showErrorMessage(`GCL: ошибка инициализации — ${err}`);
    channel.appendLine(`[error] initialize failed: ${err}`);
    return;
  }

  const { index } = indexManager;
  const JS_SELECTOR = { language: 'javascript', scheme: 'file' };

  // Вотчер на gcl.json — предлагаем перезагрузить окно при изменении конфига
  const configPattern = new vscode.RelativePattern(vscode.Uri.file(workspaceRoot), 'gcl.json');
  const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
  const onConfigChange = () => {
    vscode.window.showInformationMessage(
      'GCL: gcl.json изменён. Перезагрузите окно для применения.',
      'Перезагрузить'
    ).then(choice => {
      if (choice === 'Перезагрузить') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
  };
  configWatcher.onDidChange(onConfigChange);
  configWatcher.onDidCreate(onConfigChange);

  context.subscriptions.push(
    indexManager,
    configWatcher,

    vscode.languages.registerDefinitionProvider(JS_SELECTOR, new DefinitionProvider(index)),

    vscode.languages.registerCompletionItemProvider(
      JS_SELECTOR,
      new CompletionProvider(index),
      "'", '"'
    ),

    vscode.languages.registerHoverProvider(JS_SELECTOR, new HoverProvider(index)),

    vscode.commands.registerCommand('gcl.showStats', () => {
      vscode.window.showInformationMessage(
        `GCL Index: ${index.size()} namespaces loaded`
      );
    }),

    vscode.commands.registerCommand('gcl.reindex', async () => {
      try {
        await indexManager?.initialize();
        vscode.window.showInformationMessage(
          `GCL: переиндексировано, ${index.size()} namespaces`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`GCL: ошибка переиндексации — ${err}`);
      }
    }),

    vscode.commands.registerCommand('gcl.generateWorkspace', async () => {
      let uri: vscode.Uri;
      try {
        uri = generateWorkspaceFile(config);
      } catch (err) {
        vscode.window.showErrorMessage(`GCL: не удалось создать workspace файл — ${err}`);
        return;
      }
      // Предлагаем сразу открыть workspace — это перезапустит окно VSCode с multi-root
      const choice = await vscode.window.showInformationMessage(
        `Workspace file created: ${uri.fsPath}`,
        'Open Workspace'
      );
      if (choice === 'Open Workspace') {
        await vscode.commands.executeCommand('vscode.openFolder', uri);
      }
    }),
  );

  channel.appendLine(`[gcc-ext] activated, ${index.size()} namespaces indexed`);
}

export function deactivate(): void {
  indexManager?.dispose();
  indexManager = undefined;
}
