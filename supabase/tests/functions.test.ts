import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "../functions/_shared/crypto.ts";
import { readEnv } from "../functions/_shared/http.ts";
import {
  THREADS_SCOPES,
  ThreadsApiError,
  buildAuthorizeUrl,
  cleanAuthCode,
  computeTokenTimes,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  fetchThreadsProfile,
  generateState,
} from "../functions/_shared/threads.ts";

// Ключ только для тестов: 32 нулевых байта в base64.
const TEST_KEY = btoa(String.fromCharCode(...new Uint8Array(32)));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("token encryption", () => {
  it("round-trips a secret and never stores plaintext", async () => {
    const stored = await encryptSecret("THQVJ-secret-token", TEST_KEY);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("THQVJ");
    expect(await decryptSecret(stored, TEST_KEY)).toBe("THQVJ-secret-token");
  });

  it("uses a fresh IV, so equal inputs give different ciphertexts", async () => {
    const a = await encryptSecret("same", TEST_KEY);
    const b = await encryptSecret("same", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("refuses to decrypt with a different key", async () => {
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const stored = await encryptSecret("token", TEST_KEY);
    await expect(decryptSecret(stored, other)).rejects.toThrow();
  });

  it("detects tampering with the ciphertext", async () => {
    const stored = await encryptSecret("token", TEST_KEY);
    const [v, iv, data] = stored.split(".");
    const flipped = `${v}.${iv}.${(data ?? "").slice(0, -4)}AAAA`;
    await expect(decryptSecret(flipped, TEST_KEY)).rejects.toThrow();
  });

  it("rejects a key that is not 32 bytes and says how to make a good one", async () => {
    await expect(encryptSecret("x", btoa("short"))).rejects.toThrow(/32 bytes/);
  });

  it("rejects unknown storage formats", async () => {
    await expect(decryptSecret("v9.a.b", TEST_KEY)).rejects.toThrow(/format/);
  });
});

describe("authorize url", () => {
  it("contains all parameters required by Threads", () => {
    const url = new URL(buildAuthorizeUrl({ appId: "123", redirectUri: "https://x.supabase.co/functions/v1/cb", state: "abc" }));
    expect(url.origin + url.pathname).toBe("https://threads.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.supabase.co/functions/v1/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("scope")).toBe(THREADS_SCOPES.join(","));
  });

  it("always requests threads_basic and does not ask for keyword search yet", () => {
    expect(THREADS_SCOPES).toContain("threads_basic");
    expect(THREADS_SCOPES as readonly string[]).not.toContain("threads_keyword_search");
  });

  it("generates long, unique, hex state values", () => {
    const a = generateState();
    const b = generateState();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("strips the #_ suffix Meta may append to the code", () => {
    expect(cleanAuthCode("AQBabc123#_")).toBe("AQBabc123");
    expect(cleanAuthCode("AQBabc123")).toBe("AQBabc123");
  });
});

describe("token exchange", () => {
  it("posts a form to the documented endpoint with the cleaned code", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ access_token: "short", token_type: "bearer", user_id: 17841405793187218 }));
    const r = await exchangeCodeForShortToken(fetchFn as unknown as typeof fetch, {
      appId: "id",
      appSecret: "secret",
      redirectUri: "https://r",
      code: "CODE#_",
    });
    expect(r.accessToken).toBe("short");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.threads.com/oauth/access_token");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("CODE");
    expect(body.get("client_secret")).toBe("secret");
    expect(body.get("redirect_uri")).toBe("https://r");
  });

  it("surfaces the platform error message without leaking secrets", async () => {
    const fetchFn = async () => jsonResponse({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400);
    await expect(
      exchangeCodeForShortToken(fetchFn as unknown as typeof fetch, { appId: "id", appSecret: "TOP-SECRET", redirectUri: "r", code: "c" }),
    ).rejects.toMatchObject({ name: "ThreadsApiError", status: 400, message: "Matching code was not found or was already used" });
  });

  it("exchanges for a long-lived token with th_exchange_token", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ access_token: "long", token_type: "bearer", expires_in: 5183944 }));
    const r = await exchangeForLongLivedToken(fetchFn as unknown as typeof fetch, { appSecret: "s", accessToken: "short" });
    expect(r).toEqual({ accessToken: "long", expiresInSec: 5183944 });
    const called = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(called.origin + called.pathname).toBe("https://graph.threads.com/access_token");
    expect(called.searchParams.get("grant_type")).toBe("th_exchange_token");
  });

  it("fails clearly when the long-lived response is incomplete", async () => {
    const fetchFn = async () => jsonResponse({ access_token: "long" });
    await expect(exchangeForLongLivedToken(fetchFn as unknown as typeof fetch, { appSecret: "s", accessToken: "t" })).rejects.toBeInstanceOf(ThreadsApiError);
  });

  it("does not put a token or secret into error messages for non-JSON failures", async () => {
    const fetchFn = async () => new Response("<html>gateway error</html>", { status: 502 });
    const err = await exchangeForLongLivedToken(fetchFn as unknown as typeof fetch, { appSecret: "TOP-SECRET", accessToken: "SHORT-TOKEN" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(ThreadsApiError);
    expect((err as Error).message).not.toContain("TOP-SECRET");
    expect((err as Error).message).not.toContain("SHORT-TOKEN");
  });
});

describe("profile", () => {
  it("reads id and username as strings", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ id: "17841405793187218", username: "maxim", name: "Maxim", threads_profile_picture_url: "https://img/p.jpg" }),
    );
    const p = await fetchThreadsProfile(fetchFn as unknown as typeof fetch, "tok");
    expect(p).toEqual({ id: "17841405793187218", username: "maxim", name: "Maxim", pictureUrl: "https://img/p.jpg" });
    const called = new URL(String((fetchFn.mock.calls[0] as unknown[])[0]));
    expect(called.pathname).toBe("/v1.0/me");
  });

  it("rejects a profile without username", async () => {
    const fetchFn = async () => jsonResponse({ id: "1" });
    await expect(fetchThreadsProfile(fetchFn as unknown as typeof fetch, "tok")).rejects.toBeInstanceOf(ThreadsApiError);
  });
});

describe("token refresh planning", () => {
  const NOW = Date.UTC(2026, 10, 20);
  const DAY = 24 * 3600 * 1000;

  it("plans a refresh 10 days before a 60 day token expires", () => {
    const t = computeTokenTimes(NOW, 60 * 24 * 3600);
    expect(t.expiresAt.getTime()).toBe(NOW + 60 * DAY);
    expect(t.refreshAfter.getTime()).toBe(NOW + 50 * DAY);
  });

  it("never schedules a refresh sooner than 25 hours after issue (Meta requires 24h)", () => {
    const t = computeTokenTimes(NOW, 5 * 24 * 3600);
    expect(t.refreshAfter.getTime()).toBe(NOW + 25 * 3600 * 1000);
  });
});

describe("env check", () => {
  it("reports only the names of missing or blank secrets", () => {
    const env: Record<string, string> = { A: "1", B: "  " };
    const r = readEnv(["A", "B", "C"], (n) => env[n]);
    expect(r).toEqual({ ok: false, missing: ["B", "C"] });
  });

  it("returns values when everything is present", () => {
    const r = readEnv(["A"], () => "x");
    expect(r).toEqual({ ok: true, values: { A: "x" } });
  });
});
