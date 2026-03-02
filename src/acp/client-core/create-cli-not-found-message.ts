/**
 * Creates a user-facing error message when kiro-cli cannot be resolved.
 * kiro-cli の解決に失敗した場合のユーザー向けエラーメッセージを生成します。
 *
 * @returns English guidance message with installation URL.
 *          インストール URL を含む英語ガイダンスメッセージ。
 */
export function createCliNotFoundMessage(): string {
  return (
    'kiro-cli was not found. Set `kiro-acp.cliPath` or install kiro-cli.\n' +
    'Installation guide: https://kiro.dev/docs/cli/acp/'
  );
}
