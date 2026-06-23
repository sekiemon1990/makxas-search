export type AssessmentSuggestionForReconciliation = {
  suggestionId: string;
  keyword: string;
  projectId?: string | null;
  itemId?: string | null;
  recommendedPrice: number;
  recommendedRank?: string;
  lowerBound?: number;
  upperBound?: number;
};

export type CoreAssessedAmountRecord = {
  projectId: string;
  itemId?: string | null;
  assessedAmount: number;
  contractedAt?: string | null;
};

export type AssessmentReconciliationResult = {
  suggestionId: string;
  projectId: string;
  itemId: string | null;
  suggestedPrice: number;
  assessedAmount: number;
  lowerBound: number;
  upperBound: number;
  adopted: boolean;
  deviationPct: number;
};

export type AssessmentReconciliationSummary = {
  total: number;
  adopted: number;
  notAdopted: number;
  adoptionRatePct: number;
  averageAbsDeviationPct: number;
};

const DEFAULT_TOLERANCE = 0.1;

function positiveInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function suggestionBounds(
  suggestion: AssessmentSuggestionForReconciliation,
  tolerance = DEFAULT_TOLERANCE,
): { lowerBound: number; upperBound: number } {
  const price = positiveInteger(suggestion.recommendedPrice);
  const explicitLower = positiveInteger(suggestion.lowerBound);
  const explicitUpper = positiveInteger(suggestion.upperBound);
  if (explicitLower > 0 && explicitUpper >= explicitLower) {
    return { lowerBound: explicitLower, upperBound: explicitUpper };
  }

  return {
    lowerBound: Math.round(price * (1 - tolerance)),
    upperBound: Math.round(price * (1 + tolerance)),
  };
}

export function reconcileAssessmentSuggestion(
  suggestion: AssessmentSuggestionForReconciliation,
  assessed: CoreAssessedAmountRecord,
  tolerance = DEFAULT_TOLERANCE,
): AssessmentReconciliationResult {
  const suggestedPrice = positiveInteger(suggestion.recommendedPrice);
  const assessedAmount = positiveInteger(assessed.assessedAmount);
  const { lowerBound, upperBound } = suggestionBounds(suggestion, tolerance);
  const adopted = assessedAmount >= lowerBound && assessedAmount <= upperBound;
  const deviationPct =
    suggestedPrice === 0
      ? 0
      : Number((((assessedAmount - suggestedPrice) / suggestedPrice) * 100).toFixed(1));

  return {
    suggestionId: suggestion.suggestionId,
    projectId: assessed.projectId,
    itemId: assessed.itemId ?? null,
    suggestedPrice,
    assessedAmount,
    lowerBound,
    upperBound,
    adopted,
    deviationPct,
  };
}

function pointerMatches(
  suggestion: AssessmentSuggestionForReconciliation,
  assessed: CoreAssessedAmountRecord,
): boolean {
  if (suggestion.itemId && assessed.itemId) {
    return suggestion.itemId === assessed.itemId;
  }
  return Boolean(suggestion.projectId && suggestion.projectId === assessed.projectId);
}

export function reconcileAssessmentSuggestionsWithCore(
  suggestions: AssessmentSuggestionForReconciliation[],
  assessedRecords: CoreAssessedAmountRecord[],
  tolerance = DEFAULT_TOLERANCE,
): AssessmentReconciliationResult[] {
  const results: AssessmentReconciliationResult[] = [];
  for (const suggestion of suggestions) {
    const assessed = assessedRecords.find((record) =>
      pointerMatches(suggestion, record),
    );
    if (!assessed) continue;
    results.push(reconcileAssessmentSuggestion(suggestion, assessed, tolerance));
  }
  return results;
}

export function summarizeAssessmentReconciliation(
  results: AssessmentReconciliationResult[],
): AssessmentReconciliationSummary {
  const total = results.length;
  const adopted = results.filter((result) => result.adopted).length;
  const notAdopted = total - adopted;
  const adoptionRatePct =
    total === 0 ? 0 : Number(((adopted / total) * 100).toFixed(1));
  const averageAbsDeviationPct =
    total === 0
      ? 0
      : Number(
          (
            results.reduce(
              (sum, result) => sum + Math.abs(result.deviationPct),
              0,
            ) / total
          ).toFixed(1),
        );

  return {
    total,
    adopted,
    notAdopted,
    adoptionRatePct,
    averageAbsDeviationPct,
  };
}
