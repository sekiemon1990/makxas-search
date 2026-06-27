import { describe, expect, it } from "vitest";
import {
  buildAssessmentPhaseBLoopReport,
  fetchAssessmentPhaseBLoopReport,
} from "./assessment-phase-b-loop";

describe("assessment phase b closed loop", () => {
  it("Decision Ledger提案とassessed_amountを突合して月次レポートを作る", () => {
    const report = buildAssessmentPhaseBLoopReport({
      generatedAt: "2026-06-23T00:00:00.000Z",
      windowDays: 31,
      ledgerLimit: 100,
      assessedLimit: 100,
      decisionLedger: {
        status: "ok",
        domain: "assessment_price_suggestion",
        totalRecords: 2,
        usableRecords: 2,
        skippedRecords: 0,
        metrics: {
          total: 2,
          accepted: 1,
          rejected: 1,
          adoptionRatePct: 50,
          acceptedSuggestedTotal: 100000,
        },
        sourcePointers: ["gateway:decision_ledger:judgment-1"],
      },
      assessedAmount: {
        status: "ok",
        database: 3,
        auditId: "audit-1",
        records: [
          {
            projectId: "project-1",
            itemId: null,
            assessedAmount: 105000,
            contractedAt: "2026-06-22",
          },
          {
            projectId: "project-2",
            itemId: null,
            assessedAmount: 300000,
            contractedAt: "2026-06-22",
          },
        ],
      },
      ledgerRecords: [
        {
          id: "judgment-1",
          domain: "assessment_price_suggestion",
          what: {
            keyword: "洗濯機",
            project_id: "project-1",
            item_id: null,
            recommendation_price: 100000,
            recommendation_rank: "A",
            decision: "accepted",
          },
        },
        {
          id: "judgment-2",
          domain: "assessment_price_suggestion",
          what: {
            keyword: "冷蔵庫",
            project_id: "project-2",
            item_id: null,
            recommendation_price: 200000,
            recommendation_rank: "B",
            decision: "rejected",
          },
        },
      ],
    });

    expect(report.status).toBe("ok");
    expect(report.readiness).toEqual({
      decisionLedgerRead: true,
      assessedAmountRead: true,
      reconciliationConnected: true,
      monthlyJobReady: true,
    });
    expect(report.suggestionCount).toBe(2);
    expect(report.assessedRecordCount).toBe(2);
    expect(report.reconciliation).toMatchObject({
      total: 2,
      adopted: 1,
      notAdopted: 1,
      adoptionRatePct: 50,
    });
    expect(report.reconciledSamples[0]).toMatchObject({
      suggestionId: "judgment-1",
      projectId: "project-1",
      adopted: true,
    });
  });

  it("read tokenが無い環境では止めずにskipとして返す", async () => {
    const report = await fetchAssessmentPhaseBLoopReport({
      generatedAt: "2026-06-23T00:00:00.000Z",
      decisionLedgerToken: "",
      assessedAmountToken: "",
      fetchImpl: async () => {
        throw new Error("fetch should not be called without tokens");
      },
    });

    expect(report.status).toBe("skipped");
    expect(report.decisionLedger).toMatchObject({
      status: "skipped",
      reason: "gateway_read_token_missing",
    });
    expect(report.assessedAmount).toMatchObject({
      status: "skipped",
      reason: "gateway_read_token_missing",
    });
    expect(report.safeNextAction).toBe(
      "configure_gateway_read_tokens_for_search",
    );
  });
});
