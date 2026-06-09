import { describe, it, expect } from "vitest";
import { computeRobustStats } from "./statistics";
import type { SoldSample } from "./types";

const NOW = new Date("2026-06-09T00:00:00Z");

function sample(
  price: number,
  daysAgo: number,
  source: SoldSample["source"] = "mercari",
): SoldSample {
  const soldAt = new Date(NOW.getTime() - daysAgo * 86400000).toISOString();
  return { source, price, soldAt, title: `item ${price}` };
}

describe("computeRobustStats", () => {
  it("空サンプルは信頼度0の空統計を返す", () => {
    const s = computeRobustStats([], { now: NOW });
    expect(s.effectiveCount).toBe(0);
    expect(s.confidence).toBe(0);
    expect(s.median).toBe(0);
  });

  it("安定したサンプルから中央値を算出する", () => {
    const samples = [
      sample(10000, 5),
      sample(11000, 6),
      sample(10500, 7),
      sample(9500, 8),
      sample(10200, 9),
      sample(9800, 10),
    ];
    const s = computeRobustStats(samples, { now: NOW });
    expect(s.effectiveCount).toBe(6);
    expect(s.median).toBeGreaterThanOrEqual(9800);
    expect(s.median).toBeLessThanOrEqual(10500);
    // ばらつきが小さいので信頼度は高め
    expect(s.confidence).toBeGreaterThan(40);
  });

  it("IQRで極端な外れ値を除去する", () => {
    const base = Array.from({ length: 10 }, (_, i) => sample(10000 + i * 100, i + 1));
    const withOutlier = [...base, sample(500000, 2), sample(10, 3)];
    const s = computeRobustStats(withOutlier, { now: NOW });
    // 外れ値2件が除去され、最大値が現実的な範囲に収まる
    expect(s.max).toBeLessThan(50000);
    expect(s.min).toBeGreaterThan(1000);
    expect(s.effectiveCount).toBeLessThan(withOutlier.length);
  });

  it("古いサンプルを期間フィルタで除外する", () => {
    const recent = [
      sample(10000, 5),
      sample(10200, 6),
      sample(9800, 7),
      sample(10100, 8),
    ];
    const old = [sample(50000, 400), sample(48000, 420)];
    const s = computeRobustStats([...recent, ...old], {
      now: NOW,
      recencyWindowDays: 180,
    });
    expect(s.effectiveCount).toBe(4);
    expect(s.max).toBeLessThan(20000);
  });

  it("全サンプルが期間外なら期間を無視して活かす", () => {
    const old = [sample(10000, 400), sample(10500, 420), sample(9800, 410)];
    const s = computeRobustStats(old, { now: NOW, recencyWindowDays: 180 });
    expect(s.effectiveCount).toBe(3);
    expect(s.median).toBeGreaterThan(0);
  });

  it("媒体別内訳と多様性を反映する", () => {
    const samples = [
      sample(10000, 3, "mercari"),
      sample(10500, 4, "mercari"),
      sample(11000, 5, "yahoo_auction"),
      sample(10800, 6, "yahoo_auction"),
    ];
    const s = computeRobustStats(samples, { now: NOW });
    expect(s.bySource).toHaveLength(2);
    const sources = s.bySource.map((b) => b.source).sort();
    expect(sources).toEqual(["mercari", "yahoo_auction"]);
  });

  it("ばらつきが大きいと信頼度が下がる", () => {
    const tight = Array.from({ length: 12 }, (_, i) => sample(10000 + i * 20, i + 1));
    const loose = [
      sample(2000, 1), sample(18000, 2), sample(5000, 3), sample(15000, 4),
      sample(3000, 5), sample(17000, 6), sample(6000, 7), sample(14000, 8),
      sample(4000, 9), sample(16000, 10), sample(7000, 11), sample(13000, 12),
    ];
    const sTight = computeRobustStats(tight, { now: NOW });
    const sLoose = computeRobustStats(loose, { now: NOW });
    expect(sTight.confidence).toBeGreaterThan(sLoose.confidence);
  });
});
