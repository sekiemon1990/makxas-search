import { describe, expect, it } from "vitest";
import {
  buildAssessmentAdoptionPayload,
  redactLikelyPersonalInfo,
  summarizeAssessmentAdoptionMetrics,
} from "./assessment-adoption";

describe("assessment adoption payload", () => {
  it("AI査定提案の採用イベントをPII除外のDecision Ledger payloadへ変換する", () => {
    const payload = buildAssessmentAdoptionPayload({
      keyword: "iPhone 13 090-1234-5678",
      productGuess: "山田様 iPhone yamada@example.com",
      projectId: "project-123",
      itemId: "item-456",
      decision: "accepted",
      listingsCount: 34,
      recommendation: {
        rank: "状態B",
        rate: 0.64,
        price: 31_000,
        index: 1,
      },
    });

    expect(payload).toEqual({
      domain: "assessment_price_suggestion",
      what: {
        keyword: "iPhone 13 [redacted_phone]",
        product_guess: "山田様 iPhone [redacted_email]",
        project_id: "project-123",
        item_id: "item-456",
        suggestion_source: "ai_advisor",
        recommendation_rank: "状態B",
        recommendation_price: 31_000,
        recommendation_rate: 0.64,
        recommendation_index: 1,
        decision: "accepted",
        listings_count: 34,
        shared_event: {
          source_system: "makxas-search",
          conversation_id: "ai-advisor-adoption",
          actor: {
            id: "makxas-search:ai-advisor",
            type: "ai",
            label: "AI査定アシスタント",
          },
          tenant_scope: {
            id: "makxas",
            type: "company",
            label: "makxas",
          },
          account_scope: {
            id: "makxas-search",
            type: "tool",
            label: "マクサスサーチ",
          },
          source_ref: {
            type: "ai_advisor_recommendation",
            id: "ai-advisor-recommendation:1",
            label: "AI査定提案",
          },
          usage: null,
          action: "approved",
        },
      },
      why_source: "ai_advisor_recommendation_adoption",
      actor: "makxas-search:ai-advisor",
      confidence: 80,
      needs_confirmation: false,
    });
  });

  it("採用率と採用提案額を集計する", () => {
    const metrics = summarizeAssessmentAdoptionMetrics([
      { decision: "accepted", recommendationPrice: 10_000 },
      { decision: "rejected", recommendationPrice: 20_000 },
      { decision: "accepted", recommendationPrice: 30_000 },
    ]);

    expect(metrics).toEqual({
      total: 3,
      accepted: 2,
      rejected: 1,
      adoptionRatePct: 66.7,
      acceptedSuggestedTotal: 40_000,
    });
  });

  it("メール・電話・郵便番号らしき値を伏せる", () => {
    expect(
      redactLikelyPersonalInfo("test@example.com 03-1234-5678 1410022"),
    ).toBe("[redacted_email] [redacted_phone] [redacted_zip]");
  });
});
