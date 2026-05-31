/**
 * /api/ai-advisor の単体テスト。
 *
 * - 認可ゲート (requireApiAuth) が呼ばれ、未認証なら 401 を返す
 * - 認証済みなら通常フロー (Anthropic 呼出 + JSON パース) が走る
 * - 入力バリデーション (空 listings 等) が動作する
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRequireApiAuth,
  mockMessagesCreate,
  mockEnforceRateLimit,
  mockLogApiUsage,
  mockGetRequestUserId,
} = vi.hoisted(() => ({
  mockRequireApiAuth: vi.fn(),
  mockMessagesCreate: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockLogApiUsage: vi.fn(),
  mockGetRequestUserId: vi.fn(),
}));

vi.mock("@/lib/auth/requireApiAuth", () => ({
  requireApiAuth: mockRequireApiAuth,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock("@/lib/api-cost", () => ({
  logApiUsage: mockLogApiUsage,
  getRequestUserId: mockGetRequestUserId,
}));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class RateLimitError extends APIError {
    constructor(message: string) {
      super(429, message);
    }
  }
  const Anthropic = class {
    messages = { create: mockMessagesCreate };
  } as unknown as { new (): unknown };
  return {
    default: Object.assign(Anthropic, { APIError, RateLimitError }),
  };
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/ai-advisor", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  keyword: "ルイヴィトン モノグラム",
  listings: [
    { source: "yahoo", title: "ヴィトン財布", price: 12000, endedAt: "2026-05-10" },
    { source: "mercari", title: "LV バッグ", price: 35000, endedAt: "2026-05-12" },
  ],
};

const fakeAdvice = {
  summary: "中古市場の中央値は 2-3 万円帯。",
  recommendations: [
    { rank: "状態S/A", rate: 0.75, price: 18000 },
    { rank: "状態B", rate: 0.6, price: 14000 },
    { rank: "状態C", rate: 0.45, price: 10000 },
    { rank: "状態D", rate: 0.3, price: 7000 },
  ],
  warnings: ["箱・付属品の有無を確認"],
  additionalCategories: [
    {
      category: "貴金属",
      reason: "ブランドバッグ所有者は貴金属も持っていることが多い",
      searchKeyword: "K18 金 指輪",
    },
  ],
};

describe("/api/ai-advisor POST", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    mockRequireApiAuth.mockReset();
    mockMessagesCreate.mockReset();
    mockEnforceRateLimit.mockReset();
    mockLogApiUsage.mockReset();
    mockGetRequestUserId.mockReset();
    mockRequireApiAuth.mockResolvedValue({
      ok: true,
      userId: "u",
      email: "e",
    });
    // rate-limit / api-cost のデフォルト: 何もしない (通常フロー通過)
    mockEnforceRateLimit.mockReturnValue(null);
    mockGetRequestUserId.mockResolvedValue("test-user");
    mockLogApiUsage.mockReturnValue(undefined);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("未認証 → 401 を即座に返し Anthropic は呼ばない", async () => {
    mockRequireApiAuth.mockResolvedValue({
      ok: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("ANTHROPIC_API_KEY 未設定 → 500", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
  });

  it("不正な JSON → 400", async () => {
    const req = new Request("http://localhost/api/ai-advisor", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    const { POST } = await import("./route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("keyword なし → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({ listings: [] }));
    expect(res.status).toBe(400);
  });

  it("listings 空配列 → 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({ keyword: "x", listings: [] }));
    expect(res.status).toBe(400);
  });

  it("正常系: Anthropic が JSON を返す → advice をそのまま返す", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(fakeAdvice) }],
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { advice: typeof fakeAdvice };
    expect(body.advice.summary).toBe(fakeAdvice.summary);
    expect(body.advice.recommendations).toHaveLength(4);
  });

  it("Anthropic が text ブロック無し → 502", async () => {
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502);
  });

  it("Anthropic が JSON 不正テキスト → 502", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
    });
    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502);
  });
});
