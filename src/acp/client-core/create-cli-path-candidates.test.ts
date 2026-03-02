import { describe, expect, it } from 'vitest';

import { createCliPathCandidates } from './create-cli-path-candidates';

describe('createCliPathCandidates', () => {
  // 設定パスと which 結果を優先順で返し、最後にホーム配下候補を追加すること
  it('returns configured path then which path then default home path', () => {
    const candidates = createCliPathCandidates(
      '/opt/kiro/bin/kiro-cli',
      '/usr/local/bin/kiro-cli',
      '/Users/tester',
    );

    expect(candidates).toEqual([
      '/opt/kiro/bin/kiro-cli',
      '/usr/local/bin/kiro-cli',
      '/Users/tester/.local/bin/kiro-cli',
    ]);
  });

  // 設定パスや which 結果が空ならデフォルト候補のみを返すこと
  it('falls back to only default path when optional inputs are missing', () => {
    const candidates = createCliPathCandidates(undefined, '', '/home/tester');

    expect(candidates).toEqual(['/home/tester/.local/bin/kiro-cli']);
  });
});
