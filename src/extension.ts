import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {
  console.log('kiro-acp-dev: activated');
}

export function deactivate() {
  console.log('kiro-acp-dev: deactivated');
}
