/**
 * /api/ai/chat の単体テスト。
 *
 * 管理画面用の AI チャットは service role 経由で管理データを参照できるため、
 * 未ログインの直接 API 呼び出しは Anthropic / DB ツール実行前に 401 で止める。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const {
  mockRequireApiAuth,
  mockEnforceRateLimit,
  mockMessagesCreate,
  mockGetRequestUserId,
  mockLogApiUsage,
  mockCreateServiceClient,
} = vi.hoisted(() => ({
  mockRequireApiAuth: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockMessagesCreate: vi.fn(),
  mockGetRequestUserId: vi.fn(),
  mockLogApiUsage: vi.fn(),
  mockCreateServiceClient: vi.fn(),
}));

vi.mock("@/lib/auth/requireApiAuth", () => ({
  requireApiAuth: mockRequireApiAuth,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock("@/lib/api-cost", () => ({
  getRequestUserId: mockGetRequestUserId,
  logApiUsage: mockLogApiUsage,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mockCreateServiceClient,
}));

vi.mock("@anthropic-ai/sdk", () => {
  const Anthropic = class {
    messages = { create: mockMessagesCreate };
  } as unknown as { new (): unknown };

  return {
    default: Anthropic,
  };
});

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  messages: [{ role: "user", content: "直近の検索状況を教えて" }],
};

describe("/api/ai/chat POST", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    mockRequireApiAuth.mockReset();
    mockEnforceRateLimit.mockReset();
    mockMessagesCreate.mockReset();
    mockGetRequestUserId.mockReset();
    mockLogApiUsage.mockReset();
    mockCreateServiceClient.mockReset();

    mockRequireApiAuth.mockResolvedValue({
      ok: true,
      userId: "u",
      email: "user@example.com",
    });
    mockEnforceRateLimit.mockReturnValue(null);
    mockMessagesCreate.mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 2 },
      content: [{ type: "text", text: "確認しました" }],
    });
    mockGetRequestUserId.mockResolvedValue("test-user");
    mockLogApiUsage.mockReturnValue(undefined);
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("未認証なら 401 を即座に返し Anthropic と service role を呼ばない", async () => {
    mockRequireApiAuth.mockResolvedValue({
      ok: false,
      response: new Response("unauthorized", { status: 401 }),
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq(validBody));

    expect(res.status).toBe(401);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it("管理画面AI用のDB migrationに ai-chat endpoint と feedback_logs が含まれる", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrate-admin-ai-feedback.sql"),
      "utf8",
    );

    expect(sql).toContain("'ai-chat'");
    expect(sql).toContain("create table if not exists public.feedback_logs");
    expect(sql).toContain("alter table public.feedback_logs enable row level security");
  });
});
