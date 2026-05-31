// core-rails の成約案件データを集計するロジック
// 思想：「計測対象に追加買取指標を必ず含める」「実データで提案精度を上げる」

import type { ContractedProject, CoreRailsAcceptedItem } from "./client";

// カテゴリキー（src/lib/suggest/data.ts と同じカテゴリ名を使う）
export const CATEGORY_KEYS = [
  "貴金属",
  "ブランドバッグ・財布",
  "高級時計",
  "時計",
  "カメラ・光学機器",
  "カメラ・レンズ",
  "スマートフォン",
  "PC・タブレット",
  "ゲーム機・ソフト",
  "イヤホン・ヘッドホン",
  "楽器",
  "骨董・美術品",
  "ブランド時計",
  "その他",
] as const;

export type Category = (typeof CATEGORY_KEYS)[number];

// カテゴリ判定ルール（優先度順、上から順にマッチ）
const CATEGORY_PATTERNS: { category: Category; patterns: string[] }[] = [
  {
    category: "貴金属",
    patterns: [
      "k18", "k24", "金", "プラチナ", "pt950", "pt900", "ゴールド", "指輪", "リング", "ネックレス", "ブレスレット", "金歯", "金貨", "貴金属",
    ],
  },
  {
    category: "高級時計",
    patterns: [
      "ロレックス", "rolex", "オメガ", "omega", "パテック", "patek", "オーデマ", "audemars", "リシャール", "richard mille", "ブライトリング", "breitling", "iwc", "カルティエ 時計",
    ],
  },
  {
    category: "時計",
    patterns: [
      "セイコー", "seiko", "シチズン", "citizen", "カシオ", "casio", "タグホイヤー", "tag heuer", "腕時計", "watch", "フォッシル", "fossil",
    ],
  },
  {
    category: "ブランドバッグ・財布",
    patterns: [
      "ルイヴィトン", "louis vuitton", "lv ", "グッチ", "gucci", "エルメス", "hermes", "シャネル", "chanel", "プラダ", "prada", "コーチ", "coach", "バーバリー", "burberry", "マイケルコース", "michael kors", "ボッテガ", "bottega", "サンローラン", "saint laurent", "ディオール", "dior", "バッグ", "財布",
    ],
  },
  {
    category: "スマートフォン",
    patterns: [
      "iphone", "アイフォン", "galaxy", "ギャラクシー", "pixel", "ピクセル", "xperia", "エクスペリア", "aquos", "アクオス", "スマートフォン", "スマホ", "android",
    ],
  },
  {
    category: "PC・タブレット",
    patterns: [
      "macbook", "imac", "mac mini", "mac studio", "ipad", "アイパッド", "surface", "サーフェス", "thinkpad", "letsnote", "レッツノート", "vaio", "ノートpc", "ノートパソコン", "デスクトップpc", "タブレット", "chromebook", "クロームブック",
    ],
  },
  {
    category: "ゲーム機・ソフト",
    patterns: [
      "ps5", "ps4", "ps3", "プレステ", "playstation", "プレイステーション", "switch", "スイッチ", "nintendo", "任天堂", "xbox", "wii", "3ds", "ゲーム機", "ゲームソフト",
    ],
  },
  {
    category: "カメラ・レンズ",
    patterns: [
      "ニコン", "nikon", "キヤノン", "canon", "ソニー α", "sony α", "ソニー a7", "sony a7", "ミラーレス", "一眼", "フィルムカメラ", "ライカ", "leica", "fujifilm", "富士フイルム", "オリンパス", "olympus", "ペンタックス", "pentax", "交換レンズ", "カメラレンズ",
    ],
  },
  {
    category: "カメラ・光学機器",
    patterns: [
      "カメラ", "双眼鏡", "望遠鏡", "ビデオカメラ", "ドローン", "dji", "gopro", "アクションカム",
    ],
  },
  {
    category: "イヤホン・ヘッドホン",
    patterns: [
      "airpods", "エアポッズ", "イヤホン", "ヘッドホン", "ヘッドフォン", "bose", "ボーズ", "sony wh", "sony wf", "ソニー wh", "ソニー wf", "jabra", "ゼンハイザー", "sennheiser", "オーディオテクニカ", "audio technica",
    ],
  },
  {
    category: "楽器",
    patterns: [
      "ギター", "guitar", "ベース", "bass", "ピアノ", "piano", "ドラム", "drum", "サックス", "trumpet", "トランペット", "バイオリン", "violin", "シンセサイザー", "synthesizer", "電子ピアノ", "管楽器", "弦楽器",
    ],
  },
  {
    category: "骨董・美術品",
    patterns: [
      "掛け軸", "掛軸", "陶器", "陶磁器", "絵画", "切手", "古銭", "骨董", "美術品", "茶道具", "茶碗", "壺", "彫刻",
    ],
  },
];

/**
 * 商品名からカテゴリを判定する
 */
export function categorizeItemName(name: string): Category {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_PATTERNS) {
    if (rule.patterns.some((p) => lower.includes(p.toLowerCase()))) {
      return rule.category;
    }
  }
  return "その他";
}

// ──────────────────────────────────────────────
// 集計
// ──────────────────────────────────────────────
export interface CategoryStats {
  category: Category;
  count: number;          // 件数
  totalAmount: number;    // 合計買取額
  avgAmount: number;      // 平均買取額
  projectCount: number;   // この商品を含む案件数
}

export interface BackgroundCodeStats {
  backgroundCode: string;
  projectCount: number;
  totalAmount: number;
  categories: CategoryStats[];
}

/**
 * 全体の集計（backgroundCode 別 → カテゴリ別）
 */
export function aggregateProjects(
  projects: ContractedProject[]
): BackgroundCodeStats[] {
  const byCode = new Map<string, ContractedProject[]>();

  for (const p of projects) {
    const code = p.backgroundCode ?? "unknown";
    const arr = byCode.get(code) ?? [];
    arr.push(p);
    byCode.set(code, arr);
  }

  const result: BackgroundCodeStats[] = [];
  for (const [code, codeProjects] of byCode) {
    const categoryMap = new Map<Category, {
      count: number;
      total: number;
      projectIds: Set<string>;
    }>();

    let codeTotalAmount = 0;

    for (const p of codeProjects) {
      const items = p.acceptedItems ?? [];
      for (const item of items) {
        const cat = categorizeItemName(item.name);
        const amount = item.actualAmount ?? 0;
        codeTotalAmount += amount;

        const entry = categoryMap.get(cat) ?? {
          count: 0,
          total: 0,
          projectIds: new Set<string>(),
        };
        entry.count += 1;
        entry.total += amount;
        entry.projectIds.add(p.id);
        categoryMap.set(cat, entry);
      }
    }

    const categories: CategoryStats[] = [];
    for (const [cat, stats] of categoryMap) {
      categories.push({
        category: cat,
        count: stats.count,
        totalAmount: stats.total,
        avgAmount: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
        projectCount: stats.projectIds.size,
      });
    }
    // 平均額が高い順
    categories.sort((a, b) => b.avgAmount - a.avgAmount);

    result.push({
      backgroundCode: code,
      projectCount: codeProjects.length,
      totalAmount: codeTotalAmount,
      categories,
    });
  }

  // 案件数が多い順
  result.sort((a, b) => b.projectCount - a.projectCount);
  return result;
}

/**
 * 商品名のリストから集計（テスト・デバッグ用）
 */
export function aggregateItems(items: CoreRailsAcceptedItem[]): CategoryStats[] {
  const map = new Map<Category, { count: number; total: number }>();
  for (const item of items) {
    const cat = categorizeItemName(item.name);
    const amount = item.actualAmount ?? 0;
    const entry = map.get(cat) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    map.set(cat, entry);
  }
  const arr: CategoryStats[] = [];
  for (const [cat, stats] of map) {
    arr.push({
      category: cat,
      count: stats.count,
      totalAmount: stats.total,
      avgAmount: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
      projectCount: stats.count, // items のみの場合 projectCount は count と同じ
    });
  }
  arr.sort((a, b) => b.avgAmount - a.avgAmount);
  return arr;
}
