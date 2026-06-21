import { describe, expect, it } from "vitest";
import {
  reconcileAssessmentSuggestion,
  suggestionBounds,
  summarizeAssessmentReconciliation,
} from "./assessment-reconciliation";

describe("assessment reconciliation", () => {
  it("提案額の±10%に最終査定額が入れば採用扱いにする", () => {
    const result = reconcileAssessmentSuggestion(
      {
        suggestionId: "judgment-1",
        keyword: "iPhone 13",
        recommendedRank: "状態B",
        recommendedPrice: 30_000,
      },
      {
        projectId: "project-1",
        itemId: "item-1",
        assessedAmount: 32_000,
      },
    );

    expect(result).toEqual({
      suggestionId: "judgment-1",
      projectId: "project-1",
      itemId: "item-1",
      suggestedPrice: 30_000,
      assessedAmount: 32_000,
      lowerBound: 27_000,
      upperBound: 33_000,
      adopted: true,
      deviationPct: 6.7,
    });
  });

  it("明示レンジがある場合は±10%よりレンジを優先する", () => {
    expect(
      suggestionBounds({
        suggestionId: "judgment-2",
        keyword: "watch",
        recommendedPrice: 100_000,
        lowerBound: 80_000,
        upperBound: 125_000,
      }),
    ).toEqual({ lowerBound: 80_000, upperBound: 125_000 });
  });

  it("採用率と平均乖離率を集計する", () => {
    const results = [
      reconcileAssessmentSuggestion(
        { suggestionId: "a", keyword: "a", recommendedPrice: 10_000 },
        { projectId: "p1", assessedAmount: 10_500 },
      ),
      reconcileAssessmentSuggestion(
        { suggestionId: "b", keyword: "b", recommendedPrice: 20_000 },
        { projectId: "p2", assessedAmount: 30_000 },
      ),
    ];

    expect(summarizeAssessmentReconciliation(results)).toEqual({
      total: 2,
      adopted: 1,
      notAdopted: 1,
      adoptionRatePct: 50,
      averageAbsDeviationPct: 27.5,
    });
  });
});
