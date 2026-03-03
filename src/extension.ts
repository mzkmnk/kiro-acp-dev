import * as vscode from 'vscode';
import { homedir } from 'node:os';

import { AcpClient } from './acp/client';
import { ChatViewProvider } from './webview/chat-view-provider';

let acpClient: AcpClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir();

  acpClient = new AcpClient({ cwd: workspaceFolder });
  void acpClient.cleanupStaleProcess();
  const provider = new ChatViewProvider(context.extensionUri, acpClient, workspaceFolder, context);

  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider),
    vscode.commands.registerCommand('kiro-acp.newSession', async () => {
      await provider.createNewSession();
    }),
    vscode.commands.registerCommand('kiro-acp.cancelRequest', () => {
      provider.cancelCurrentRequest();
    }),
  );

  console.log('kiro-acp-dev: activated');
}

export async function deactivate(): Promise<void> {
  if (acpClient) {
    await acpClient.stop();
    acpClient = undefined;
  }

  console.log('kiro-acp-dev: deactivated');
}
