import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireApiAuth, mockEnforceRateLimit } = vi.hoisted(() => ({
  mockRequireApiAuth: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/requireApiAuth", () => ({
  requireApiAuth: mockRequireApiAuth,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/ai-advisor/adoption", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  keyword: "iPhone 13",
  productGuess: "iPhone",
  decision: "accepted",
  listingsCount: 24,
  recommendation: {
    rank: "状態B",
    rate: 0.64,
    price: 31_000,
    index: 1,
  },
};

describe("/api/ai-advisor/adoption POST", () => {
  const originalGatewayToken = process.env.GATEWAY_SHARED_TOKEN;
  const originalSearchKey = process.env.MAKXAS_GATEWAY_API_KEY_SEARCH;
  const originalBaseUrl = process.env.GATEWAY_BASE_URL;

  beforeEach(() => {
    mockRequireApiAuth.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireApiAuth.mockResolvedValue({ ok: true, userId: "u" });
    mockEnforceRateLimit.mockReturnValue(null);
    delete process.env.GATEWAY_SHARED_TOKEN;
    delete process.env.MAKXAS_GATEWAY_API_KEY_SEARCH;
    process.env.GATEWAY_BASE_URL = "https://gateway.example.test";
  });

  afterEach(() => {
    process.env.GATEWAY_SHARED_TOKEN = originalGatewayToken;
    process.env.MAKXAS_GATEWAY_API_KEY_SEARCH = originalSearchKey;
    process.env.GATEWAY_BASE_URL = originalBaseUrl;
    vi.unstubAllGlobals();
  });

  it("未認証ならDecision Ledgerへ送らない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockRequireApiAuth.mockResolvedValue({
      ok: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("token未設定なら本体UXを止めずskipする", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    const body = (await res.json()) as { tracked: boolean; reason: string };

    expect(res.status).toBe(200);
    expect(body.tracked).toBe(false);
    expect(body.reason).toBe("gateway_token_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("専用search keyでPIIなし採用イベントをDecision Ledgerへ送る", async () => {
    process.env.MAKXAS_GATEWAY_API_KEY_SEARCH = "search-key";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ ok: true, judgment: { id: "judgment-1" } }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    const body = (await res.json()) as {
      tracked: boolean;
      judgmentId: string;
    };

    expect(res.status).toBe(200);
    expect(body.tracked).toBe(true);
    expect(body.judgmentId).toBe("judgment-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example.test/v1/judgments");
    expect(init.headers).toMatchObject({
      authorization: "Bearer search-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      domain: "assessment_price_suggestion",
      what: {
        keyword: "iPhone 13",
        product_guess: "iPhone",
        recommendation_rank: "状態B",
        recommendation_price: 31_000,
        recommendation_rate: 0.64,
        decision: "accepted",
        listings_count: 24,
      },
      why_source: "ai_advisor_recommendation_adoption",
      actor: "makxas-search:ai-advisor",
      needs_confirmation: false,
    });
  });

  it("入力不足なら400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({ keyword: "x", decision: "accepted" }));
    expect(res.status).toBe(400);
  });
});
