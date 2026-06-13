// 見込金額ロジックの AIチューニング — 共通型と純ロジック
//
// 対象は既存の自然文ロジック:
//   - 全体ロジック: app_config.key = "mikomiku_prompt"
//   - カテゴリ別ロジック: mikomiku_categories.prompt（大/中カテゴリ）
//
// フロー: マネージャーの自然言語 → AIが propose_change ツールで変更案を提示
//   → UI が before→after を表示 → マネージャーが「適用」→ apply API が DB 反映＋履歴記録。
// AI は直接DBを書き換えない（必ず人間の確認を挟む）。

/** チューニング対象 */
export type TuningTarget = "global" | "category";

/** AI の propose_change ツールが返す入力 */
export interface ProposeChangeInput {
  target: TuningTarget;
  /** target=category のとき必須（mikomiku_categories.id） */
  categoryId?: string;
  /** 変更後のロジック本文 */
  newPrompt: string;
  /** 変更内容の1行サマリー（履歴・確認カード用） */
  summary: string;
}

/** UI に渡す確定前の変更案（before を埋めたもの） */
export interface ChangeProposal {
  target: TuningTarget;
  categoryId: string | null;
  /** 表示用のカテゴリ名（global のときは "全体ロジック"） */
  categoryName: string;
  beforePrompt: string;
  afterPrompt: string;
  summary: string;
}

/** 変更履歴の1行（mikomiku_tuning_log） */
export interface TuningLogRow {
  id: string;
  actor_email: string;
  target: TuningTarget;
  category_id: string | null;
  category_name: string | null;
  before_prompt: string | null;
  after_prompt: string;
  summary: string;
  created_at: string;
}

export const GLOBAL_LABEL = "全体ロジック";
const MAX_PROMPT_LEN = 4000;

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** propose_change の入力を検証する（純関数） */
export function validateProposeInput(
  input: Partial<ProposeChangeInput>,
): ValidationResult {
  if (input.target !== "global" && input.target !== "category") {
    return { ok: false, error: "target は global か category を指定してください" };
  }
  if (input.target === "category" && !input.categoryId) {
    return { ok: false, error: "category の変更には categoryId が必要です" };
  }
  if (typeof input.newPrompt !== "string" || input.newPrompt.trim() === "") {
    return { ok: false, error: "newPrompt（変更後のロジック）が空です" };
  }
  if (input.newPrompt.length > MAX_PROMPT_LEN) {
    return {
      ok: false,
      error: `newPrompt が長すぎます（${MAX_PROMPT_LEN}文字以内）`,
    };
  }
  if (typeof input.summary !== "string" || input.summary.trim() === "") {
    return { ok: false, error: "summary（変更内容の要約）が空です" };
  }
  return { ok: true };
}

/**
 * 検証済み入力 + 現在値(before) + カテゴリ名 から確認用の変更案を組み立てる（純関数）。
 */
export function buildProposal(
  input: ProposeChangeInput,
  beforePrompt: string,
  categoryName: string | null,
): ChangeProposal {
  return {
    target: input.target,
    categoryId: input.target === "category" ? (input.categoryId ?? null) : null,
    categoryName:
      input.target === "global" ? GLOBAL_LABEL : (categoryName ?? "(不明なカテゴリ)"),
    beforePrompt: beforePrompt ?? "",
    afterPrompt: input.newPrompt,
    summary: input.summary,
  };
}

/** 変更案が実質的な変更を含むか（before===after なら no-op） */
export function isNoOp(proposal: ChangeProposal): boolean {
  return proposal.beforePrompt.trim() === proposal.afterPrompt.trim();
}
