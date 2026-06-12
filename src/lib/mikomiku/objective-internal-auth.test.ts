import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateMikomikuObjectiveInternalRequest,
  MIKOMIKU_OBJECTIVE_INTERNAL_ACTOR,
} from "./objective-internal-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authenticateMikomikuObjectiveInternalRequest", () => {
  it("server-only token が一致したら objective actor を返す", () => {
    vi.stubEnv("MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN", "internal-token");

    const req = new Request("https://example.test/api", {
      headers: { Authorization: "Bearer internal-token" },
    });

    expect(authenticateMikomikuObjectiveInternalRequest(req)).toBe(
      MIKOMIKU_OBJECTIVE_INTERNAL_ACTOR,
    );
  });

  it("token 未設定なら NEXT_PUBLIC 側に値があっても認証しない", () => {
    vi.stubEnv("NEXT_PUBLIC_MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN", "public-token");

    const req = new Request("https://example.test/api", {
      headers: { Authorization: "Bearer public-token" },
    });

    expect(authenticateMikomikuObjectiveInternalRequest(req)).toBeNull();
  });

  it("Bearer が不一致なら null を返す", () => {
    vi.stubEnv("MIKOMIKU_OBJECTIVE_INTERNAL_TOKEN", "internal-token");

    const req = new Request("https://example.test/api", {
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(authenticateMikomikuObjectiveInternalRequest(req)).toBeNull();
  });
});
