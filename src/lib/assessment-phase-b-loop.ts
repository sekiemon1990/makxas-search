import type { AssessmentDecisionLedgerReadResult } from "./assessment-decision-ledger";
import {
  assessmentSuggestionFromDecisionLedgerRecord,
  fetchAssessmentDecisionLedgerRecords,
  summarizeAssessmentDecisionLedgerRecords,
  type GatewayDecisionLedgerRecord,
} from "./assessment-decision-ledger";
import {
  fetchGatewayAssessedAmountRecords,
  type AssessmentCoreReadResult,
} from "./assessment-core-read";
import {
  reconcileAssessmentSuggestionsWithCore,
  summarizeAssessmentReconciliation,
  type AssessmentReconciliationResult,
  type AssessmentReconciliationSummary,
  type AssessmentSuggestionForReconciliation,
  type CoreAssessedAmountRecord,
} from "./assessment-reconciliation";

export type AssessmentPhaseBLoopReadiness = {
  decisionLedgerRead: boolean;
  assessedAmountRead: boolean;
  reconciliationConnected: boolean;
  monthlyJobReady: boolean;
};

export type AssessmentPhaseBLoopReport = {
  status: "ok" | "partial" | "skipped";
  generatedAt: string;
  windowDays: number;
  ledgerLimit: number;
  assessedLimit: number;
  decisionLedger: AssessmentDecisionLedgerReadResult;
  assessedAmount: AssessmentCoreReadResult;
  suggestionCount: number;
  assessedRecordCount: number;
  reconciliation: AssessmentReconciliationSummary;
  reconciledSamples: AssessmentReconciliationResult[];
  readiness: AssessmentPhaseBLoopReadiness;
  piiBoundary: string;
  safeNextAction: string;
};

export type BuildAssessmentPhaseBLoopReportInput = {
  generatedAt?: string;
  windowDays?: number;
  ledgerLimit?: number;
  assessedLimit?: number;
  decisionLedger: AssessmentDecisionLedgerReadResult;
  assessedAmount: AssessmentCoreReadResult;
  ledgerRecords?: GatewayDecisionLedgerRecord[];
  reconciledSampleLimit?: number;
};

export type FetchAssessmentPhaseBLoopReportOptions = {
  generatedAt?: string;
  windowDays?: number;
  ledgerLimit?: number;
  assessedLimit?: number;
  baseUrl?: string;
  decisionLedgerToken?: string;
  assessedAmountToken?: string;
  database?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_WINDOW_DAYS = 31;
const DEFAULT_LEDGER_LIMIT = 500;
const DEFAULT_ASSESSED_LIMIT = 1000;
const DEFAULT_SAMPLE_LIMIT = 10;

function positiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
}

function recordsFromDecisionLedger(
  records: GatewayDecisionLedgerRecord[],
): AssessmentSuggestionForReconciliation[] {
  return records
    .map((record) => assessmentSuggestionFromDecisionLedgerRecord(record))
    .filter(
      (record): record is AssessmentSuggestionForReconciliation =>
        record !== null,
    );
}

function recordsFromAssessedAmount(
  assessedAmount: AssessmentCoreReadResult,
): CoreAssessedAmountRecord[] {
  return assessedAmount.status === "ok" ? assessedAmount.records : [];
}

function statusFromReadiness(readiness: AssessmentPhaseBLoopReadiness): AssessmentPhaseBLoopReport["status"] {
  if (readiness.monthlyJobReady) return "ok";
  if (readiness.decisionLedgerRead || readiness.assessedAmountRead) return "partial";
  return "skipped";
}

function safeNextAction(readiness: AssessmentPhaseBLoopReadiness): string {
  if (readiness.monthlyJobReady) {
    return "monthly_phase_b_loop_ready";
  }
  if (!readiness.decisionLedgerRead && !readiness.assessedAmountRead) {
    return "configure_gateway_read_tokens_for_search";
  }
  if (!readiness.decisionLedgerRead) {
    return "configure_decision_ledger_read_token";
  }
  if (!readiness.assessedAmountRead) {
    return "configure_gateway_assessed_amount_read_token";
  }
  return "collect_matching_project_or_item_ids";
}

export function buildAssessmentPhaseBLoopReport(
  input: BuildAssessmentPhaseBLoopReportInput,
): AssessmentPhaseBLoopReport {
  const windowDays = positiveInteger(
    input.windowDays,
    DEFAULT_WINDOW_DAYS,
    3650,
  );
  const ledgerLimit = positiveInteger(
    input.ledgerLimit,
    DEFAULT_LEDGER_LIMIT,
    5000,
  );
  const assessedLimit = positiveInteger(
    input.assessedLimit,
    DEFAULT_ASSESSED_LIMIT,
    5000,
  );
  const samplesLimit = positiveInteger(
    input.reconciledSampleLimit,
    DEFAULT_SAMPLE_LIMIT,
    100,
  );

  const suggestions =
    input.decisionLedger.status === "ok"
      ? recordsFromDecisionLedger(input.ledgerRecords ?? [])
      : [];
  const assessedRecords = recordsFromAssessedAmount(input.assessedAmount);
  const reconciled = reconcileAssessmentSuggestionsWithCore(
    suggestions,
    assessedRecords,
  );
  const reconciliation = summarizeAssessmentReconciliation(reconciled);
  const readiness = {
    decisionLedgerRead: input.decisionLedger.status === "ok",
    assessedAmountRead: input.assessedAmount.status === "ok",
    reconciliationConnected: reconciliation.total > 0,
    monthlyJobReady:
      input.decisionLedger.status === "ok" &&
      input.assessedAmount.status === "ok",
  };

  return {
    status: statusFromReadiness(readiness),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    windowDays,
    ledgerLimit,
    assessedLimit,
    decisionLedger: input.decisionLedger,
    assessedAmount: input.assessedAmount,
    suggestionCount: suggestions.length,
    assessedRecordCount: assessedRecords.length,
    reconciliation,
    reconciledSamples: reconciled.slice(0, samplesLimit),
    readiness,
    piiBoundary:
      "Decision Ledger what is allowlisted by assessment read guards; Gateway assessed_amount read only uses project_id/item_id/assessed_amount/contracted_at.",
    safeNextAction: safeNextAction(readiness),
  };
}

export async function fetchAssessmentPhaseBLoopReport(
  options: FetchAssessmentPhaseBLoopReportOptions = {},
): Promise<AssessmentPhaseBLoopReport> {
  const windowDays = positiveInteger(
    options.windowDays ?? process.env.ASSESSMENT_PHASE_B_WINDOW_DAYS,
    DEFAULT_WINDOW_DAYS,
    3650,
  );
  const ledgerLimit = positiveInteger(
    options.ledgerLimit ?? process.env.ASSESSMENT_PHASE_B_LEDGER_LIMIT,
    DEFAULT_LEDGER_LIMIT,
    5000,
  );
  const assessedLimit = positiveInteger(
    options.assessedLimit ?? process.env.ASSESSMENT_PHASE_B_ASSESSED_LIMIT,
    DEFAULT_ASSESSED_LIMIT,
    5000,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  const ledgerRecords = await fetchAssessmentDecisionLedgerRecords({
    baseUrl: options.baseUrl,
    token: options.decisionLedgerToken,
    limit: ledgerLimit,
    fetchImpl,
  });
  const decisionLedger: AssessmentDecisionLedgerReadResult =
    ledgerRecords.status === "ok"
      ? summarizeAssessmentDecisionLedgerRecords(ledgerRecords.records)
      : {
          status: "skipped",
          reason: ledgerRecords.reason,
          domain: ledgerRecords.domain,
        };
  const assessedAmount = await fetchGatewayAssessedAmountRecords({
    baseUrl: options.baseUrl,
    token: options.assessedAmountToken,
    database: options.database,
    days: windowDays,
    limit: assessedLimit,
    fetchImpl,
  });

  return buildAssessmentPhaseBLoopReport({
    generatedAt: options.generatedAt,
    windowDays,
    ledgerLimit,
    assessedLimit,
    decisionLedger,
    assessedAmount,
    ledgerRecords: ledgerRecords.status === "ok" ? ledgerRecords.records : [],
  });
}
