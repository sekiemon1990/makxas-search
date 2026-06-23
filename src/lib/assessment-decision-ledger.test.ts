import { describe, expect, it, vi } from "vitest";
import {
  assessmentMetricFromDecisionLedgerRecord,
  assessmentSuggestionFromDecisionLedgerRecord,
  fetchAssessmentDecisionLedgerRecords,
  fetchAssessmentDecisionLedgerSummary,
  summarizeAssessmentDecisionLedgerRecords,
} from "./assessment-decision-ledger";

describe("assessment decision ledger read model", () => {
  it("Decision Ledger recent rowsをPIIなし採用率メトリクスへ変換する", () => {
    const summary = summarizeAssessmentDecisionLedgerRecords([
      {
        id: "judgment-1",
        domain: "assessment_price_suggestion",
        what: {
          keyword: "iPhone 13",
          recommendation_price: 31_000,
          decision: "accepted",
        },
      },
      {
        id: "judgment-2",
        domain: "assessment_price_suggestion",
        what: {
          keyword: "watch",
          recommendation_price: 20_000,
          decision: "rejected",
        },
      },
      {
        id: "other-1",
        domain: "mikomiku",
        what: { decision: "accepted", recommendation_price: 1 },
      },
    ]);

    expect(summary).toMatchObject({
      status: "ok",
      totalRecords: 3,
      usableRecords: 2,
      skippedRecords: 1,
      metrics: {
        total: 2,
        accepted: 1,
        rejected: 1,
        adoptionRatePct: 50,
        acceptedSuggestedTotal: 31_000,
      },
    });
    expect(summary.sourcePointers).toEqual([
      "gateway:decision_ledger:judgment-1",
      "gateway:decision_ledger:judgment-2",
    ]);
  });

  it("PII/secret系のキーや値が混ざったらfail-closedする", () => {
    expect(() =>
      assessmentMetricFromDecisionLedgerRecord({
        domain: "assessment_price_suggestion",
        what: {
          customer_phone: "090-1234-5678",
          recommendation_price: 31_000,
          decision: "accepted",
        },
      }),
    ).toThrow(/high-risk key/);

    expect(() =>
      assessmentMetricFromDecisionLedgerRecord({
        domain: "assessment_price_suggestion",
        what: {
          keyword: "iPhone 13 090-1234-5678",
          recommendation_price: 31_000,
          decision: "accepted",
        },
      }),
    ).toThrow(/high-risk value/);
  });

  it("Decision Ledger rowをassessed_amount突合用suggestionへ戻す", () => {
    expect(
      assessmentSuggestionFromDecisionLedgerRecord({
        id: "judgment-1",
        domain: "assessment_price_suggestion",
        what: {
          keyword: "iPhone 13",
          project_id: "project-1",
          item_id: "item-1",
          recommendation_rank: "状態B",
          recommendation_price: 31_000,
          decision: "accepted",
        },
      }),
    ).toEqual({
      suggestionId: "judgment-1",
      keyword: "iPhone 13",
      projectId: "project-1",
      itemId: "item-1",
      recommendedRank: "状態B",
      recommendedPrice: 31_000,
    });
  });

  it("read token未設定ならローカルsmokeをskipできる", async () => {
    const result = await fetchAssessmentDecisionLedgerSummary({
      token: "",
      fetchImpl: vi.fn(),
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "gateway_read_token_missing",
      domain: "assessment_price_suggestion",
    });
  });

  it("Gateway recentのraw recordsを突合用に保持する", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        judgments: [
          {
            id: "judgment-1",
            domain: "assessment_price_suggestion",
            what: {
              keyword: "iPhone 13",
              project_id: "project-1",
              recommendation_price: 31_000,
              decision: "accepted",
            },
          },
        ],
      }),
    );

    const result = await fetchAssessmentDecisionLedgerRecords({
      baseUrl: "https://gateway.example.test/",
      token: "read-token",
      limit: 50,
      fetchImpl,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unexpected skip");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("judgment-1");
  });

  it("Gateway recentをread-onlyで取得する", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        judgments: [
          {
            id: "judgment-1",
            domain: "assessment_price_suggestion",
            what: {
              keyword: "iPhone 13",
              recommendation_price: 31_000,
              decision: "accepted",
            },
          },
        ],
      }),
    );

    const result = await fetchAssessmentDecisionLedgerSummary({
      baseUrl: "https://gateway.example.test/",
      token: "read-token",
      limit: 200,
      fetchImpl,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unexpected skip");
    expect(result.metrics.accepted).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://gateway.example.test/v1/judgments/recent?domain=assessment_price_suggestion&limit=100",
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      authorization: "Bearer read-token",
      "x-makxas-caller-app": "makxas-search",
      "x-makxas-source-channel": "adr-0009-phase-b-readonly-reconciliation",
    });
  });
});
