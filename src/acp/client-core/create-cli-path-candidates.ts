import { join } from 'node:path';

/**
 * Builds CLI path candidates in priority order.
 * 優先順位順に CLI パス候補を生成します。
 *
 * @param configuredPath - Path explicitly configured by the user.
 *                         ユーザーが明示設定したパス。
 * @param whichPath - Path discovered by `which kiro-cli`.
 *                    `which kiro-cli` で見つかったパス。
 * @param userHome - Current user home directory.
 *                   現在ユーザーのホームディレクトリ。
 * @returns Candidate list ordered by precedence.
 *          優先順で並べた候補パス配列。
 */
export function createCliPathCandidates(
  configuredPath: string | undefined,
  whichPath: string,
  userHome: string,
): string[] {
  const candidates: string[] = [];

  if (configuredPath) {
    candidates.push(configuredPath);
  }

  if (whichPath) {
    candidates.push(whichPath);
  }

  candidates.push(join(userHome, '.local', 'bin', 'kiro-cli'));
  return candidates;
}
