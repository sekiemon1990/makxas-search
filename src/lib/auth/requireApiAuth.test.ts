/**
 * requireApiAuth の単体テスト。
 *
 * Supabase の createClient をモックして、認証済み / 未認証 / エラー の 3 パターンを確認。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateClient, mockGetUser } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

describe("requireApiAuth", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockGetUser.mockReset();
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    });
  });

  it("認証済みユーザー → ok:true, userId 返却", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: { id: "user-123", email: "staff@example.com" },
      },
      error: null,
    });

    const { requireApiAuth } = await import("./requireApiAuth");
    const result = await requireApiAuth();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user-123");
      expect(result.email).toBe("staff@example.com");
    }
  });

  it("user が null → ok:false, 401 レスポンス", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { requireApiAuth } = await import("./requireApiAuth");
    const result = await requireApiAuth();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = (await result.response.json()) as { error: string };
      expect(body.error).toBe("unauthorized");
    }
  });

  it("getUser がエラー → ok:false, 401 レスポンス", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "jwt expired", name: "AuthError" },
    });

    const { requireApiAuth } = await import("./requireApiAuth");
    const result = await requireApiAuth();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("email が undefined → null として返る", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-x", email: undefined } },
      error: null,
    });

    const { requireApiAuth } = await import("./requireApiAuth");
    const result = await requireApiAuth();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBeNull();
    }
  });
});
