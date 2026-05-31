import { describe, it, expect } from "vitest";
import {
  categorizeItemName,
  aggregateProjects,
  aggregateItems,
} from "./aggregate";
import type { ContractedProject } from "./client";

describe("categorizeItemName", () => {
  it("貴金属を判定する", () => {
    expect(categorizeItemName("金 指輪 K18")).toBe("貴金属");
    expect(categorizeItemName("プラチナ ネックレス")).toBe("貴金属");
    expect(categorizeItemName("K24 ゴールド ブレスレット")).toBe("貴金属");
  });

  it("高級時計を判定する", () => {
    expect(categorizeItemName("ロレックス サブマリーナ")).toBe("高級時計");
    expect(categorizeItemName("OMEGA Speedmaster")).toBe("高級時計");
    expect(categorizeItemName("パテックフィリップ")).toBe("高級時計");
  });

  it("通常時計を判定する", () => {
    expect(categorizeItemName("セイコー アストロン")).toBe("時計");
    expect(categorizeItemName("カシオ Gショック")).toBe("時計");
  });

  it("ブランドバッグを判定する", () => {
    expect(categorizeItemName("ルイヴィトン ネヴァーフル")).toBe("ブランドバッグ・財布");
    expect(categorizeItemName("グッチ 財布")).toBe("ブランドバッグ・財布");
    expect(categorizeItemName("エルメス バーキン")).toBe("ブランドバッグ・財布");
  });

  it("スマートフォンを判定する", () => {
    expect(categorizeItemName("iPhone 15 Pro Max")).toBe("スマートフォン");
    expect(categorizeItemName("Galaxy S24 Ultra")).toBe("スマートフォン");
  });

  it("PC・タブレットを判定する", () => {
    expect(categorizeItemName("MacBook Air M2")).toBe("PC・タブレット");
    expect(categorizeItemName("iPad Pro 11インチ")).toBe("PC・タブレット");
  });

  it("ゲーム機を判定する", () => {
    expect(categorizeItemName("PS5 本体")).toBe("ゲーム機・ソフト");
    expect(categorizeItemName("Nintendo Switch 有機ELモデル")).toBe("ゲーム機・ソフト");
  });

  it("カメラを判定する", () => {
    expect(categorizeItemName("Nikon D850")).toBe("カメラ・レンズ");
    expect(categorizeItemName("SONY α7 IV")).toBe("カメラ・レンズ");
    expect(categorizeItemName("DJI Mavic ドローン")).toBe("カメラ・光学機器");
  });

  it("イヤホンを判定する", () => {
    expect(categorizeItemName("AirPods Pro 2")).toBe("イヤホン・ヘッドホン");
    expect(categorizeItemName("Bose QuietComfort")).toBe("イヤホン・ヘッドホン");
  });

  it("楽器を判定する", () => {
    expect(categorizeItemName("Fender ストラトキャスター ギター")).toBe("楽器");
    expect(categorizeItemName("ヤマハ 電子ピアノ")).toBe("楽器");
  });

  it("骨董を判定する", () => {
    expect(categorizeItemName("掛け軸 山水画")).toBe("骨董・美術品");
    expect(categorizeItemName("古銭 江戸時代")).toBe("骨董・美術品");
  });

  it("マッチしないものはその他", () => {
    expect(categorizeItemName("謎の物体")).toBe("その他");
    expect(categorizeItemName("")).toBe("その他");
  });
});

describe("aggregateItems", () => {
  it("カテゴリ別に集計する", () => {
    const items = [
      { name: "iPhone 15", actualAmount: 80000, prospectedAmount: null, grade: null },
      { name: "iPhone 14", actualAmount: 60000, prospectedAmount: null, grade: null },
      { name: "ルイヴィトン バッグ", actualAmount: 150000, prospectedAmount: null, grade: null },
    ];
    const stats = aggregateItems(items);
    const sm = stats.find((s) => s.category === "スマートフォン");
    const bg = stats.find((s) => s.category === "ブランドバッグ・財布");
    expect(sm?.count).toBe(2);
    expect(sm?.totalAmount).toBe(140000);
    expect(sm?.avgAmount).toBe(70000);
    expect(bg?.count).toBe(1);
    expect(bg?.avgAmount).toBe(150000);
  });

  it("平均額が高い順にソートされる", () => {
    const items = [
      { name: "iPhone", actualAmount: 50000, prospectedAmount: null, grade: null },
      { name: "ルイヴィトン", actualAmount: 200000, prospectedAmount: null, grade: null },
      { name: "ロレックス", actualAmount: 1500000, prospectedAmount: null, grade: null },
    ];
    const stats = aggregateItems(items);
    expect(stats[0]?.category).toBe("高級時計");
    expect(stats[1]?.category).toBe("ブランドバッグ・財布");
    expect(stats[2]?.category).toBe("スマートフォン");
  });

  it("actualAmount が null の場合は 0 として集計", () => {
    const items = [
      { name: "iPhone", actualAmount: null, prospectedAmount: null, grade: null },
      { name: "iPhone", actualAmount: 50000, prospectedAmount: null, grade: null },
    ];
    const stats = aggregateItems(items);
    expect(stats[0]?.count).toBe(2);
    expect(stats[0]?.totalAmount).toBe(50000);
    expect(stats[0]?.avgAmount).toBe(25000);
  });
});

describe("aggregateProjects", () => {
  const sampleProjects: ContractedProject[] = [
    {
      id: "p1",
      state: "contracted",
      contractedAt: "2026-05-01",
      thoughts: null,
      methodCode: "visit",
      backgroundCode: "inheritance",
      operator: { name: "山田" },
      department: { code: "tokyo", name: "東京" },
      acceptedItems: [
        { name: "金 指輪 K18", actualAmount: 50000, prospectedAmount: null, grade: null },
        { name: "ルイヴィトン バッグ", actualAmount: 80000, prospectedAmount: null, grade: null },
      ],
    },
    {
      id: "p2",
      state: "contracted",
      contractedAt: "2026-05-02",
      thoughts: null,
      methodCode: "visit",
      backgroundCode: "inheritance",
      operator: { name: "鈴木" },
      department: { code: "tokyo", name: "東京" },
      acceptedItems: [
        { name: "プラチナ ネックレス", actualAmount: 100000, prospectedAmount: null, grade: null },
      ],
    },
    {
      id: "p3",
      state: "contracted",
      contractedAt: "2026-05-03",
      thoughts: null,
      methodCode: "store",
      backgroundCode: "moving",
      operator: { name: "山田" },
      department: { code: "tokyo", name: "東京" },
      acceptedItems: [
        { name: "iPhone 15", actualAmount: 70000, prospectedAmount: null, grade: null },
      ],
    },
  ];

  it("backgroundCode 別にグループ化される", () => {
    const result = aggregateProjects(sampleProjects);
    expect(result).toHaveLength(2);
    const inh = result.find((r) => r.backgroundCode === "inheritance");
    const mv = result.find((r) => r.backgroundCode === "moving");
    expect(inh?.projectCount).toBe(2);
    expect(mv?.projectCount).toBe(1);
  });

  it("案件数が多い順にソートされる", () => {
    const result = aggregateProjects(sampleProjects);
    expect(result[0]?.backgroundCode).toBe("inheritance");
    expect(result[1]?.backgroundCode).toBe("moving");
  });

  it("カテゴリ別の合計額・平均額が正しい", () => {
    const result = aggregateProjects(sampleProjects);
    const inh = result.find((r) => r.backgroundCode === "inheritance");
    const kikinzoku = inh?.categories.find((c) => c.category === "貴金属");
    expect(kikinzoku?.count).toBe(2); // 金 + プラチナ
    expect(kikinzoku?.totalAmount).toBe(150000);
    expect(kikinzoku?.avgAmount).toBe(75000);
    expect(kikinzoku?.projectCount).toBe(2); // p1, p2
  });

  it("backgroundCode が null の場合は 'unknown' にまとめる", () => {
    const projects: ContractedProject[] = [
      {
        id: "p1",
        state: "contracted",
        contractedAt: "2026-05-01",
        thoughts: null,
        methodCode: null,
        backgroundCode: null,
        operator: null,
        department: null,
        acceptedItems: [
          { name: "iPhone", actualAmount: 50000, prospectedAmount: null, grade: null },
        ],
      },
    ];
    const result = aggregateProjects(projects);
    expect(result[0]?.backgroundCode).toBe("unknown");
  });
});
