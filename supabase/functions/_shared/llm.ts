// Вызов Claude через Anthropic Messages API. Ключ хранится только в секретах функции.
import type { FetchFn } from "./threads.ts";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export class LlmError extends Error {}

export async function askClaude(
  fetchFn: FetchFn,
  input: { apiKey: string; model: string; system: string; user: string; maxTokens?: number },
): Promise<string> {
  const res = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 1800,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // не JSON
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error ? String((body.error as { message: unknown }).message) : `HTTP ${res.status}`;
    throw new LlmError(`The model request failed: ${msg}`);
  }
  const content = typeof body === "object" && body !== null && "content" in body && Array.isArray(body.content) ? body.content : [];
  const text = content.map((c: unknown) => (typeof c === "object" && c !== null && "text" in c && typeof c.text === "string" ? c.text : "")).join("");
  if (!text) throw new LlmError("The model returned an empty answer");
  return text;
}

export interface LlmConfig {
  /** Какой провайдер выбран: Claude напрямую или любой OpenAI-совместимый (OpenRouter, DeepSeek, Groq, Gemini, OpenAI). */
  kind: "anthropic" | "openai_compatible";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** Выбирает провайдера по секретам. Claude, если есть ANTHROPIC_API_KEY, иначе LLM_API_KEY + LLM_MODEL (+ LLM_BASE_URL). */
export function resolveLlmConfig(get: (name: string) => string | undefined): LlmConfig | null {
  const anthropic = get("ANTHROPIC_API_KEY");
  if (anthropic) return { kind: "anthropic", apiKey: anthropic, model: get("ANTHROPIC_MODEL") || DEFAULT_MODEL };
  const key = get("LLM_API_KEY");
  const model = get("LLM_MODEL");
  if (key && model) return { kind: "openai_compatible", apiKey: key, model, baseUrl: (get("LLM_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/+$/, "") };
  return null;
}

async function askOpenAiCompatible(fetchFn: FetchFn, cfg: LlmConfig, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // не JSON
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error ? String((body.error as { message: unknown }).message) : `HTTP ${res.status}`;
    throw new LlmError(`The model request failed: ${msg}`);
  }
  const choices = typeof body === "object" && body !== null && "choices" in body && Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0] as { message?: { content?: unknown }; finish_reason?: unknown } | undefined;
  const content = first?.message?.content;
  // Одни провайдеры отдают строку, другие массив частей {type:"text", text}.
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((c: unknown) => (typeof c === "object" && c !== null && "text" in c && typeof c.text === "string" ? c.text : "")).join("")
      : "";
  if (!text.trim()) {
    const servedBy = typeof body === "object" && body !== null && "model" in body ? String((body as { model: unknown }).model) : "unknown";
    const reason = typeof first?.finish_reason === "string" ? first.finish_reason : "none";
    console.error(`llm: empty answer from model=${servedBy} finish_reason=${reason}`);
    throw new LlmError(`The model returned an empty answer (${servedBy}, finish: ${reason})`);
  }
  return text;
}

export function askLlm(fetchFn: FetchFn, cfg: LlmConfig, input: { system: string; user: string; maxTokens?: number }): Promise<string> {
  // Модели с «рассуждением» тратят часть лимита на мысли, поэтому у совместимых провайдеров лимит больше.
  const maxTokens = input.maxTokens ?? (cfg.kind === "anthropic" ? 1800 : 6000);
  return cfg.kind === "anthropic"
    ? askClaude(fetchFn, { apiKey: cfg.apiKey, model: cfg.model, system: input.system, user: input.user, maxTokens })
    : askOpenAiCompatible(fetchFn, cfg, input.system, input.user, maxTokens);
}
