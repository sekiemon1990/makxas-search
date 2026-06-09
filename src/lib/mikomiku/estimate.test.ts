import { describe, it, expect } from "vitest";
import { estimateMikomiku } from "./estimate";
import { evaluateVariance } from "./variance";
import type { RobustMarketStats } from "./types";

function stats(overrides: Partial<RobustMarketStats> = {}): RobustMarketStats {
  return {
    effectiveCount: 20,
    rawCount: 24,
    median: 10000,
    trimmedMean: 10000,
    min: 8000,
    max: 12000,
    q1: 9000,
    q3: 11000,
    coefficientOfVariation: 0.1,
    bySource: [
      { source: "mercari", count: 12, median: 10000 },
      { source: "yahoo_auction", count: 8, median: 10200 },
    ],
    recencyRatio: 0.8,
    confidence: 85,
    ...overrides,
  };
}

describe("estimateMikomiku", () => {
  it("高信頼度では基準係数に近い見込金額を出す", () => {
    const e = estimateMikomiku(stats({ confidence: 100 }), { baseRatio: 0.85 });
    expect(e.appliedRatio).toBeCloseTo(0.85, 2);
    expect(e.mikomiku).toBe(8500); // 10000 * 0.85
    expect(e.lowConfidence).toBe(false);
  });

  it("低信頼度では係数を下方補正して過大評価を抑える", () => {
    const high = estimateMikomiku(stats({ confidence: 100 }), { baseRatio: 0.85 });
    const low = estimateMikomiku(stats({ confidence: 20 }), { baseRatio: 0.85 });
    expect(low.appliedRatio).toBeLessThan(high.appliedRatio);
    expect(low.mikomiku).toBeLessThan(high.mikomiku);
  });

  it("サンプル僅少は lowConfidence になる", () => {
    const e = estimateMikomiku(stats({ effectiveCount: 2, confidence: 30 }));
    expect(e.lowConfidence).toBe(true);
    expect(e.rationale).toContain("参考値");
  });

  it("手取り中央値は表示相場より低い（手数料控除）", () => {
    const e = estimateMikomiku(stats(), { shipping: "free" });
    expect(e.netMedian).toBeLessThan(e.marketMedian);
  });

  it("netBased では手取り基準で見込金額を出す", () => {
    const display = estimateMikomiku(stats(), { netBased: false });
    const net = estimateMikomiku(stats(), { netBased: true });
    expect(net.mikomiku).toBeLessThan(display.mikomiku);
  });

  it("レンジは q1〜q3 に係数を適用する", () => {
    const e = estimateMikomiku(stats({ confidence: 100 }), { baseRatio: 0.85 });
    expect(e.range.low).toBe(Math.round(9000 * 0.85));
    expect(e.range.high).toBe(Math.round(11000 * 0.85));
  });
});

describe("evaluateVariance", () => {
  it("一致範囲内は aligned", () => {
    const v = evaluateVariance(10500, 10000);
    expect(v.verdict).toBe("aligned");
    expect(v.isOvervalued).toBe(false);
  });

  it("閾値超で過大評価を検出する", () => {
    const v = evaluateVariance(13000, 10000);
    expect(v.verdict).toBe("overvalued");
    expect(v.isOvervalued).toBe(true);
    expect(v.deltaAmount).toBe(3000);
    expect(v.message).toContain("過大評価");
  });

  it("閾値未満で過小評価を検出する", () => {
    const v = evaluateVariance(8000, 10000);
    expect(v.verdict).toBe("undervalued");
    expect(v.isOvervalued).toBe(false);
  });

  it("AI低信頼度は no_reference で判定保留", () => {
    const v = evaluateVariance(15000, 10000, { aiLowConfidence: true });
    expect(v.verdict).toBe("no_reference");
    expect(v.isOvervalued).toBe(false);
  });

  it("AI客観値0は no_reference", () => {
    const v = evaluateVariance(5000, 0);
    expect(v.verdict).toBe("no_reference");
  });
});
