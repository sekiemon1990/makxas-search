export type AssessmentAdoptionDecision = "accepted" | "rejected";

export type AssessmentRecommendationForAdoption = {
  rank: string;
  price: number;
  rate: number;
  index?: number;
};

export type AssessmentAdoptionInput = {
  keyword: string;
  productGuess?: string;
  decision: AssessmentAdoptionDecision;
  recommendation: AssessmentRecommendationForAdoption;
  listingsCount?: number;
};

export type AssessmentAdoptionPayload = {
  domain: "assessment_price_suggestion";
  what: {
    keyword: string;
    product_guess: string | null;
    suggestion_source: "ai_advisor";
    recommendation_rank: string;
    recommendation_price: number;
    recommendation_rate: number;
    recommendation_index: number | null;
    decision: AssessmentAdoptionDecision;
    listings_count: number;
  };
  why_source: "ai_advisor_recommendation_adoption";
  actor: "makxas-search:ai-advisor";
  confidence: number;
  needs_confirmation: false;
};

export type AssessmentAdoptionMetricInput = {
  decision: AssessmentAdoptionDecision;
  recommendationPrice: number;
};

export type AssessmentAdoptionMetrics = {
  total: number;
  accepted: number;
  rejected: number;
  adoptionRatePct: number;
  acceptedSuggestedTotal: number;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
const ZIP_RE = /\b\d{3}-?\d{4}\b/g;

export function redactLikelyPersonalInfo(value: string): string {
  return value
    .replace(EMAIL_RE, "[redacted_email]")
    .replace(PHONE_RE, "[redacted_phone]")
    .replace(ZIP_RE, "[redacted_zip]")
    .trim();
}

function clampNonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function confidenceFromListingsCount(listingsCount: number): number {
  if (listingsCount >= 30) return 80;
  if (listingsCount >= 10) return 60;
  if (listingsCount > 0) return 40;
  return 20;
}

export function buildAssessmentAdoptionPayload(
  input: AssessmentAdoptionInput,
): AssessmentAdoptionPayload {
  const listingsCount = clampNonNegativeInteger(input.listingsCount);
  const recommendationPrice = clampNonNegativeInteger(input.recommendation.price);
  const recommendationIndex =
    input.recommendation.index === undefined
      ? null
      : clampNonNegativeInteger(input.recommendation.index);

  return {
    domain: "assessment_price_suggestion",
    what: {
      keyword: redactLikelyPersonalInfo(input.keyword),
      product_guess: input.productGuess
        ? redactLikelyPersonalInfo(input.productGuess)
        : null,
      suggestion_source: "ai_advisor",
      recommendation_rank: input.recommendation.rank.trim(),
      recommendation_price: recommendationPrice,
      recommendation_rate: Number(input.recommendation.rate),
      recommendation_index: recommendationIndex,
      decision: input.decision,
      listings_count: listingsCount,
    },
    why_source: "ai_advisor_recommendation_adoption",
    actor: "makxas-search:ai-advisor",
    confidence: confidenceFromListingsCount(listingsCount),
    needs_confirmation: false,
  };
}

export function summarizeAssessmentAdoptionMetrics(
  events: AssessmentAdoptionMetricInput[],
): AssessmentAdoptionMetrics {
  const accepted = events.filter((event) => event.decision === "accepted");
  const rejected = events.filter((event) => event.decision === "rejected");
  const total = accepted.length + rejected.length;
  const adoptionRatePct =
    total === 0 ? 0 : Number(((accepted.length / total) * 100).toFixed(1));

  return {
    total,
    accepted: accepted.length,
    rejected: rejected.length,
    adoptionRatePct,
    acceptedSuggestedTotal: accepted.reduce(
      (sum, event) => sum + clampNonNegativeInteger(event.recommendationPrice),
      0,
    ),
  };
}
