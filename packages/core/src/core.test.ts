import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ProviderError,
  ProviderRegistry,
  computePatternLift,
  confidenceForSample,
  countChars,
  estimateXPostCost,
  estimateXResearchCost,
  isMetricShowable,
  isWithinLimit,
  median,
  nextRetryDelayMs,
  publicationKey,
  scorePost,
  shouldRetry,
  weightedEngagement,
} from "./index";

describe("scoring", () => {
  it("weights replies and reposts above likes", () => {
    expect(weightedEngagement({ likes: 10, replies: 0, reposts: 0, quotes: 0 })).toBe(10);
    expect(weightedEngagement({ likes: 0, replies: 10, reposts: 0, quotes: 0 })).toBe(30);
    expect(weightedEngagement({ likes: 0, replies: 0, reposts: 10, quotes: 5 })).toBe(30);
  });

  it("prefers impressions as the normalization basis", () => {
    const s = scorePost({ likes: 50, replies: 5, reposts: 5, quotes: 0, impressions: 1000, ageHours: 10, authorFollowers: 100 });
    expect(s.basis).toBe("impressions");
    expect(s.normalized).toBeCloseTo((50 + 15 + 10) / 1000);
  });

  it("falls back to followers, then raw, and labels the basis honestly", () => {
    const withFollowers = scorePost({ likes: 100, replies: 0, reposts: 0, quotes: 0, ageHours: 5, authorFollowers: 10_000 });
    expect(withFollowers.basis).toBe("followers");
    expect(withFollowers.normalized).toBeCloseTo(100 / 100);
    const raw = scorePost({ likes: 100, replies: 0, reposts: 0, quotes: 0, ageHours: 5 });
    expect(raw.basis).toBe("raw");
  });

  it("ranks a small account's outperforming post above a big account's average one", () => {
    const small = scorePost({ likes: 400, replies: 40, reposts: 30, quotes: 0, ageHours: 12, authorFollowers: 900 });
    const big = scorePost({ likes: 600, replies: 20, reposts: 10, quotes: 0, ageHours: 12, authorFollowers: 400_000 });
    expect(small.normalized).toBeGreaterThan(big.normalized);
  });

  it("flags posts that are too fresh to rank reliably", () => {
    expect(scorePost({ likes: 5, replies: 0, reposts: 0, quotes: 0, ageHours: 0.3 }).tooFresh).toBe(true);
    expect(scorePost({ likes: 5, replies: 0, reposts: 0, quotes: 0, ageHours: 3 }).tooFresh).toBe(false);
  });
});

describe("pattern lift", () => {
  it("computes median ratio and marks small samples as low confidence", () => {
    const r = computePatternLift([4, 6, 8], [1, 2, 3, 4, 5]);
    expect(r.lift).toBeCloseTo(2);
    expect(r.sampleSize).toBe(3);
    expect(r.confidence).toBe("low");
  });

  it("returns null lift when there is nothing to compare", () => {
    expect(computePatternLift([], [1, 2]).lift).toBeNull();
    expect(computePatternLift([1], []).lift).toBeNull();
  });

  it("maps sample sizes to confidence levels", () => {
    expect(confidenceForSample(9)).toBe("low");
    expect(confidenceForSample(10)).toBe("medium");
    expect(confidenceForSample(30)).toBe("high");
  });

  it("median handles even, odd and empty arrays", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("limits and cost", () => {
  it("counts every URL in X as 23 characters", () => {
    expect(countChars("x", "see https://example.com/very/long/path/that/goes/on/forever")).toBe(4 + 23);
  });

  it("uses the Threads limit of 500 and the X limit of 280", () => {
    expect(isWithinLimit("x", "a".repeat(280))).toBe(true);
    expect(isWithinLimit("x", "a".repeat(281))).toBe(false);
    expect(isWithinLimit("threads", "a".repeat(500))).toBe(true);
    expect(isWithinLimit("threads", "a".repeat(501))).toBe(false);
  });

  it("charges 13x more for X posts with a link", () => {
    const plain = estimateXPostCost("no link here");
    const withLink = estimateXPostCost("look https://glowy.ai");
    expect(plain).toBe(0.015);
    expect(withLink).toBe(0.2);
    expect(withLink / plain).toBeCloseTo(13.33, 1);
  });

  it("estimates research cost from posts and users read", () => {
    expect(estimateXResearchCost({ postsRead: 1000 })).toBe(5);
    expect(estimateXResearchCost({ postsRead: 1000, usersRead: 100 })).toBe(6);
  });
});

describe("retry and idempotency", () => {
  it("backs off exponentially and respects Retry-After", () => {
    expect(nextRetryDelayMs(1)).toBe(30_000);
    expect(nextRetryDelayMs(2)).toBe(60_000);
    expect(nextRetryDelayMs(3)).toBe(120_000);
    expect(nextRetryDelayMs(1, 600)).toBe(600_000);
    expect(nextRetryDelayMs(20)).toBe(30 * 60_000);
  });

  it("retries only transient errors and stops after the attempt cap", () => {
    expect(shouldRetry("transient", 1)).toBe(true);
    expect(shouldRetry("rate_limited", 3)).toBe(true);
    expect(shouldRetry("transient", 4)).toBe(false);
    expect(shouldRetry("auth_expired", 1)).toBe(false);
    expect(shouldRetry("invalid_request", 1)).toBe(false);
  });

  it("builds a deterministic publication key", () => {
    expect(publicationKey("a", "d", "2026-11-20T10:00:00Z")).toBe(publicationKey("a", "d", "2026-11-20T10:00:00Z"));
    expect(publicationKey("a", "d", "2026-11-20T10:00:00Z")).not.toBe(publicationKey("a", "d2", "2026-11-20T10:00:00Z"));
  });
});

describe("capabilities and registry", () => {
  it("never claims reach or X impressions as verified", () => {
    expect(CAPABILITIES.x.metrics.reach.availability).toBe("unverified");
    expect(CAPABILITIES.x.metrics.impressions.availability).toBe("unverified");
  });

  it("does not offer X follower history, but allows follower count", () => {
    expect(isMetricShowable("x", "followerHistory")).toBe(false);
    expect(isMetricShowable("x", "followers")).toBe(true);
  });

  it("throws a typed error for an unregistered provider", () => {
    const registry = new ProviderRegistry();
    expect(registry.has("x")).toBe(false);
    expect(() => registry.get("x")).toThrow(ProviderError);
  });

  it("marks only rate limits and transient failures as retryable", () => {
    expect(new ProviderError("rate_limited", "x").retryable).toBe(true);
    expect(new ProviderError("transient", "x").retryable).toBe(true);
    expect(new ProviderError("auth_expired", "x").retryable).toBe(false);
  });
});
