// Шифрование OAuth-токенов перед записью в БД: AES-256-GCM.
// Ключ (TOKEN_ENCRYPTION_KEY) хранится только в секретах Edge Functions.
// Формат хранимой строки: v1.<iv base64>.<шифртекст base64>

const VERSION = "v1";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = b64ToBytes(keyB64.trim());
  } catch {
    throw new Error("TOKEN_ENCRYPTION_KEY is not valid base64");
  }
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (use: openssl rand -base64 32)");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${VERSION}.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(stored: string, keyB64: string): Promise<string> {
  const [version, ivB64, dataB64] = stored.split(".");
  if (version !== VERSION || !ivB64 || !dataB64) throw new Error("Unsupported encrypted value format");
  const key = await importKey(keyB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(ivB64) }, key, b64ToBytes(dataB64));
  return new TextDecoder().decode(plain);
}
