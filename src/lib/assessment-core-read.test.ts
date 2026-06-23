import { describe, expect, it, vi } from "vitest";
import {
  buildAssessedAmountReadSql,
  fetchGatewayAssessedAmountRecords,
  normalizeAssessedAmountRows,
} from "./assessment-core-read";

describe("assessment core assessed_amount read", () => {
  it("固定SQLはread-only SELECTでdays/limitを数値に丸める", () => {
    expect(buildAssessedAmountReadSql({ days: 99999, limit: -1 })).toContain(
      "interval '3650 days'",
    );
    expect(buildAssessedAmountReadSql({ days: 30, limit: 20 })).toContain(
      "LIMIT 20",
    );
    expect(buildAssessedAmountReadSql()).not.toContain(";");
  });

  it("Metabase resultをSearchのassessed_amount突合行へ変換する", () => {
    expect(
      normalizeAssessedAmountRows({
        cols: ["project_id", "item_id", "assessed_amount", "contracted_at"],
        rows: [
          {
            project_id: "project-1",
            item_id: "item-1",
            assessed_amount: "32000",
            contracted_at: "2026-06-01T00:00:00Z",
          },
          {
            project_id: "project-2",
            item_id: null,
            assessed_amount: 0,
          },
        ],
      }),
    ).toEqual([
      {
        projectId: "project-1",
        itemId: "item-1",
        assessedAmount: 32_000,
        contractedAt: "2026-06-01T00:00:00Z",
      },
    ]);
  });

  it("PIIらしい列が返ったらfail-closedする", () => {
    expect(() =>
      normalizeAssessedAmountRows({
        cols: ["project_id", "customer_name", "assessed_amount"],
        rows: [],
      }),
    ).toThrow(/likely PII columns/);
  });

  it("token未設定ならskipする", async () => {
    const result = await fetchGatewayAssessedAmountRecords({
      token: "",
      fetchImpl: vi.fn(),
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "gateway_read_token_missing",
      records: [],
    });
  });

  it("Gateway /v1/metabase/query からread-onlyで取得する", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        service: "metabase",
        audit_id: "audit-1",
        result: {
          cols: ["project_id", "item_id", "assessed_amount", "contracted_at"],
          rows: [
            {
              project_id: "project-1",
              item_id: null,
              assessed_amount: 50_000,
              contracted_at: "2026-06-02T00:00:00Z",
            },
          ],
        },
      }),
    );

    const result = await fetchGatewayAssessedAmountRecords({
      baseUrl: "https://gateway.example.test/",
      token: "read-token",
      database: 7,
      days: 45,
      limit: 10,
      fetchImpl,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unexpected skip");
    expect(result.auditId).toBe("audit-1");
    expect(result.records).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.test/v1/metabase/query");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer read-token",
      "x-makxas-caller-app": "makxas-search",
      "x-makxas-source-channel": "adr-0009-phase-b-assessed-amount-read",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      database: 7,
    });
    expect(JSON.parse(String(init.body)).sql).toContain("LIMIT 10");
  });
});
