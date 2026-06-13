// メール許可リストの純ロジック（supabase 等に依存しない・テスト容易）。
// 見込金額チューニング権限などのメールベース認可で共用する。

/** カンマ/空白/改行区切りのメールリストを正規化（小文字・trim・空除去） */
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * email が許可リスト（tuning ∪ admin）に含まれるかを判定。
 * どちらのリストも空なら誰も許可しない（安全側）。
 */
export function isAllowedTuner(
  email: string | null | undefined,
  tuningEmailsRaw: string,
  adminEmailsRaw: string,
): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  const allowed = new Set([
    ...parseEmailList(tuningEmailsRaw),
    ...parseEmailList(adminEmailsRaw),
  ]);
  return allowed.has(target);
}
