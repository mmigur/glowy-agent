import { describe, expect, it, vi } from "vitest";
import {
  buildThreadPrompt, detectOwnEngagementPatterns, detectTopVsRecentPatterns, extractPostFeatures,
  findPlaceholders, nextSlot, parseVariants, queriesForTopics, rankHours, THREADS_TEXT_LIMIT,
} from "../functions/_shared/thread-logic.ts";
import { engagementScore, isOwnOnly, keywordSearch, publishTextPost } from "../functions/_shared/threads-content.ts";

describe("features", () => {
  it("extracts features", () => {
    const f = extractPostFeatures("Shipped in 3 days\nWhat would you cut?\n- auth\n- billing");
    expect(f).toMatchObject({ hasQuestion: true, hasNumber: true, hasList: true, multiLine: true, shortHook: true, hasLink: false, lengthBucket: "short" });
  });
});

describe("patterns", () => {
  const withQ = (i: number) => `Question number ${i}? Here is what I learned about growth and why it matters to founders everywhere`;
  const plain = (i: number) => `Plain statement ${i} about growth and why it matters to founders everywhere today`;
  it("finds features over-represented in TOP", () => {
    const top = [...Array.from({ length: 8 }, (_, i) => withQ(i)), ...Array.from({ length: 4 }, (_, i) => plain(i))];
    const recent = [...Array.from({ length: 2 }, (_, i) => withQ(i)), ...Array.from({ length: 10 }, (_, i) => plain(i))];
    const p = detectTopVsRecentPatterns(top, recent);
    expect(p[0]?.key).toBe("hasQuestion");
    expect(p[0]!.lift).toBeGreaterThan(1.5);
  });
  it("returns nothing for tiny samples", () => {
    expect(detectTopVsRecentPatterns(["a?"], ["b"])).toEqual([]);
  });
  it("finds own engagement patterns", () => {
    const posts = [
      ...Array.from({ length: 4 }, (_, i) => ({ text: `Why? ${i}`, postedAt: "2026-11-01T10:00:00Z", score: 0.05 })),
      ...Array.from({ length: 4 }, (_, i) => ({ text: `Statement ${i}`, postedAt: "2026-11-01T10:00:00Z", score: 0.01 })),
    ];
    expect(detectOwnEngagementPatterns(posts).some((p) => p.key === "hasQuestion" && p.basis === "own_engagement")).toBe(true);
  });
});

describe("time", () => {
  it("ranks hours in the user's time zone", () => {
    const samples = Array.from({ length: 10 }, () => ({ at: "2026-11-10T03:00:00Z", weight: 1 })); // 09:00 in Omsk (UTC+6)
    expect(rankHours(samples, "Asia/Omsk")[0]).toBe(9);
    expect(rankHours(samples.slice(0, 3), "Asia/Omsk")).toEqual([]);
  });
  it("picks the next occurrence of the best hour, in local time", () => {
    const now = new Date("2026-11-21T08:50:00Z"); // 14:50 Omsk
    const slot = nextSlot({ now, timeZone: "Asia/Omsk", ownHours: [19], researchHours: [] });
    expect(slot.basis).toBe("own_posts");
    expect(slot.at.toISOString()).toBe("2026-11-21T13:00:00.000Z"); // 19:00 Omsk
  });
  it("rolls to tomorrow when the hour has passed", () => {
    const now = new Date("2026-11-21T14:00:00Z"); // 20:00 Omsk
    const slot = nextSlot({ now, timeZone: "Asia/Omsk", ownHours: [19], researchHours: [] });
    expect(slot.at.toISOString()).toBe("2026-11-22T13:00:00.000Z");
  });
  it("avoids taken slots and falls back to defaults", () => {
    const now = new Date("2026-11-21T08:50:00Z");
    const taken = [new Date("2026-11-21T13:00:00Z")];
    const slot = nextSlot({ now, timeZone: "Asia/Omsk", ownHours: [19], researchHours: [], taken });
    expect(slot.basis).toBe("default");
    expect(Math.abs(slot.at.getTime() - taken[0]!.getTime())).toBeGreaterThanOrEqual(90 * 60_000);
  });
  it("never schedules inside the minimum lead time", () => {
    const now = new Date("2026-11-21T12:50:00Z");
    const slot = nextSlot({ now, timeZone: "Asia/Omsk", ownHours: [19], researchHours: [] });
    expect(slot.at.getTime()).toBeGreaterThanOrEqual(now.getTime() + 20 * 60_000);
  });
});

describe("model output", () => {
  const good = { text: "Hello [[today's MRR]]", angle: "a", rationale: "r", enhancements: [{ type: "live_data", instruction: "add MRR" }, { type: "nope", instruction: "x" }] };
  it("parses, validates and dedupes", () => {
    const raw = "```json\n" + JSON.stringify({ variants: [good, good, { text: "x".repeat(THREADS_TEXT_LIMIT + 1) }, { text: "" }, { text: "Second" }] }) + "\n```";
    const v = parseVariants(raw);
    expect(v.map((x) => x.text)).toEqual(["Hello [[today's MRR]]", "Second"]);
    expect(v[0]!.enhancements).toEqual([{ type: "live_data", instruction: "add MRR" }]);
  });
  it("returns [] for garbage", () => {
    expect(parseVariants("sorry")).toEqual([]);
    expect(parseVariants("{bad json}")).toEqual([]);
  });
  it("finds placeholders", () => {
    expect(findPlaceholders("a [[x]] b [[ y z ]]")).toEqual(["x", "y z"]);
    expect(findPlaceholders("none")).toEqual([]);
  });
  it("builds a prompt with limits and without inventing patterns", () => {
    const p = buildThreadPrompt({ language: "English", strategy: { role: "founder", topics: ["startups"], contentTypes: [], tone: null, goals: [], formats: [] }, patterns: [], patternBasis: "none", exemplars: [], avoid: [], variants: 3 });
    expect(p.system).toContain("500");
    expect(p.user).toContain("No measured patterns");
  });
  it("maps topics to queries", () => {
    expect(queriesForTopics(["startups", "other", "ai_tech", "startups"])).toEqual(["startup", "AI"]);
  });
});

describe("threads content api", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  it("searches and detects own-only results", async () => {
    const f = vi.fn(async () => ok({ data: [{ id: "1", text: "hi", timestamp: "2026-11-01T00:00:00Z", username: "me" }, { id: "2" }] }));
    const posts = await keywordSearch(f as unknown as typeof fetch, { accessToken: "t", query: "AI", type: "TOP" });
    expect(posts).toHaveLength(1);
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("search_type=TOP");
    expect(isOwnOnly(posts, "Me")).toBe(true);
    expect(isOwnOnly(posts, "other")).toBe(false);
  });
  it("publishes in two steps", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({ id: "c1" })).mockResolvedValueOnce(ok({ id: "p1" }));
    const r = await publishTextPost(f as unknown as typeof fetch, { accessToken: "t", text: "hello" });
    expect(r.postId).toBe("p1");
    expect(String((f.mock.calls[1] as unknown[])[0])).toContain("threads_publish");
  });
  it("keeps missing metrics null in scoring", () => {
    expect(engagementScore({ text: "", postedAt: "", views: null, likes: 5, replies: null, reposts: null, quotes: null })).toBeNull();
    expect(engagementScore({ text: "", postedAt: "", views: 100, likes: 5, replies: 1, reposts: null, quotes: null })).toBeCloseTo(0.08);
  });
});

import { askLlm, resolveLlmConfig } from "../functions/_shared/llm.ts";
describe("llm provider", () => {
  it("prefers Claude, falls back to OpenAI-compatible, else null", () => {
    expect(resolveLlmConfig((n) => ({ ANTHROPIC_API_KEY: "a" })[n])?.kind).toBe("anthropic");
    const c = resolveLlmConfig((n) => ({ LLM_API_KEY: "k", LLM_MODEL: "m", LLM_BASE_URL: "https://x.test/v1/" })[n]);
    expect(c).toMatchObject({ kind: "openai_compatible", baseUrl: "https://x.test/v1" });
    expect(resolveLlmConfig((n) => ({ LLM_API_KEY: "k" })[n])).toBeNull();
  });
  it("calls chat/completions for compatible providers", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 }));
    const out = await askLlm(f as unknown as typeof fetch, { kind: "openai_compatible", apiKey: "k", model: "m", baseUrl: "https://x.test/v1" }, { system: "s", user: "u" });
    expect(out).toBe("hi");
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe("https://x.test/v1/chat/completions");
  });
});

describe("llm empty answers", () => {
  const cfg = { kind: "openai_compatible" as const, apiKey: "k", model: "m", baseUrl: "https://x.test/v1" };
  const reply = (message: unknown, extra = {}) => vi.fn(async () => new Response(JSON.stringify({ model: "some/free-model", choices: [{ message, finish_reason: "length" }], ...extra }), { status: 200 }));
  it("reads array content parts", async () => {
    const f = reply({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] });
    expect(await askLlm(f as unknown as typeof fetch, cfg, { system: "s", user: "u" })).toBe("ab");
  });
  it("reports which model returned nothing and why", async () => {
    const f = reply({ content: null, reasoning: "thinking..." });
    await expect(askLlm(f as unknown as typeof fetch, cfg, { system: "s", user: "u" })).rejects.toThrow(/some\/free-model, finish: length/);
  });
});

describe("tolerant model output", () => {
  const body = JSON.stringify({ variants: [{ text: "Real post" }] });
  it("ignores reasoning blocks and stray braces before the JSON", () => {
    expect(parseVariants(`<think>maybe {"a": 1} hmm</think>Here you go: ${body}`)[0]?.text).toBe("Real post");
    expect(parseVariants(`Some {noise} first.\n${body}`)[0]?.text).toBe("Real post");
  });
  it("accepts a bare array and alternative keys", () => {
    expect(parseVariants(JSON.stringify([{ post: "A" }, { content: "B" }])).map((v) => v.text)).toEqual(["A", "B"]);
    expect(parseVariants(JSON.stringify({ posts: [{ text: "C" }] }))[0]?.text).toBe("C");
  });
  it("explains why nothing was usable", async () => {
    const { parseVariantsReport } = await import("../functions/_shared/thread-logic.ts");
    expect(parseVariantsReport("I cannot help").reason).toContain("no JSON");
    expect(parseVariantsReport(JSON.stringify({ variants: [{ text: "x".repeat(600) }] })).reason).toContain("1 over 500");
  });
});
