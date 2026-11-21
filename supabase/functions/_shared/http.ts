export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type EnvResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; missing: string[] };

/** Проверяет наличие переменных окружения. Возвращает только имена отсутствующих, значения не логируются. */
export function readEnv(names: readonly string[], get: (name: string) => string | undefined): EnvResult {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const v = get(name);
    if (v && v.trim() !== "") values[name] = v;
    else missing.push(name);
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, values };
}
