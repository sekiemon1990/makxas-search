import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildMikomikuJudgmentPayload,
  postMikomikuJudgmentToDecisionLedger,
} from "./decision-ledger";
import type { MikomikuEstimate } from "./estimate";
import type { RobustMarketStats } from "./types";
import type { VarianceResult } from "./variance";

const estimate: MikomikuEstimate = {
  mikomiku: 29_765,
  marketMedian: 35_905,
  appliedRatio: 0.829,
  confidence: 86,
  netMedian: 31_000,
  range: { low: 28_000, high: 34_000 },
  bySource: [
    { source: "mercari", count: 39, median: 36_000 },
    { source: "yahoo_auction", count: 47, median: 35_800 },
  ],
  rationale: "test rationale",
  lowConfidence: false,
};

const stats: RobustMarketStats = {
  effectiveCount: 86,
  rawCount: 89,
  median: 35_905,
  trimmedMean: 35_500,
  min: 22_000,
  max: 51_000,
  q1: 34_000,
  q3: 41_000,
  coefficientOfVariation: 0.18,
  bySource: estimate.bySource,
  recencyRatio: 0.9,
  confidence: 86,
};

const variance: VarianceResult = {
  humanEstimate: 60_000,
  aiEstimate: 29_765,
  deltaAmount: 30_235,
  deltaRatio: 1.016,
  verdict: "overvalued",
  isOvervalued: true,
  message: "過大評価の可能性",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildMikomikuJudgmentPayload", () => {
  it("Decision Ledger 用に PII を含まない判断 payload を組み立てる", () => {
    const payload = buildMikomikuJudgmentPayload({
      keyword: "iPhone 13 128GB",
      estimate,
      stats,
      variance,
      actor: "staff-123",
    });

    expect(payload).toEqual({
      domain: "mikomiku",
      what: {
        keyword: "iPhone 13 128GB",
        human_estimate: 60_000,
        ai_objective: 29_765,
        market_median: 35_905,
        sample_size: 86,
        ai_confidence: 86,
      },
      why_source: "mikomiku_variance",
      actor: "staff-123",
      variance: {
        judgement: "overvalued",
        deviation_pct: 101.6,
      },
      needs_confirmation: true,
    });
  });

  it("actor 未指定時は objective パイプライン名にフォールバックする", () => {
    const payload = buildMikomikuJudgmentPayload({
      keyword: "camera",
      estimate,
      stats,
      variance: { ...variance, deltaRatio: 0.12, verdict: "aligned" },
      actor: "",
    });

    expect(payload.actor).toBe("makxas-search:objective-v1");
    expect(payload.needs_confirmation).toBe(false);
  });
});

describe("postMikomikuJudgmentToDecisionLedger", () => {
  it("GATEWAY_SHARED_TOKEN があれば Gateway に POST する", async () => {
    vi.stubEnv("GATEWAY_SHARED_TOKEN", "test-token");
    vi.stubEnv("GATEWAY_BASE_URL", "https://gateway.example.test/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postMikomikuJudgmentToDecisionLedger({
      keyword: "iPhone 13 128GB",
      estimate,
      stats,
      variance,
      actor: "staff-123",
      correlationId: "corr-test",
    });

    expect(result).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.test/v1/judgments");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      "x-correlation-id": "corr-test",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      domain: "mikomiku",
      what: {
        keyword: "iPhone 13 128GB",
        human_estimate: 60_000,
        ai_objective: 29_765,
        market_median: 35_905,
        sample_size: 86,
        ai_confidence: 86,
      },
      variance: {
        judgement: "overvalued",
        deviation_pct: 101.6,
      },
      needs_confirmation: true,
    });
  });

  it("GATEWAY_SHARED_TOKEN 未設定なら本体機能を止めず skip する", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await postMikomikuJudgmentToDecisionLedger({
      keyword: "camera",
      estimate,
      stats,
      variance,
    });

    expect(result).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Gateway エラーは console.error だけで呼び出し元に投げない", async () => {
    vi.stubEnv("GATEWAY_SHARED_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("temporary failure", { status: 503 }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const result = await postMikomikuJudgmentToDecisionLedger({
      keyword: "camera",
      estimate,
      stats,
      variance,
    });

    expect(result).toBe("failed");
    expect(errorSpy).toHaveBeenCalledWith(
      "[mikomiku-decision-ledger] POST failed:",
      503,
      "temporary failure",
    );
  });
});
