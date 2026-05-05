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

  indexManager = new IndexManager(config);
  await indexManager.initialize();

  const { index } = indexManager;
  const JS_SELECTOR = { language: 'javascript', scheme: 'file' };

  context.subscriptions.push(
    indexManager,

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
      await indexManager?.initialize();
      vscode.window.showInformationMessage(
        `GCL: reindexed, ${index.size()} namespaces`
      );
    }),

    vscode.commands.registerCommand('gcl.generateWorkspace', async () => {
      const uri = generateWorkspaceFile(config);
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

  console.log(`[gcc-ext] activated, ${index.size()} namespaces indexed`);
}

export function deactivate(): void {
  indexManager?.dispose();
  indexManager = undefined;
}
