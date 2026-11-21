import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignedRequest, readSignedRequest } from "../functions/_shared/signed-request.ts";

const SECRET = "test-app-secret";

function sign(payloadText: string, secret = SECRET): string {
  const payload = Buffer.from(payloadText).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${sig}.${payload}`;
}

describe("parseSignedRequest", () => {
  it("accepts a valid request with a string user_id", async () => {
    const r = await parseSignedRequest(sign('{"algorithm":"HMAC-SHA256","user_id":"123"}'), SECRET);
    expect(r).toEqual({ userId: "123" });
  });

  it("keeps a numeric user_id above 2^53 exact", async () => {
    const r = await parseSignedRequest(sign('{"algorithm":"HMAC-SHA256","user_id":9007199254740993123}'), SECRET);
    expect(r).toEqual({ userId: "9007199254740993123" });
  });

  it("rejects a wrong secret", async () => {
    expect(await parseSignedRequest(sign('{"user_id":"1"}', "other"), SECRET)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const good = sign('{"user_id":"1"}');
    const sig = good.split(".")[0];
    const forged = `${sig}.${Buffer.from('{"user_id":"2"}').toString("base64url")}`;
    expect(await parseSignedRequest(forged, SECRET)).toBeNull();
  });

  it("rejects a different algorithm", async () => {
    expect(await parseSignedRequest(sign('{"algorithm":"HMAC-SHA1","user_id":"1"}'), SECRET)).toBeNull();
  });

  it("rejects a payload without user_id", async () => {
    expect(await parseSignedRequest(sign('{"algorithm":"HMAC-SHA256"}'), SECRET)).toBeNull();
  });

  it("rejects malformed input", async () => {
    for (const bad of ["", "abc", ".", "abc.", ".abc", "!!!.???"]) {
      expect(await parseSignedRequest(bad, SECRET)).toBeNull();
    }
  });
});

describe("readSignedRequest", () => {
  it("reads form-encoded bodies", async () => {
    const req = new Request("https://x.test", { method: "POST", body: new URLSearchParams({ signed_request: "a.b" }) });
    expect(await readSignedRequest(req)).toBe("a.b");
  });

  it("reads JSON bodies", async () => {
    const req = new Request("https://x.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signed_request: "a.b" }),
    });
    expect(await readSignedRequest(req)).toBe("a.b");
  });

  it("returns null when the field is missing", async () => {
    const req = new Request("https://x.test", { method: "POST", body: new URLSearchParams({ other: "1" }) });
    expect(await readSignedRequest(req)).toBeNull();
  });
});
