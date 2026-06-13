import { describe, it, expect } from "vitest";
import {
  validateProposeInput,
  buildProposal,
  isNoOp,
  GLOBAL_LABEL,
} from "./tuning";
import { isAllowedTuner, parseEmailList } from "@/lib/auth/email-allowlist";

describe("validateProposeInput", () => {
  it("正常な全体変更を通す", () => {
    expect(
      validateProposeInput({
        target: "global",
        newPrompt: "中央値の85%",
        summary: "係数を85%に",
      }),
    ).toEqual({ ok: true });
  });

  it("category で categoryId 欠落は弾く", () => {
    const r = validateProposeInput({
      target: "category",
      newPrompt: "x",
      summary: "y",
    });
    expect(r.ok).toBe(false);
  });

  it("newPrompt 空は弾く", () => {
    const r = validateProposeInput({
      target: "global",
      newPrompt: "  ",
      summary: "y",
    });
    expect(r.ok).toBe(false);
  });

  it("summary 空は弾く", () => {
    const r = validateProposeInput({
      target: "global",
      newPrompt: "x",
      summary: "",
    });
    expect(r.ok).toBe(false);
  });

  it("不正な target は弾く", () => {
    const r = validateProposeInput({
      // @ts-expect-error 不正値テスト
      target: "foo",
      newPrompt: "x",
      summary: "y",
    });
    expect(r.ok).toBe(false);
  });
});

describe("buildProposal", () => {
  it("global は categoryName が全体ロジック・categoryId null", () => {
    const p = buildProposal(
      { target: "global", newPrompt: "新ロジック", summary: "更新" },
      "旧ロジック",
      null,
    );
    expect(p.categoryName).toBe(GLOBAL_LABEL);
    expect(p.categoryId).toBeNull();
    expect(p.beforePrompt).toBe("旧ロジック");
    expect(p.afterPrompt).toBe("新ロジック");
  });

  it("category は categoryName/categoryId を保持", () => {
    const p = buildProposal(
      {
        target: "category",
        categoryId: "cat-1",
        newPrompt: "バッグは90%",
        summary: "バッグ係数UP",
      },
      "バッグは85%",
      "ブランドバッグ・財布",
    );
    expect(p.categoryId).toBe("cat-1");
    expect(p.categoryName).toBe("ブランドバッグ・財布");
  });
});

describe("isNoOp", () => {
  it("before===after は no-op", () => {
    const p = buildProposal(
      { target: "global", newPrompt: "  同じ  ", summary: "s" },
      "同じ",
      null,
    );
    expect(isNoOp(p)).toBe(true);
  });
  it("差分ありは no-op でない", () => {
    const p = buildProposal(
      { target: "global", newPrompt: "新", summary: "s" },
      "旧",
      null,
    );
    expect(isNoOp(p)).toBe(false);
  });
});

describe("isAllowedTuner / parseEmailList", () => {
  it("カンマ・空白区切りを正規化", () => {
    expect(parseEmailList("A@x.com, b@y.com\n c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("tuning リストのメールを許可", () => {
    expect(isAllowedTuner("mgr@makxas.com", "mgr@makxas.com", "")).toBe(true);
  });

  it("admin リストのメールも許可（大文字小文字無視）", () => {
    expect(isAllowedTuner("Boss@Makxas.com", "", "boss@makxas.com")).toBe(true);
  });

  it("どちらにも無いメールは拒否", () => {
    expect(isAllowedTuner("x@makxas.com", "mgr@makxas.com", "boss@makxas.com")).toBe(
      false,
    );
  });

  it("email 未設定は拒否", () => {
    expect(isAllowedTuner(null, "a@x.com", "b@y.com")).toBe(false);
  });
});
