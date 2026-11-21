// Разбор и проверка signed_request, который Meta присылает в обратных вызовах
// (отзыв доступа, запрос на удаление данных).
// Формат (документация Meta, Data Deletion Request Callback): "<подпись>.<данные>",
// обе части в base64url, подпись = HMAC-SHA256 от ещё закодированной второй части ключом app secret.

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface SignedRequestPayload {
  /** Идентификатор пользователя Threads. Всегда строка: числа такого размера теряют точность в JSON. */
  userId: string;
}

/**
 * Возвращает данные запроса или null, если запрос подделан или повреждён.
 * Подпись проверяется функцией crypto.subtle.verify (сравнение за постоянное время).
 */
export async function parseSignedRequest(signedRequest: string, appSecret: string): Promise<SignedRequestPayload | null> {
  const dot = signedRequest.indexOf(".");
  if (dot <= 0 || dot === signedRequest.length - 1) return null;
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);

  let signature: Uint8Array<ArrayBuffer>;
  let payloadText: string;
  try {
    signature = b64urlToBytes(encodedSig);
    payloadText = new TextDecoder().decode(b64urlToBytes(encodedPayload));
  } catch {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(encodedPayload));
  if (!valid) return null;

  // Алгоритм, если указан, должен быть HMAC-SHA256.
  const algorithm = /"algorithm"\s*:\s*"([^"]+)"/.exec(payloadText)?.[1];
  if (algorithm && algorithm.toUpperCase() !== "HMAC-SHA256") return null;

  // user_id достаём из исходного текста, а не через JSON.parse: идентификаторы Threads
  // больше 2^53 и при разборе числа потеряли бы точность.
  const userId = /"user_id"\s*:\s*"?(\d+)"?/.exec(payloadText)?.[1];
  if (!userId) return null;
  return { userId };
}

/** Читает signed_request из form-urlencoded или JSON тела запроса. */
export async function readSignedRequest(req: Request): Promise<string | null> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body: unknown = await req.json();
      if (typeof body === "object" && body !== null && "signed_request" in body && typeof body.signed_request === "string") {
        return body.signed_request;
      }
      return null;
    }
    const form = await req.formData();
    const value = form.get("signed_request");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
