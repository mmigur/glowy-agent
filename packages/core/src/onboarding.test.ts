import { describe, expect, it } from "vitest";
import {
  ONBOARDING_QUESTIONS,
  QUESTION_IDS,
  answeredCount,
  answersToStrategyRow,
  emptyAnswers,
  getQuestion,
  nicheSlugsFromTopics,
  sanitizeAnswers,
  strategyRowToAnswers,
  summarizeAnswer,
  toggleAnswer,
} from "./index";

describe("question definitions", () => {
  it("defines every question id exactly once, in order", () => {
    expect(ONBOARDING_QUESTIONS.map((q) => q.id)).toEqual([...QUESTION_IDS]);
  });

  it("has unique option ids inside each question and at least two options", () => {
    for (const q of ONBOARDING_QUESTIONS) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses single choice for role, tone and frequency only", () => {
    const single = ONBOARDING_QUESTIONS.filter((q) => q.kind === "single").map((q) => q.id);
    expect(single).toEqual(["role", "tone", "frequency"]);
  });
});

describe("toggleAnswer", () => {
  it("replaces the choice for single questions and clears on a second click", () => {
    const q = getQuestion("tone");
    expect(toggleAnswer(q, [], "casual")).toEqual(["casual"]);
    expect(toggleAnswer(q, ["casual"], "provocative")).toEqual(["provocative"]);
    expect(toggleAnswer(q, ["casual"], "casual")).toEqual([]);
  });

  it("adds and removes options for multi questions", () => {
    const q = getQuestion("topics");
    const a = toggleAnswer(q, [], "startups");
    const b = toggleAnswer(q, a, "ai_tech");
    expect(b).toEqual(["startups", "ai_tech"]);
    expect(toggleAnswer(q, b, "startups")).toEqual(["ai_tech"]);
  });

  it("ignores unknown option ids", () => {
    const q = getQuestion("goals");
    expect(toggleAnswer(q, ["followers"], "made_up")).toEqual(["followers"]);
  });
});

describe("sanitizeAnswers", () => {
  it("drops unknown ids, duplicates and non-string values", () => {
    const a = sanitizeAnswers({ topics: ["startups", "startups", "nope", 5, null] });
    expect(a.topics).toEqual(["startups"]);
  });

  it("keeps at most one value for single questions", () => {
    expect(sanitizeAnswers({ tone: ["casual", "humorous"] }).tone).toEqual(["casual"]);
  });

  it("tolerates garbage input without throwing", () => {
    const a = sanitizeAnswers({ role: "founder" as unknown, goals: { x: 1 } as unknown });
    expect(a).toEqual(emptyAnswers());
  });
});

describe("mapping to the user_strategy table", () => {
  const answers = {
    ...emptyAnswers(),
    role: ["founder"],
    topics: ["startups", "ai_tech"],
    tone: ["casual"],
    frequency: ["1_per_day"],
  };

  it("maps single answers to scalar columns and multi answers to arrays", () => {
    const row = answersToStrategyRow(answers);
    expect(row.role).toBe("founder");
    expect(row.topics).toEqual(["startups", "ai_tech"]);
    expect(row.tone).toBe("casual");
    expect(row.posting_frequency).toBe("1_per_day");
    expect(row.goals).toEqual([]);
    expect(row.content_types).toEqual([]);
  });

  it("stores skipped single questions as null, not an empty string", () => {
    const row = answersToStrategyRow(emptyAnswers());
    expect(row.role).toBeNull();
    expect(row.tone).toBeNull();
    expect(row.posting_frequency).toBeNull();
  });

  it("round-trips through the database row", () => {
    const row = answersToStrategyRow(answers);
    expect(strategyRowToAnswers(row)).toEqual(answers);
  });

  it("restores answers from a partial or null-filled row", () => {
    expect(strategyRowToAnswers({ role: null, topics: null })).toEqual(emptyAnswers());
  });
});

describe("summaries", () => {
  it("counts answered questions and marks skipped ones", () => {
    const a = { ...emptyAnswers(), role: ["founder"], topics: ["startups"] };
    expect(answeredCount(a)).toBe(2);
    expect(summarizeAnswer("goals", a)).toBe("Skipped");
    expect(summarizeAnswer("topics", { ...a, topics: ["startups", "ai_tech"] })).toBe("Startups, AI and technology");
  });

  it("turns topics into niche slugs without the catch-all 'other'", () => {
    expect(nicheSlugsFromTopics(["startups", "other", "startups", "bogus", "ai_tech"])).toEqual(["startups", "ai_tech"]);
  });
});
