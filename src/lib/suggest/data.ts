// 顧客属性ベースの追加商材サジェストデータ
// 思想：「まず顧客を最適化し、高単価から優先的に狙う」

export type Motivation = "inheritance" | "moving" | "declutter" | "replacement";
export type AgeGroup = "senior70" | "middle50" | "young30" | "teen";

export interface SuggestItem {
  category: string;
  icon: string;
  examples: string[];
  basePriority: 1 | 2 | 3 | 4; // 4=最高単価
  minPrice: number; // 目安最低買取額（円）
  prompt: string; // 現場スタッフ向けトーク例
  searchKeyword: string; // 相場検索用キーワード
}

// 売却動機ごとの優先度ブースト
export const MOTIVATION_BOOST: Record<Motivation, number> = {
  inheritance: 1.5, // 遺品整理：大量・高単価品が出やすい
  moving: 1.3, // 引越し：まとめて手放したい
  declutter: 1.1, // 片付け：時間をかけて整理中
  replacement: 1.0, // 買い換え：特定商品のみ
};

export const MOTIVATION_LABELS: Record<Motivation, { label: string; sub: string; emoji: string }> = {
  inheritance: { label: "遺品整理", sub: "大量・高単価品が出やすい", emoji: "🏠" },
  moving: { label: "引越し", sub: "まとめて手放したい", emoji: "📦" },
  declutter: { label: "片付け", sub: "少しずつ整理中", emoji: "🧹" },
  replacement: { label: "買い換え", sub: "特定商品のみ", emoji: "🔄" },
};

export const AGE_LABELS: Record<AgeGroup, { label: string; sub: string }> = {
  senior70: { label: "60代以上", sub: "貴金属・ブランド・時計が多い" },
  middle50: { label: "40〜50代", sub: "ブランド・カメラ・時計" },
  young30: { label: "20〜30代", sub: "スマホ・PC・ゲーム機" },
  teen: { label: "10代", sub: "ゲーム機・スマホ中心" },
};

// 年齢層別の基本商材リスト
const BASE_SUGGESTIONS: Record<AgeGroup, SuggestItem[]> = {
  senior70: [
    {
      category: "貴金属",
      icon: "💍",
      examples: ["金・プラチナ指輪", "ネックレス", "ブレスレット", "金歯・金貨"],
      basePriority: 4,
      minPrice: 5000,
      prompt: "昔のアクセサリーや使っていない指輪・ネックレスなどはございますか？",
      searchKeyword: "金 指輪 K18",
    },
    {
      category: "ブランドバッグ・財布",
      icon: "👜",
      examples: ["ルイヴィトン", "グッチ", "エルメス", "プラダ"],
      basePriority: 4,
      minPrice: 10000,
      prompt: "昔お使いだったブランドのバッグや財布はございますか？",
      searchKeyword: "ルイヴィトン バッグ 中古",
    },
    {
      category: "高級時計",
      icon: "⌚",
      examples: ["ロレックス", "オメガ", "セイコー クレドール"],
      basePriority: 4,
      minPrice: 20000,
      prompt: "使っていない腕時計はございますか？",
      searchKeyword: "ロレックス 腕時計",
    },
    {
      category: "カメラ・光学機器",
      icon: "📷",
      examples: ["一眼レフ", "フィルムカメラ", "双眼鏡"],
      basePriority: 2,
      minPrice: 5000,
      prompt: "カメラや双眼鏡などはございますか？",
      searchKeyword: "ニコン 一眼レフ 中古",
    },
    {
      category: "骨董・美術品",
      icon: "🏺",
      examples: ["掛け軸", "陶器", "絵画", "切手"],
      basePriority: 2,
      minPrice: 5000,
      prompt: "飾っていた骨董品や美術品はございますか？",
      searchKeyword: "骨董品 掛け軸",
    },
  ],
  middle50: [
    {
      category: "ブランドバッグ・財布",
      icon: "👜",
      examples: ["コーチ", "マイケルコース", "バーバリー"],
      basePriority: 4,
      minPrice: 5000,
      prompt: "使わなくなったブランドのバッグ・財布はありますか？",
      searchKeyword: "コーチ バッグ 中古",
    },
    {
      category: "時計",
      icon: "⌚",
      examples: ["タグホイヤー", "カシオ Gショック高級", "フォッシル"],
      basePriority: 3,
      minPrice: 8000,
      prompt: "使っていない時計はありますか？",
      searchKeyword: "ブランド時計 中古",
    },
    {
      category: "カメラ・レンズ",
      icon: "📷",
      examples: ["ミラーレス", "一眼レフ", "交換レンズ"],
      basePriority: 3,
      minPrice: 8000,
      prompt: "使っていないカメラや交換レンズはありますか？",
      searchKeyword: "ミラーレス カメラ 中古",
    },
    {
      category: "スマートフォン",
      icon: "📱",
      examples: ["iPhone", "Galaxy", "Xperia"],
      basePriority: 3,
      minPrice: 5000,
      prompt: "古いスマートフォンは眠っていませんか？",
      searchKeyword: "iPhone 中古 本体",
    },
    {
      category: "楽器",
      icon: "🎸",
      examples: ["ギター", "エレピ", "管楽器"],
      basePriority: 2,
      minPrice: 8000,
      prompt: "使わなくなった楽器はありますか？",
      searchKeyword: "ギター 中古 エレキ",
    },
  ],
  young30: [
    {
      category: "スマートフォン",
      icon: "📱",
      examples: ["iPhone", "Galaxy", "Pixel"],
      basePriority: 4,
      minPrice: 5000,
      prompt: "使わなくなったスマートフォンはありますか？",
      searchKeyword: "iPhone 中古 本体",
    },
    {
      category: "PC・タブレット",
      icon: "💻",
      examples: ["MacBook", "iPad", "Surface"],
      basePriority: 4,
      minPrice: 8000,
      prompt: "古いPC・タブレットは眠っていませんか？",
      searchKeyword: "MacBook Air 中古",
    },
    {
      category: "ゲーム機",
      icon: "🎮",
      examples: ["PS5", "Nintendo Switch", "Xbox"],
      basePriority: 3,
      minPrice: 5000,
      prompt: "ゲーム機やソフトはありますか？",
      searchKeyword: "PlayStation5 本体",
    },
    {
      category: "イヤホン・ヘッドホン",
      icon: "🎧",
      examples: ["AirPods", "Sony WF", "Bose QC"],
      basePriority: 3,
      minPrice: 5000,
      prompt: "使っていないイヤホンやヘッドホンはありますか？",
      searchKeyword: "AirPods 中古",
    },
    {
      category: "カメラ",
      icon: "📷",
      examples: ["ミラーレス", "ドローン", "アクションカム"],
      basePriority: 2,
      minPrice: 8000,
      prompt: "カメラ関係はありますか？",
      searchKeyword: "ミラーレス カメラ",
    },
  ],
  teen: [
    {
      category: "ゲーム機・ソフト",
      icon: "🎮",
      examples: ["Switch", "PS5", "3DS", "ゲームソフト"],
      basePriority: 4,
      minPrice: 3000,
      prompt: "使わなくなったゲーム機やソフトはありますか？",
      searchKeyword: "Nintendo Switch 本体",
    },
    {
      category: "スマートフォン",
      icon: "📱",
      examples: ["iPhone", "Android"],
      basePriority: 3,
      minPrice: 5000,
      prompt: "古いスマートフォンはありますか？",
      searchKeyword: "iPhone 中古 本体",
    },
    {
      category: "イヤホン",
      icon: "🎧",
      examples: ["AirPods", "ワイヤレスイヤホン"],
      basePriority: 2,
      minPrice: 3000,
      prompt: "使っていないイヤホンはありますか？",
      searchKeyword: "AirPods 中古",
    },
  ],
};

export interface RankedSuggestItem extends SuggestItem {
  score: number;
  rank: number;
}

/**
 * 顧客属性から優先順位付き商材リストを生成
 */
export function getSuggestions(
  age: AgeGroup,
  motivation: Motivation
): RankedSuggestItem[] {
  const items = BASE_SUGGESTIONS[age];
  const boost = MOTIVATION_BOOST[motivation];

  const ranked = items
    .map((item) => ({
      ...item,
      score: item.basePriority * boost,
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({ ...item, rank: i + 1 }));

  return ranked;
}

// ──────────────────────────────────────────────
// 検索キーワード → 関連追加カテゴリ マッピング
// ──────────────────────────────────────────────
export interface RelatedCategory {
  label: string;
  icon: string;
  searchKeyword: string;
  reason: string; // なぜ一緒に売れるか
}

interface CategoryRule {
  patterns: string[];
  related: RelatedCategory[];
}

export const RELATED_CATEGORY_RULES: CategoryRule[] = [
  {
    patterns: ["iphone", "ipad", "スマートフォン", "スマホ", "galaxy", "pixel", "xperia", "aquos"],
    related: [
      { label: "AirPods", icon: "🎧", searchKeyword: "AirPods 中古", reason: "Apple製品ユーザーに多い" },
      { label: "Apple Watch", icon: "⌚", searchKeyword: "Apple Watch 中古", reason: "セット所有が多い" },
      { label: "iPad・タブレット", icon: "📱", searchKeyword: "iPad 中古", reason: "複数台所有者が多い" },
      { label: "MacBook・PC", icon: "💻", searchKeyword: "MacBook 中古", reason: "Apple製品ユーザー" },
    ],
  },
  {
    patterns: ["ロレックス", "オメガ", "時計", "watch", "腕時計", "タグホイヤー", "セイコー"],
    related: [
      { label: "貴金属・指輪", icon: "💍", searchKeyword: "K18 金 指輪", reason: "時計と一緒に所有が多い" },
      { label: "ブランドバッグ", icon: "👜", searchKeyword: "ルイヴィトン バッグ", reason: "高所得層の共通所有" },
      { label: "他の腕時計", icon: "⌚", searchKeyword: "ブランド時計 中古", reason: "複数本所有者が多い" },
    ],
  },
  {
    patterns: ["ルイヴィトン", "グッチ", "エルメス", "シャネル", "プラダ", "コーチ", "バッグ", "財布"],
    related: [
      { label: "貴金属・指輪", icon: "💍", searchKeyword: "K18 金 指輪", reason: "ブランド品と一緒に所有が多い" },
      { label: "高級時計", icon: "⌚", searchKeyword: "ロレックス 時計", reason: "高所得層の共通所有" },
      { label: "ブランド財布", icon: "👛", searchKeyword: "ルイヴィトン 財布", reason: "バッグと一緒に手放すことが多い" },
    ],
  },
  {
    patterns: ["カメラ", "ニコン", "キヤノン", "ソニー α", "ミラーレス", "一眼", "レンズ", "fujifilm"],
    related: [
      { label: "交換レンズ", icon: "🔭", searchKeyword: "交換レンズ EF 中古", reason: "本体と一緒に手放すことが多い" },
      { label: "ドローン", icon: "🚁", searchKeyword: "DJI ドローン 中古", reason: "撮影好きに多い" },
      { label: "ビデオカメラ", icon: "🎥", searchKeyword: "ソニー ビデオカメラ 中古", reason: "撮影系の複数所有" },
    ],
  },
  {
    patterns: ["ps5", "ps4", "プレステ", "switch", "ゲーム", "xbox", "nintendo", "任天堂", "3ds"],
    related: [
      { label: "ゲームソフト", icon: "💿", searchKeyword: "PS5 ソフト 中古", reason: "本体と一緒に出ることが多い" },
      { label: "スマートフォン", icon: "📱", searchKeyword: "iPhone 中古 本体", reason: "若年層は複数デバイス所有" },
      { label: "イヤホン・ヘッドセット", icon: "🎧", searchKeyword: "ゲーミングヘッドセット", reason: "ゲームユーザーに多い" },
    ],
  },
  {
    patterns: ["macbook", "パソコン", "ノートpc", "surface", "thinkpad", "laptop", "pc"],
    related: [
      { label: "iPad・タブレット", icon: "📱", searchKeyword: "iPad 中古", reason: "PC買い換え時に一緒に出る" },
      { label: "スマートフォン", icon: "📱", searchKeyword: "iPhone 中古", reason: "デバイス一括整理" },
      { label: "外付けモニター", icon: "🖥️", searchKeyword: "外付けモニター 中古", reason: "PC周辺機器" },
    ],
  },
  {
    patterns: ["airpods", "イヤホン", "ヘッドホン", "bose", "sony wh", "sony wf", "jabra", "ゼンハイザー"],
    related: [
      { label: "スマートフォン", icon: "📱", searchKeyword: "iPhone 中古", reason: "イヤホンと一緒に手放すことが多い" },
      { label: "Bluetoothスピーカー", icon: "🔊", searchKeyword: "JBL スピーカー 中古", reason: "オーディオ好きに多い" },
    ],
  },
  {
    patterns: ["金", "プラチナ", "貴金属", "指輪", "ネックレス", "ブレスレット"],
    related: [
      { label: "ブランドバッグ", icon: "👜", searchKeyword: "ルイヴィトン バッグ 中古", reason: "貴金属所有者に多い" },
      { label: "高級時計", icon: "⌚", searchKeyword: "ロレックス 時計", reason: "高所得層の共通所有" },
      { label: "他の貴金属・アクセサリー", icon: "💎", searchKeyword: "K18 ゴールド ネックレス", reason: "複数所有が多い" },
    ],
  },
];

/**
 * 検索キーワードから関連追加カテゴリを取得
 */
export function getRelatedCategories(keyword: string): RelatedCategory[] {
  if (!keyword.trim()) return [];
  const lower = keyword.toLowerCase();
  for (const rule of RELATED_CATEGORY_RULES) {
    if (rule.patterns.some((p) => lower.includes(p.toLowerCase()))) {
      return rule.related;
    }
  }
  return [];
}
