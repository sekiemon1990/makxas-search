import { describe, expect, test } from "vitest";

import {
  normalizeProductIdentificationResult,
  normalizeProductIdentificationResults,
} from "./product-identification";

describe("product identification quality signals", () => {
  test("auto-accepts high confidence results with brand, model/barcode evidence, and enough evidence", () => {
    const result = normalizeProductIdentificationResult({
      id: "item-1",
      productName: "Nintendo Switch 有機ELモデル",
      brand: "Nintendo",
      model: "HEG-001",
      keywords: "Nintendo Switch 有機EL HEG-001",
      confidence: "high",
      evidence: ["Nintendo ロゴ", "型番 HEG-001", "本体全体"],
      missingShotTypes: [],
    });

    expect(result.reviewAction).toBe("auto_accept");
    expect(result.qualitySignals.shouldCreateGoldenCase).toBe(false);
  });

  test("requests more photos when low confidence and critical shots are missing", () => {
    const result = normalizeProductIdentificationResult({
      id: "item-2",
      productName: "掃除機",
      confidence: "low",
      evidence: ["本体の一部のみ"],
      missingShotTypes: ["brand_logo", "model_label", "jan_or_barcode"],
    });

    expect(result.reviewAction).toBe("request_more_photos");
    expect(result.qualitySignals.shouldCreateGoldenCase).toBe(true);
    expect(result.qualitySignals.missingCriticalShotCount).toBe(3);
  });

  test("requests more photos for medium confidence results missing multiple critical shots and model evidence", () => {
    const result = normalizeProductIdentificationResult({
      id: "item-3",
      productName: "カメラ",
      confidence: "medium",
      evidence: ["本体全体"],
      missingShotTypes: ["model_label", "jan_or_barcode"],
    });

    expect(result.reviewAction).toBe("request_more_photos");
    expect(result.qualitySignals.hasModelOrBarcodeEvidence).toBe(false);
  });

  test("keeps requested item order and fills missing ids with low-confidence defaults", () => {
    const results = normalizeProductIdentificationResults(
      [{ id: "b", productName: "iPhone", confidence: "medium" }],
      ["a", "b"],
    );

    expect(results.map((item) => item.id)).toEqual(["a", "b"]);
    expect(results[0]?.confidence).toBe("low");
    expect(results[0]?.reviewAction).toBe("request_more_photos");
    expect(results[1]?.reviewAction).toBe("show_candidates");
  });

  test("drops model-returned extra ids that were not requested", () => {
    const results = normalizeProductIdentificationResults(
      [
        { id: "requested", productName: "iPhone", confidence: "medium" },
        { id: "extra", productName: "MacBook", confidence: "high" },
      ],
      ["requested"],
    );

    expect(results.map((item) => item.id)).toEqual(["requested"]);
  });

  test("fills all requested ids with defaults when the model output is not an array", () => {
    const results = normalizeProductIdentificationResults({ id: "bad" }, ["a", "b"]);

    expect(results.map((item) => item.id)).toEqual(["a", "b"]);
    expect(results.every((item) => item.confidence === "low")).toBe(true);
  });

  test("does not treat unrelated english jan words as barcode evidence", () => {
    const result = normalizeProductIdentificationResult({
      id: "janitor",
      productName: "掃除機",
      brand: "Dyson",
      confidence: "high",
      evidence: ["janitor closet photo", "本体全体"],
      missingShotTypes: [],
    });

    expect(result.qualitySignals.hasModelOrBarcodeEvidence).toBe(false);
    expect(result.reviewAction).toBe("show_candidates");
  });

  test("treats JAN code evidence as model or barcode evidence", () => {
    const result = normalizeProductIdentificationResult({
      id: "jan-code",
      productName: "iPhone 15 Pro",
      brand: "Apple",
      confidence: "high",
      evidence: ["JANコード 4549995...", "Apple ロゴ"],
      missingShotTypes: [],
    });

    expect(result.qualitySignals.hasModelOrBarcodeEvidence).toBe(true);
    expect(result.reviewAction).toBe("auto_accept");
  });
});
