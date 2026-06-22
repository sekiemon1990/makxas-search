export type ProductIdentificationConfidence = "high" | "medium" | "low";

export type ProductIdentificationReviewAction =
  | "auto_accept"
  | "show_candidates"
  | "request_more_photos";

export type ProductEvidenceKind =
  | "whole_product"
  | "brand_logo"
  | "model_label"
  | "jan_or_barcode"
  | "accessories"
  | "condition";

export type ProductIdentificationResult = {
  id: string;
  productName: string;
  model: string;
  keywords: string;
  confidence: ProductIdentificationConfidence;
  category: string;
  brand: string;
  evidence: string[];
  missingShotTypes: ProductEvidenceKind[];
  reviewAction: ProductIdentificationReviewAction;
  qualitySignals: {
    hasProductName: boolean;
    hasBrand: boolean;
    hasModelOrBarcodeEvidence: boolean;
    evidenceCount: number;
    missingCriticalShotCount: number;
    shouldCreateGoldenCase: boolean;
  };
};

const EVIDENCE_KINDS: readonly ProductEvidenceKind[] = [
  "whole_product",
  "brand_logo",
  "model_label",
  "jan_or_barcode",
  "accessories",
  "condition",
];

const EVIDENCE_KIND_DESCRIPTIONS: Record<ProductEvidenceKind, string> = {
  whole_product: "商品全体",
  brand_logo: "ブランド/メーカー/ロゴ",
  model_label: "型番ラベル",
  jan_or_barcode: "JANコード/バーコード",
  accessories: "付属品",
  condition: "傷・状態",
};

const CRITICAL_SHOTS = new Set<ProductEvidenceKind>([
  "brand_logo",
  "model_label",
  "jan_or_barcode",
]);

export function buildProductIdentificationPrompt(): string {
  return `以下の商品写真グループを見て、それぞれの商品を特定してください。
各グループにJSONで回答してください。

精度を上げるため、商品名を無理に断定しないでください。
メーカー名・型番・JAN/バーコード・ロゴ・付属品・状態など、写真から読めた根拠を evidence に入れてください。
根拠が足りない場合は missingShotTypes に不足している写真を入れて、confidence は medium または low にしてください。

missingShotTypes は次から選んでください:
${EVIDENCE_KINDS.map((kind) => `- ${kind}: ${EVIDENCE_KIND_DESCRIPTIONS[kind]}`).join("\n")}

フォーマット（JSON配列のみ、前置き不要）:
[
  {
    "id": "<グループID>",
    "productName": "商品の正式名称。曖昧なら代表候補",
    "category": "商品カテゴリ",
    "brand": "メーカー・ブランド。不明なら空文字",
    "model": "型番・容量・世代・バリエーション。不明なら空文字",
    "keywords": "フリマサイト検索用キーワード",
    "confidence": "high/medium/low",
    "evidence": ["写真から読めた根拠を短く列挙"],
    "missingShotTypes": ["brand_logo", "model_label"]
  }
]`;
}

export function normalizeProductIdentificationResults(
  value: unknown,
  requestedIds: readonly string[],
): ProductIdentificationResult[] {
  if (!Array.isArray(value)) {
    return requestedIds.map((id) => normalizeProductIdentificationResult({ id }));
  }

  const normalized = value.map((item) => normalizeProductIdentificationResult(item));
  const byId = new Map(normalized.map((item) => [item.id, item]));
  return requestedIds.map((id) => byId.get(id) ?? normalizeProductIdentificationResult({ id }));
}

export function normalizeProductIdentificationResult(value: unknown): ProductIdentificationResult {
  const record = isRecord(value) ? value : {};
  const id = stringField(record.id, "unknown");
  const confidence = normalizeConfidence(record.confidence);
  const evidence = stringArray(record.evidence);
  const missingShotTypes = normalizeEvidenceKinds(record.missingShotTypes);
  const productName = stringField(record.productName, "");
  const brand = stringField(record.brand, "");
  const model = stringField(record.model, "");
  const qualitySignals = buildQualitySignals({
    productName,
    brand,
    model,
    evidence,
    missingShotTypes,
    confidence,
  });

  return {
    id,
    productName,
    model,
    keywords: stringField(record.keywords, productName),
    confidence,
    category: stringField(record.category, ""),
    brand,
    evidence,
    missingShotTypes,
    reviewAction: deriveReviewAction(confidence, qualitySignals),
    qualitySignals,
  };
}

function buildQualitySignals(input: {
  productName: string;
  brand: string;
  model: string;
  evidence: readonly string[];
  missingShotTypes: readonly ProductEvidenceKind[];
  confidence: ProductIdentificationConfidence;
}): ProductIdentificationResult["qualitySignals"] {
  const missingCriticalShotCount = input.missingShotTypes.filter((kind) => CRITICAL_SHOTS.has(kind)).length;
  const evidenceText = input.evidence.join(" ").toLowerCase();
  const hasModelOrBarcodeEvidence =
    Boolean(input.model.trim()) ||
    evidenceText.includes("型番") ||
    /\bjan(?:コード|バーコード|barcode)?\b/i.test(evidenceText) ||
    evidenceText.includes("バーコード");
  const hasProductName = Boolean(input.productName.trim());
  const hasBrand = Boolean(input.brand.trim());

  return {
    hasProductName,
    hasBrand,
    hasModelOrBarcodeEvidence,
    evidenceCount: input.evidence.length,
    missingCriticalShotCount,
    shouldCreateGoldenCase:
      input.confidence !== "high" ||
      !hasProductName ||
      !hasBrand ||
      !hasModelOrBarcodeEvidence ||
      missingCriticalShotCount > 0,
  };
}

function deriveReviewAction(
  confidence: ProductIdentificationConfidence,
  signals: ProductIdentificationResult["qualitySignals"],
): ProductIdentificationReviewAction {
  if (!signals.hasProductName || confidence === "low") {
    return "request_more_photos";
  }
  if (
    confidence === "high" &&
    signals.hasBrand &&
    signals.hasModelOrBarcodeEvidence &&
    signals.evidenceCount >= 2 &&
    signals.missingCriticalShotCount === 0
  ) {
    return "auto_accept";
  }
  if (signals.missingCriticalShotCount >= 2 && !signals.hasModelOrBarcodeEvidence) {
    return "request_more_photos";
  }
  return "show_candidates";
}

function normalizeConfidence(value: unknown): ProductIdentificationConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeEvidenceKinds(value: unknown): ProductEvidenceKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ProductEvidenceKind =>
    typeof item === "string" && EVIDENCE_KINDS.includes(item as ProductEvidenceKind),
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
