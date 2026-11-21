// Чистая логика «трeда»: признаки постов, паттерны, время публикации, разбор ответа модели.
// Без сети и базы, поэтому полностью проверяется тестами.
// Файл лежит в _shared, потому что Edge Functions (Deno) не умеют импортировать packages/core без сборки.

export const THREADS_TEXT_LIMIT = 500;

/** Ключевые слова для поиска по темам онбординга. Тема «other» не ищется. */
export const TOPIC_QUERIES: Record<string, string> = {
  startups: "startup",
  ai_tech: "AI",
  building_in_public: "building in public",
  entrepreneurship: "entrepreneurship",
  product_management: "product management",
  marketing_growth: "growth marketing",
  personal_development: "personal growth",
  business_investing: "investing",
  life_experiences: "life lessons",
};

export function queriesForTopics(topics: string[], max = 3): string[] {
  const out: string[] = [];
  for (const t of topics) {
    const q = TOPIC_QUERIES[t];
    if (q && !out.includes(q)) out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

// ───────────── Признаки поста ─────────────

export interface PostFeatures {
  lengthBucket: "short" | "medium" | "long";
  hasQuestion: boolean;
  hasNumber: boolean;
  hasList: boolean;
  hasLink: boolean;
  multiLine: boolean;
  shortHook: boolean;
}

export type FeatureKey = keyof PostFeatures | "lengthShort" | "lengthMedium" | "lengthLong";

export function extractPostFeatures(text: string): PostFeatures {
  const t = text.trim();
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  return {
    lengthBucket: t.length < 100 ? "short" : t.length < 300 ? "medium" : "long",
    hasQuestion: /\?/.test(t),
    hasNumber: /\d/.test(t),
    hasList: lines.filter((l) => /^([-•*]|\d+[.)])\s/.test(l)).length >= 2,
    hasLink: /https?:\/\/\S+/i.test(t),
    multiLine: lines.length >= 3,
    shortHook: first.length > 0 && first.length <= 60 && lines.length > 1,
  };
}

const FEATURE_LABELS: Record<string, string> = {
  hasQuestion: "Asks a question",
  hasNumber: "Contains concrete numbers",
  hasList: "Uses a short list",
  hasLink: "Contains a link",
  multiLine: "Broken into short lines",
  shortHook: "Opens with a short one-line hook",
  lengthShort: "Short (under 100 characters)",
  lengthMedium: "Medium length (100–300 characters)",
  lengthLong: "Long (300+ characters)",
};

function flatFeatures(f: PostFeatures): Record<string, boolean> {
  return {
    hasQuestion: f.hasQuestion,
    hasNumber: f.hasNumber,
    hasList: f.hasList,
    hasLink: f.hasLink,
    multiLine: f.multiLine,
    shortHook: f.shortHook,
    lengthShort: f.lengthBucket === "short",
    lengthMedium: f.lengthBucket === "medium",
    lengthLong: f.lengthBucket === "long",
  };
}

// ───────────── Паттерны ─────────────

export type Confidence = "low" | "medium" | "high";

export interface DetectedPattern {
  key: string;
  label: string;
  /** Сколько постов с этим признаком в основной выборке. */
  sampleSize: number;
  /** Во сколько раз признак встречается чаще (или работает лучше), чем в сравнении. */
  lift: number;
  confidence: Confidence;
  basis: "top_vs_recent" | "own_engagement";
}

export function confidenceFor(n: number): Confidence {
  return n >= 30 ? "high" : n >= 10 ? "medium" : "low";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const MIN_LIFT = 1.15;
const DAY_MS = 86_400_000;

export interface LikedPost {
  text: string;
  postedAt: string;
  likes: number | null;
}

/**
 * Посты, которым уже 3–4 дня и у которых есть лайки: к этому моменту видно, что зашло.
 * Если в узком окне пусто, берём посты возрастом 2–7 дней, тоже по лайкам.
 */
export function pickLikedPosts<T extends LikedPost>(posts: T[], now: Date, limit = 6): T[] {
  const liked = posts.filter((p) => typeof p.likes === "number" && p.likes > 0 && p.text.trim() && !Number.isNaN(new Date(p.postedAt).getTime()));
  const ageDays = (p: T) => (now.getTime() - new Date(p.postedAt).getTime()) / DAY_MS;
  const between = (min: number, max: number) => liked.filter((p) => {
    const age = ageDays(p);
    return age >= min && age <= max;
  });
  const narrow = between(3, 4);
  const pool = narrow.length > 0 ? narrow : between(2, 7);
  return [...pool].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, limit);
}

/**
 * Сравнивает посты из выдачи TOP с постами из выдачи RECENT по тем же запросам.
 * Паттерн = признак, который в TOP встречается заметно чаще. Это сигнал порядка ранжирования Meta,
 * а не подсчёт лайков: Threads не отдаёт лайки чужих постов.
 */
export function detectTopVsRecentPatterns(top: string[], recent: string[], minSample = 3): DetectedPattern[] {
  if (top.length < 8 || recent.length < 8) return [];
  const topF = top.map((t) => flatFeatures(extractPostFeatures(t)));
  const recF = recent.map((t) => flatFeatures(extractPostFeatures(t)));
  const out: DetectedPattern[] = [];
  for (const key of Object.keys(FEATURE_LABELS)) {
    const inTop = topF.filter((f) => f[key]).length;
    const inRec = recF.filter((f) => f[key]).length;
    if (inTop < minSample) continue;
    // Сглаживание Лапласа, чтобы нулевая доля в RECENT не давала бесконечный lift.
    const shareTop = (inTop + 1) / (top.length + 2);
    const shareRec = (inRec + 1) / (recent.length + 2);
    const lift = shareTop / shareRec;
    if (lift >= MIN_LIFT) out.push({ key, label: FEATURE_LABELS[key]!, sampleSize: inTop, lift, confidence: confidenceFor(inTop), basis: "top_vs_recent" });
  }
  return out.sort((a, b) => b.lift - a.lift);
}

export interface ScoredOwnPost {
  text: string;
  postedAt: string;
  /** Нормированный скор вовлечённости. Выше = лучше. */
  score: number;
}

/** Какие признаки у собственных постов пользователя дают лучшую вовлечённость (медиана с признаком / медиана без). */
export function detectOwnEngagementPatterns(posts: ScoredOwnPost[], minSample = 3): DetectedPattern[] {
  if (posts.length < 2 * minSample) return [];
  const rows = posts.map((p) => ({ f: flatFeatures(extractPostFeatures(p.text)), score: p.score }));
  const out: DetectedPattern[] = [];
  for (const key of Object.keys(FEATURE_LABELS)) {
    const withF = rows.filter((r) => r.f[key]).map((r) => r.score);
    const without = rows.filter((r) => !r.f[key]).map((r) => r.score);
    if (withF.length < minSample || without.length < minSample) continue;
    const base = median(without);
    if (base <= 0) continue;
    const lift = median(withF) / base;
    if (lift >= MIN_LIFT) out.push({ key, label: FEATURE_LABELS[key]!, sampleSize: withF.length, lift, confidence: confidenceFor(withF.length), basis: "own_engagement" });
  }
  return out.sort((a, b) => b.lift - a.lift);
}

// ───────────── Время публикации ─────────────

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localHour(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return { hour, minute };
}

export interface HourSample {
  /** ISO-время публикации поста. */
  at: string;
  /** Вес: чем лучше пост, тем выше. */
  weight: number;
}

/** Часы суток (по часовому поясу пользователя), отсортированные от лучшего к худшему. Пусто, если данных мало. */
export function rankHours(samples: HourSample[], timeZone: string, minSamples = 8): number[] {
  if (samples.length < minSamples) return [];
  const buckets = new Array<number>(24).fill(0);
  for (const s of samples) {
    const d = new Date(s.at);
    if (Number.isNaN(d.getTime())) continue;
    buckets[localHour(d, timeZone).hour]! += s.weight;
  }
  // Сглаживаем соседними часами, чтобы один выброс не определял результат.
  const smoothed = buckets.map((_, h) => buckets[(h + 23) % 24]! * 0.5 + buckets[h]! + buckets[(h + 1) % 24]! * 0.5);
  return smoothed
    .map((v, h) => ({ v, h }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .map((x) => x.h);
}

/** Запасные часы, когда данных нет. Это не результат анализа, а типичные окна активности. */
export const DEFAULT_HOURS = [9, 13, 19, 11, 16, 20];

export interface SlotResult {
  at: Date;
  basis: "own_posts" | "research" | "default";
}

/**
 * Ближайший свободный слот: берёт лучший час из списка, ставит на ближайшее наступление
 * этого часа не раньше now + minLeadMinutes и не ближе 90 минут к уже занятым слотам.
 */
export function nextSlot(opts: {
  now: Date;
  timeZone: string;
  ownHours: number[];
  researchHours: number[];
  taken?: Date[];
  minLeadMinutes?: number;
}): SlotResult {
  const lead = (opts.minLeadMinutes ?? 20) * 60_000;
  const taken = opts.taken ?? [];
  const candidates: { hour: number; basis: SlotResult["basis"] }[] = [
    ...opts.ownHours.slice(0, 4).map((hour) => ({ hour, basis: "own_posts" as const })),
    ...opts.researchHours.slice(0, 4).map((hour) => ({ hour, basis: "research" as const })),
    ...DEFAULT_HOURS.map((hour) => ({ hour, basis: "default" as const })),
  ];
  // Для каждого кандидата ищем ближайшее наступление часа за следующие 48 часов, шаг 15 минут.
  const start = Math.ceil((opts.now.getTime() + lead) / 900_000) * 900_000;
  const seen = new Set<number>();
  for (const c of candidates) {
    if (seen.has(c.hour)) continue;
    seen.add(c.hour);
    for (let t = start; t < start + 48 * 3_600_000; t += 900_000) {
      const d = new Date(t);
      const lh = localHour(d, opts.timeZone);
      if (lh.hour !== c.hour || lh.minute >= 15) continue;
      if (taken.some((x) => Math.abs(x.getTime() - t) < 90 * 60_000)) break;
      return { at: d, basis: c.basis };
    }
  }
  // Все слоты заняты: ставим через сутки после самого позднего занятого.
  const latest = Math.max(start, ...taken.map((x) => x.getTime()));
  return { at: new Date(Math.ceil((latest + 24 * 3_600_000) / 900_000) * 900_000), basis: "default" };
}

// ───────────── Промпт и разбор ответа модели ─────────────

export interface Enhancement {
  type: "live_data" | "behind_the_scenes" | "screenshot" | "timely_hook" | "question" | "story_detail";
  instruction: string;
}

export interface PostVariant {
  text: string;
  angle: string;
  rationale: string;
  enhancements: Enhancement[];
}

const ENHANCEMENT_TYPES = new Set(["live_data", "behind_the_scenes", "screenshot", "timely_hook", "question", "story_detail"]);

/** Плейсхолдеры вида [[today's MRR]]: пользователь должен подставить реальные данные до публикации. */
export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
}

export interface PromptInput {
  language: string;
  strategy: { role: string | null; topics: string[]; audience: string[]; contentTypes: string[]; tone: string | null; goals: string[]; formats: string[] };
  patterns: DetectedPattern[];
  patternBasis: "top_vs_recent" | "own_engagement" | "none";
  /** Образцы сильных постов (тексты берутся из выдачи в момент запроса и не сохраняются). */
  exemplars: string[];
  /** Тексты, которые пользователь уже опубликовал или получил в предыдущих вариантах: не повторять. */
  avoid: string[];
  variants: number;
}

export function buildThreadPrompt(input: PromptInput): { system: string; user: string } {
  const s = input.strategy;
  const patternLines = input.patterns.length
    ? input.patterns.slice(0, 5).map((p) => `- ${p.label} (x${p.lift.toFixed(2)}, ${p.sampleSize} posts, ${p.confidence} confidence)`).join("\n")
    : "- No measured patterns are available. Rely on the author's profile only.";
  const system = [
    "You write posts for a founder's Threads account. You write as the author, in first person, in their voice.",
    "Never invent facts, numbers, customers, quotes or events about the author. If a post needs a real number or detail from the author's day, put a placeholder in double square brackets, e.g. [[today's signups]], and describe it in enhancements.",
    `Every post must be at most ${THREADS_TEXT_LIMIT} characters, plain text, no hashtags unless essential, no emoji spam, no links.`,
    "Do not copy or closely paraphrase any example post. Use examples only to understand structure and tone.",
    "Reply with a single JSON object and nothing else.",
  ].join("\n");
  const user = [
    `Language: ${input.language}`,
    `Author: role=${s.role ?? "unspecified"}; topics=${s.topics.join(", ") || "unspecified"}; audience=${s.audience.join(", ") || "unspecified"}; content types=${s.contentTypes.join(", ") || "unspecified"}; tone=${s.tone ?? "unspecified"}; goals=${s.goals.join(", ") || "unspecified"}; formats=${s.formats.join(", ") || "unspecified"}.`,
    "",
    `Measured patterns (${input.patternBasis === "top_vs_recent" ? "features over-represented in top-ranked posts vs recent posts on the same topics" : input.patternBasis === "own_engagement" ? "features of the author's own best-performing posts" : "none"}):`,
    patternLines,
    input.exemplars.length ? `\nExample strong posts (structure only, do not copy):\n${input.exemplars.slice(0, 6).map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").slice(0, 280)}`).join("\n")}` : "",
    input.avoid.length ? `\nDo not repeat, paraphrase, or reuse the angle of these posts the author already published or scheduled:\n${input.avoid.slice(0, 12).map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 220)}`).join("\n")}` : "",
    "",
    `Write ${input.variants} distinct variants of ONE post idea. Each variant takes a different angle and applies the measured patterns where they fit.`,
    'For each variant add "enhancements": 1-3 concrete ways to make it more viral using LIVE content from the author\'s real day (real number, behind-the-scenes detail, screenshot, timely hook tied to something happening now, a sincere question). Each enhancement is {"type": one of live_data|behind_the_scenes|screenshot|timely_hook|question|story_detail, "instruction": what exactly the author should add}.',
    'JSON shape: {"variants":[{"text":"...","angle":"...","rationale":"why this should work, one sentence","enhancements":[{"type":"live_data","instruction":"..."}]}]}',
  ].filter(Boolean).join("\n");
  return { system, user };
}

/** Убирает блоки рассуждений вида <think>…</think>, которые добавляют некоторые модели. */
function stripReasoning(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
}

/** Ищет в тексте сбалансированный JSON-объект или массив, начиная с позиции start. Учитывает строки и экранирование. */
function balancedAt(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Первый JSON из ответа, в котором есть список вариантов (variants/posts) или сам массив постов. */
function findVariantList(raw: string): unknown[] | null {
  const text = stripReasoning(raw);
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{" && text[i] !== "[") continue;
    const chunk = balancedAt(text, i);
    if (!chunk) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(chunk);
    } catch {
      continue;
    }
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === "object" && x !== null)) return parsed;
    if (typeof parsed === "object" && parsed !== null) {
      const r = parsed as Record<string, unknown>;
      for (const key of ["variants", "posts", "options"]) if (Array.isArray(r[key])) return r[key] as unknown[];
    }
  }
  return null;
}

export interface ParseReport {
  variants: PostVariant[];
  /** Почему вариантов нет (для диагностики). Пусто, если всё хорошо. */
  reason: string;
}

export function parseVariantsReport(raw: string, max = 3): ParseReport {
  const list = findVariantList(raw);
  if (!list) return { variants: [], reason: `no JSON with posts found; reply starts: "${stripReasoning(raw).trim().slice(0, 160).replace(/\s+/g, " ")}"` };
  const out: PostVariant[] = [];
  const seen = new Set<string>();
  let tooLong = 0;
  let noText = 0;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const rawText = [r.text, r.post, r.content].find((x) => typeof x === "string");
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) { noText++; continue; }
    if ([...text].length > THREADS_TEXT_LIMIT) { tooLong++; continue; }
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    const enhancements: Enhancement[] = Array.isArray(r.enhancements)
      ? r.enhancements.flatMap((e: unknown) => {
          if (typeof e !== "object" || e === null) return [];
          const x = e as Record<string, unknown>;
          return typeof x.type === "string" && ENHANCEMENT_TYPES.has(x.type) && typeof x.instruction === "string" && x.instruction.trim()
            ? [{ type: x.type as Enhancement["type"], instruction: x.instruction.trim().slice(0, 300) }]
            : [];
        }).slice(0, 3)
      : [];
    out.push({
      text,
      angle: typeof r.angle === "string" ? r.angle.trim().slice(0, 120) : "",
      rationale: typeof r.rationale === "string" ? r.rationale.trim().slice(0, 300) : "",
      enhancements,
    });
    if (out.length >= max) break;
  }
  const reason = out.length ? "" : `found ${list.length} items but none usable (${tooLong} over ${THREADS_TEXT_LIMIT} characters, ${noText} without text)`;
  return { variants: out, reason };
}

/** Достаёт посты из ответа модели и проверяет каждый вариант. */
export function parseVariants(raw: string, max = 3): PostVariant[] {
  return parseVariantsReport(raw, max).variants;
}
