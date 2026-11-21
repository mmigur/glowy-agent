import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Прогоняет настоящую миграцию на настоящем Postgres (WASM) и проверяет RLS.
 * Supabase-специфичное (схема auth, роли, auth.uid()) эмулируется заглушкой ниже.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrations = ["0001_init.sql", "0002_oauth_states.sql", "0003_agent_threads.sql"].map((f) =>
  readFileSync(resolve(here, "../migrations", f), "utf8"),
);

const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
`;

// В Supabase права на новые таблицы public выдаются по умолчанию ещё до миграции,
// а миграция затем отзывает лишнее. Здесь тот же порядок: сначала default privileges.
const SUPABASE_DEFAULT_PRIVILEGES = `
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const SERVICE_ROLE_FUNCTIONS = `
  grant execute on all functions in schema public to service_role;
`;

let db: PGlite;
const userA = "11111111-1111-1111-1111-111111111111";
const userB = "22222222-2222-2222-2222-222222222222";

async function asUser(uid: string | null) {
  await db.exec("reset role");
  if (uid) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.exec("set role authenticated");
  } else {
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("set role anon");
  }
}

async function asService() {
  await db.exec("reset role");
  await db.exec("set role service_role");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SUPABASE_DEFAULT_PRIVILEGES);
  for (const sql of migrations) await db.exec(sql);
  await db.exec(SERVICE_ROLE_FUNCTIONS);

  await db.exec(`insert into auth.users (id, email) values ('${userA}', 'a@test.dev'), ('${userB}', 'b@test.dev')`);
  await asService();
  await db.exec(`
    insert into public.social_accounts (id, user_id, platform, platform_user_id, username)
    values
      ('aaaaaaaa-0000-0000-0000-000000000001', '${userA}', 'x', 'x-a', 'alice'),
      ('bbbbbbbb-0000-0000-0000-000000000001', '${userB}', 'x', 'x-b', 'bob');
    insert into public.social_tokens (account_id, access_token_enc) values
      ('aaaaaaaa-0000-0000-0000-000000000001', 'enc:secret-a');
    insert into public.drafts (id, user_id, text) values
      ('dddddddd-0000-0000-0000-00000000000a', '${userA}', 'draft of A'),
      ('dddddddd-0000-0000-0000-00000000000b', '${userB}', 'draft of B');
  `);
});

describe("migration", () => {
  it("applies cleanly and seeds the Pro plan with a 30 day trial at $15", async () => {
    await asService();
    const r = await db.query<{ price_cents: number; trial_days: number }>(
      "select price_cents, trial_days from public.plans where id = 'pro'",
    );
    expect(r.rows[0]).toEqual({ price_cents: 1500, trial_days: 30 });
  });

  it("creates a profile automatically for every new auth user", async () => {
    await asService();
    const r = await db.query("select id from public.profiles order by id");
    expect(r.rows).toHaveLength(2);
  });
});

describe("row level security", () => {
  it("lets a user read only their own drafts", async () => {
    await asUser(userA);
    const r = await db.query<{ text: string }>("select text from public.drafts");
    expect(r.rows.map((x) => x.text)).toEqual(["draft of A"]);
  });

  it("blocks writing a draft for another user", async () => {
    await asUser(userA);
    await expect(
      db.query("insert into public.drafts (user_id, text) values ($1, 'hijack')", [userB]),
    ).rejects.toThrow();
  });

  it("does not let users touch another user's draft", async () => {
    await asUser(userA);
    await db.query("update public.drafts set text = 'changed' where id = 'dddddddd-0000-0000-0000-00000000000b'");
    await asService();
    const r = await db.query<{ text: string }>("select text from public.drafts where id = 'dddddddd-0000-0000-0000-00000000000b'");
    expect(r.rows[0]?.text).toBe("draft of B");
  });

  it("hides OAuth tokens from authenticated users entirely", async () => {
    await asUser(userA);
    await expect(db.query("select * from public.social_tokens")).rejects.toThrow(/permission denied/i);
  });

  it("hides observed posts, API usage and Stripe events from clients", async () => {
    await asUser(userA);
    await expect(db.query("select * from public.observed_posts")).rejects.toThrow(/permission denied/i);
    await expect(db.query("select * from public.api_usage")).rejects.toThrow(/permission denied/i);
    await expect(db.query("select * from public.stripe_events")).rejects.toThrow(/permission denied/i);
  });

  it("shows no data to anonymous visitors", async () => {
    await asUser(null);
    await expect(db.query("select * from public.drafts")).resolves.toMatchObject({ rows: [] });
    await expect(db.query("select * from public.plans")).resolves.toMatchObject({ rows: [] });
  });

  it("does not let a user create a social account directly", async () => {
    await asUser(userA);
    await expect(
      db.query(
        "insert into public.social_accounts (user_id, platform, platform_user_id, username) values ($1, 'threads', 't-1', 'fake')",
        [userA],
      ),
    ).rejects.toThrow();
  });

  it("does not let a user rewrite their own subscription", async () => {
    await asService();
    await db.query(
      "insert into public.subscriptions (user_id, plan_id, status) values ($1, 'pro', 'trialing')",
      [userA],
    );
    await asUser(userA);
    // Без UPDATE-политики RLS молча отфильтровывает строки: запрос не падает, но ничего не меняет.
    await db.query("update public.subscriptions set status = 'active' where user_id = $1", [userA]);
    await asService();
    const r = await db.query<{ status: string }>("select status from public.subscriptions where user_id = $1", [userA]);
    expect(r.rows[0]?.status).toBe("trialing");
  });
});

describe("oauth states", () => {
  it("is invisible to clients", async () => {
    await asUser(userA);
    await expect(db.query("select * from public.oauth_states")).rejects.toThrow(/permission denied/i);
    await expect(
      db.query("insert into public.oauth_states (state, user_id, platform) values ('s', $1, 'threads')", [userA]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("is consumed exactly once and honours expiry", async () => {
    await asService();
    await db.query("insert into public.oauth_states (state, user_id, platform) values ('fresh', $1, 'threads')", [userA]);
    await db.query(
      "insert into public.oauth_states (state, user_id, platform, expires_at) values ('stale', $1, 'threads', now() - interval '1 minute')",
      [userA],
    );
    const take = (state: string) =>
      db.query("delete from public.oauth_states where state = $1 and expires_at > now() returning user_id", [state]);
    expect((await take("fresh")).rows).toHaveLength(1);
    expect((await take("fresh")).rows).toHaveLength(0);
    expect((await take("stale")).rows).toHaveLength(0);
  });

  it("lets a user disconnect their own account and removes the stored token with it", async () => {
    await asService();
    await db.query(
      "insert into public.social_accounts (id, user_id, platform, platform_user_id, username) values ('cccccccc-0000-0000-0000-000000000001', $1, 'threads', 't-a', 'alice_t')",
      [userA],
    );
    await db.query("insert into public.social_tokens (account_id, access_token_enc) values ('cccccccc-0000-0000-0000-000000000001', 'v1.x.y')");
    await asUser(userB);
    await db.query("delete from public.social_accounts where id = 'cccccccc-0000-0000-0000-000000000001'");
    await asService();
    expect((await db.query("select 1 from public.social_accounts where id = 'cccccccc-0000-0000-0000-000000000001'")).rows).toHaveLength(1);

    await asUser(userA);
    await db.query("delete from public.social_accounts where id = 'cccccccc-0000-0000-0000-000000000001'");
    await asService();
    expect((await db.query("select 1 from public.social_accounts where id = 'cccccccc-0000-0000-0000-000000000001'")).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.social_tokens where account_id = 'cccccccc-0000-0000-0000-000000000001'")).rows).toHaveLength(0);
  });
});

describe("publishing queue", () => {
  const accountA = "aaaaaaaa-0000-0000-0000-000000000001";
  const draftA = "dddddddd-0000-0000-0000-00000000000a";

  it("rejects a duplicate idempotency key", async () => {
    await asUser(userA);
    await db.query(
      `insert into public.publications (draft_id, account_id, user_id, scheduled_for, idempotency_key)
       values ($1, $2, $3, now() - interval '1 minute', 'key-1')`,
      [draftA, accountA, userA],
    );
    await expect(
      db.query(
        `insert into public.publications (draft_id, account_id, user_id, scheduled_for, idempotency_key)
         values ($1, $2, $3, now(), 'key-1')`,
        [draftA, accountA, userA],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("blocks scheduling onto someone else's account", async () => {
    await asUser(userA);
    await expect(
      db.query(
        `insert into public.publications (draft_id, account_id, user_id, scheduled_for, idempotency_key)
         values ($1, 'bbbbbbbb-0000-0000-0000-000000000001', $2, now(), 'key-evil')`,
        [draftA, userA],
      ),
    ).rejects.toThrow();
  });

  it("forbids clients from calling the claim function", async () => {
    await asUser(userA);
    await expect(db.query("select * from public.claim_due_publications(5)")).rejects.toThrow(/permission denied/i);
  });

  it("claims a due publication exactly once", async () => {
    await asService();
    const first = await db.query<{ status: string; attempts: number }>("select * from public.claim_due_publications(5)");
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ status: "publishing", attempts: 1 });
    const second = await db.query("select * from public.claim_due_publications(5)");
    expect(second.rows).toHaveLength(0);
  });

  it("lets a user cancel only a publication that is still scheduled", async () => {
    await asUser(userA);
    await db.query(
      `insert into public.publications (draft_id, account_id, user_id, scheduled_for, idempotency_key)
       values ($1, $2, $3, now() + interval '1 day', 'key-future')`,
      [draftA, accountA, userA],
    );
    await db.query("update public.publications set status = 'cancelled' where idempotency_key = 'key-future'");
    await asService();
    const cancelled = await db.query<{ status: string }>("select status from public.publications where idempotency_key = 'key-future'");
    expect(cancelled.rows[0]?.status).toBe("cancelled");

    await asUser(userA);
    await expect(
      db.query("update public.publications set status = 'published' where idempotency_key = 'key-1'"),
    ).resolves.toBeDefined();
    await asService();
    const stillPublishing = await db.query<{ status: string }>("select status from public.publications where idempotency_key = 'key-1'");
    expect(stillPublishing.rows[0]?.status).toBe("publishing");
  });

  describe("agent threads", () => {
    const accA = "aaaaaaaa-0000-0000-0000-000000000001";

    it("hands out exactly the daily limit and then refuses", async () => {
      await asUser(userA);
      const usage = await db.query<{ used: number; daily_limit: number }>("select * from public.thread_usage()");
      expect(usage.rows[0]).toMatchObject({ used: 0, daily_limit: 5 });
      for (let i = 0; i < 5; i++) await db.query("select public.start_agent_thread($1)", [accA]);
      await expect(db.query("select public.start_agent_thread($1)", [accA])).rejects.toMatchObject({ code: "P0429" });
      const after = await db.query<{ used: number }>("select * from public.thread_usage()");
      expect(after.rows[0]!.used).toBe(5);
    });

    it("does not count failed threads and does not touch other users", async () => {
      await asService();
      await db.exec(`update public.agent_threads set status = 'failed' where user_id = '${userA}' and id in (select id from public.agent_threads where user_id = '${userA}' limit 2)`);
      await asUser(userA);
      const usage = await db.query<{ used: number }>("select * from public.thread_usage()");
      expect(usage.rows[0]!.used).toBe(3);
      await asUser(userB);
      const b = await db.query<{ used: number }>("select * from public.thread_usage()");
      expect(b.rows[0]!.used).toBe(0);
      const rows = await db.query("select * from public.agent_threads");
      expect(rows.rows).toHaveLength(0);
    });

    it("refuses someone else's account and direct writes", async () => {
      await asUser(userB);
      await expect(db.query("select public.start_agent_thread($1)", [accA])).rejects.toMatchObject({ code: "P0404" });
      await expect(db.query("insert into public.agent_threads (user_id) values ($1)", [userB])).rejects.toThrow();
    });

    it("schedules one variant and rejects its siblings", async () => {
      await asService();
      const t = await db.query<{ id: string }>(`insert into public.agent_threads (user_id, account_id, status) values ('${userA}', '${accA}', 'ready') returning id`);
      const tid = t.rows[0]!.id;
      await db.exec(`insert into public.drafts (id, user_id, account_id, thread_id, text) values
        ('eeeeeeee-0000-0000-0000-000000000001', '${userA}', '${accA}', '${tid}', 'variant one'),
        ('eeeeeeee-0000-0000-0000-000000000002', '${userA}', '${accA}', '${tid}', 'variant two'),
        ('eeeeeeee-0000-0000-0000-000000000003', '${userA}', '${accA}', '${tid}', 'needs [[today''s number]] first')`);
      await asUser(userA);
      await expect(db.query("select public.schedule_draft('eeeeeeee-0000-0000-0000-000000000003', now() + interval '2 hours')")).rejects.toMatchObject({ code: "P0400" });
      await expect(db.query("select public.schedule_draft('eeeeeeee-0000-0000-0000-000000000001', now() - interval '1 hour')")).rejects.toMatchObject({ code: "P0400" });
      await db.query("select public.schedule_draft('eeeeeeee-0000-0000-0000-000000000001', now() + interval '2 hours')");
      await expect(db.query("select public.schedule_draft('eeeeeeee-0000-0000-0000-000000000001', now() + interval '3 hours')")).rejects.toMatchObject({ code: "P0409" });
      const drafts = await db.query<{ id: string; status: string }>(`select id, status from public.drafts where thread_id = '${tid}' order by id`);
      expect(drafts.rows.map((r) => r.status)).toEqual(["scheduled", "rejected", "rejected"]);
      const th = await db.query<{ status: string }>(`select status from public.agent_threads where id = '${tid}'`);
      expect(th.rows[0]!.status).toBe("scheduled");
    });

    it("cannot schedule another user's draft", async () => {
      await asUser(userB);
      await expect(db.query("select public.schedule_draft('dddddddd-0000-0000-0000-00000000000a', now() + interval '2 hours')")).rejects.toMatchObject({ code: "P0404" });
    });
  });
});
