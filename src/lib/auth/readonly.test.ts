import { afterEach, describe, expect, it, vi } from "vitest";

describe("readonly demo helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("既定のsearch demoメールを読み取り専用として扱う", async () => {
    const { isReadonlyDemoEmail, readonlyDemoEmails } = await import("./readonly");
    expect(readonlyDemoEmails()).toContain("search-demo@makxas.com");
    expect(isReadonlyDemoEmail("Search-Demo@Makxas.com")).toBe(true);
  });

  it("環境変数の追加メールも読み取り専用として扱う", async () => {
    vi.stubEnv("SEARCH_READONLY_DEMO_EMAILS", "alpha@example.com, beta@example.com ");
    vi.resetModules();
    const { isReadonlyDemoEmail } = await import("./readonly");
    expect(isReadonlyDemoEmail("beta@example.com")).toBe(true);
    expect(isReadonlyDemoEmail("staff@example.com")).toBe(false);
  });
});
