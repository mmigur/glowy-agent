/**
 * Онбординг: 7 коротких вопросов. Описание вопросов живёт здесь, одним списком данных,
 * поэтому экран, настройки и сохранение в БД используют одно и то же и не расходятся.
 * Любой вопрос можно пропустить и изменить позже.
 */

export const QUESTION_IDS = ["role", "topics", "audience", "contentTypes", "tone", "goals", "frequency", "formats"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export interface QuestionOption {
  id: string;
  label: string;
}

export interface OnboardingQuestion {
  id: QuestionId;
  title: string;
  hint: string;
  kind: "single" | "multi";
  options: readonly QuestionOption[];
}

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: "role",
    title: "What do you do?",
    hint: "Pick the closest one.",
    kind: "single",
    options: [
      { id: "founder", label: "Startup founder" },
      { id: "indie_hacker", label: "Indie hacker" },
      { id: "entrepreneur", label: "Entrepreneur" },
      { id: "product_manager", label: "Product manager" },
      { id: "developer", label: "Developer" },
      { id: "investor", label: "Investor" },
      { id: "other", label: "Other" },
    ],
  },
  {
    id: "topics",
    title: "What do you want to write about?",
    hint: "Pick as many as you like. The agent researches these topics.",
    kind: "multi",
    options: [
      { id: "startups", label: "Startups" },
      { id: "ai_tech", label: "AI and technology" },
      { id: "building_in_public", label: "Building in public" },
      { id: "entrepreneurship", label: "Entrepreneurship" },
      { id: "product_management", label: "Product management" },
      { id: "marketing_growth", label: "Marketing and growth" },
      { id: "personal_development", label: "Personal development" },
      { id: "business_investing", label: "Business and investing" },
      { id: "life_experiences", label: "Life and experiences" },
      { id: "other", label: "Other" },
    ],
  },
  {
    id: "audience",
    title: "Who are you writing for?",
    hint: "Pick as many as you like. Drafts speak to these people.",
    kind: "multi",
    options: [
      { id: "founders", label: "Founders" },
      { id: "developers", label: "Developers" },
      { id: "marketers", label: "Marketers" },
      { id: "investors", label: "Investors" },
      { id: "creators", label: "Creators" },
      { id: "operators", label: "Operators and managers" },
      { id: "students", label: "Students" },
      { id: "general", label: "A general audience" },
    ],
  },
  {
    id: "contentTypes",
    title: "What kind of content fits you?",
    hint: "Pick as many as you like.",
    kind: "multi",
    options: [
      { id: "personal_stories", label: "Personal stories" },
      { id: "practical_tips", label: "Practical tips" },
      { id: "opinions", label: "Opinions and hot takes" },
      { id: "case_studies", label: "Case studies and breakdowns" },
      { id: "industry_news", label: "Industry news" },
      { id: "trends", label: "Trend discussions" },
      { id: "humor", label: "Humor and memes" },
      { id: "build_in_public", label: "Build in public updates" },
    ],
  },
  {
    id: "tone",
    title: "How do you want to sound?",
    hint: "Pick one. Drafts follow this tone.",
    kind: "single",
    options: [
      { id: "professional", label: "Professional" },
      { id: "casual", label: "Casual" },
      { id: "provocative", label: "Provocative" },
      { id: "educational", label: "Educational" },
      { id: "personal", label: "Personal" },
      { id: "humorous", label: "Humorous" },
    ],
  },
  {
    id: "goals",
    title: "What are you after?",
    hint: "Pick as many as you like.",
    kind: "multi",
    options: [
      { id: "followers", label: "More followers" },
      { id: "clients", label: "Finding clients" },
      { id: "investors", label: "Attracting investors" },
      { id: "personal_brand", label: "Growing a personal brand" },
      { id: "like_minded", label: "Meeting like-minded people" },
      { id: "startup_attention", label: "Attention for my startup" },
      { id: "community", label: "Building a professional community" },
    ],
  },
  {
    id: "frequency",
    title: "How often do you want to post?",
    hint: "Pick one. You can change this any time.",
    kind: "single",
    options: [
      { id: "1_per_day", label: "Once a day" },
      { id: "2_per_day", label: "Twice a day" },
      { id: "3_per_day", label: "Three times a day" },
      { id: "5_per_week", label: "Five times a week" },
      { id: "custom", label: "Custom schedule (set later)" },
    ],
  },
  {
    id: "formats",
    title: "Which formats do you prefer?",
    hint: "Pick as many as you like.",
    kind: "multi",
    options: [
      { id: "short", label: "Short thoughts" },
      { id: "long", label: "Longer posts" },
      { id: "threads", label: "Threads" },
      { id: "questions", label: "Questions to the audience" },
      { id: "life_stories", label: "Stories from life" },
      { id: "mix", label: "A mix" },
    ],
  },
];

/** Ответы по вопросам. У single-вопроса в массиве не больше одного элемента. Пропущенный вопрос: пустой массив. */
export type OnboardingAnswers = Record<QuestionId, string[]>;

export function emptyAnswers(): OnboardingAnswers {
  return { role: [], topics: [], audience: [], contentTypes: [], tone: [], goals: [], frequency: [], formats: [] };
}

export function getQuestion(id: QuestionId): OnboardingQuestion {
  const q = ONBOARDING_QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown onboarding question: ${id}`);
  return q;
}

/** Нажатие на вариант: single заменяет выбор (повторное нажатие снимает), multi переключает. */
export function toggleAnswer(question: OnboardingQuestion, current: readonly string[], optionId: string): string[] {
  if (!question.options.some((o) => o.id === optionId)) return [...current];
  if (question.kind === "single") return current.includes(optionId) ? [] : [optionId];
  return current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId];
}

export function answeredCount(answers: OnboardingAnswers): number {
  return QUESTION_IDS.filter((id) => (answers[id]?.length ?? 0) > 0).length;
}

/** Оставляет только известные варианты и соблюдает single/multi. Защищает от мусора в БД. */
export function sanitizeAnswers(input: Partial<Record<QuestionId, unknown>>): OnboardingAnswers {
  const out = emptyAnswers();
  for (const q of ONBOARDING_QUESTIONS) {
    const raw = input[q.id];
    if (!Array.isArray(raw)) continue;
    const valid = new Set(q.options.map((o) => o.id));
    const unique = [...new Set(raw.filter((x): x is string => typeof x === "string" && valid.has(x)))];
    out[q.id] = q.kind === "single" ? unique.slice(0, 1) : unique;
  }
  return out;
}

/** Строка таблицы user_strategy (без user_id и служебных меток времени). */
export interface StrategyRow {
  role: string | null;
  topics: string[];
  content_types: string[];
  tone: string | null;
  goals: string[];
  posting_frequency: string | null;
  formats: string[];
  answers: OnboardingAnswers;
}

export function answersToStrategyRow(raw: OnboardingAnswers): StrategyRow {
  const a = sanitizeAnswers(raw);
  return {
    role: a.role[0] ?? null,
    topics: a.topics,
    content_types: a.contentTypes,
    tone: a.tone[0] ?? null,
    goals: a.goals,
    posting_frequency: a.frequency[0] ?? null,
    formats: a.formats,
    answers: a,
  };
}

/** Восстанавливает ответы из строки БД. Основной источник: колонки, JSON `answers` запасной. */
export function strategyRowToAnswers(row: {
  role?: string | null;
  topics?: string[] | null;
  content_types?: string[] | null;
  tone?: string | null;
  goals?: string[] | null;
  posting_frequency?: string | null;
  formats?: string[] | null;
  answers?: unknown;
}): OnboardingAnswers {
  const stored = row.answers && typeof row.answers === "object" ? sanitizeAnswers(row.answers as Partial<Record<QuestionId, unknown>>) : emptyAnswers();
  const fromColumns = sanitizeAnswers({
    role: row.role ? [row.role] : [],
    topics: row.topics ?? [],
    contentTypes: row.content_types ?? [],
    tone: row.tone ? [row.tone] : [],
    goals: row.goals ?? [],
    frequency: row.posting_frequency ? [row.posting_frequency] : [],
    formats: row.formats ?? [],
  });
  // Аудитория живёт в JSON answers: отдельной колонки под неё нет.
  return { ...stored, ...fromColumns, audience: stored.audience };
}

export function optionLabel(questionId: QuestionId, optionId: string): string {
  return getQuestion(questionId).options.find((o) => o.id === optionId)?.label ?? optionId;
}

/** Короткое описание ответов для настроек, например «Founder · Startups, AI and technology». */
export function summarizeAnswer(questionId: QuestionId, answers: OnboardingAnswers): string {
  const picked = answers[questionId];
  if (picked.length === 0) return "Skipped";
  return picked.map((id) => optionLabel(questionId, id)).join(", ");
}

/**
 * Темы пользователя → ниши для исследования (Phase 4). Ниши общие для всех пользователей,
 * поэтому здесь только стабильные идентификаторы тем, без привязки к конкретным запросам.
 */
export function nicheSlugsFromTopics(topics: readonly string[]): string[] {
  const valid = new Set(getQuestion("topics").options.map((o) => o.id));
  return [...new Set(topics)].filter((t) => valid.has(t) && t !== "other");
}
