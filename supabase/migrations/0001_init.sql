-- AI Social Media Growth Agent: начальная схема.
-- Принципы:
--  * RLS включён на всех таблицах. Пользователь видит только свои строки.
--  * Таблицы с токенами, чужим контентом и расходами API доступны только service_role (Edge Functions).
--  * Тексты чужих постов не храним: только ID, метрики и производные признаки.
--  * NULL в метриках означает «платформа не отдала», а не ноль.

-- ───────────── Типы ─────────────
create type public.platform_kind as enum ('x', 'threads');
create type public.draft_status as enum ('suggested', 'draft', 'scheduled', 'rejected', 'published');
create type public.publication_status as enum ('scheduled', 'publishing', 'published', 'failed', 'cancelled');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type public.research_window as enum ('24h', '7d');
create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed');

-- ───────────── Утилиты ─────────────
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────── Профиль и стратегия ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.user_strategy (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text,
  topics text[] not null default '{}',
  content_types text[] not null default '{}',
  tone text,
  goals text[] not null default '{}',
  posting_frequency text,
  formats text[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_strategy_updated_at before update on public.user_strategy
  for each row execute function public.set_updated_at();

-- ───────────── Соцсети ─────────────
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform public.platform_kind not null,
  platform_user_id text not null,
  username text not null,
  display_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'needs_reauth', 'revoked')),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_user_id)
);
create index social_accounts_user_idx on public.social_accounts (user_id);
create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.set_updated_at();

-- Токены хранятся зашифрованными приложением (ключ в секретах Edge Functions).
-- Клиентские роли доступа к таблице не имеют вообще.
create table public.social_tokens (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  refresh_after timestamptz,
  updated_at timestamptz not null default now()
);
create trigger social_tokens_updated_at before update on public.social_tokens
  for each row execute function public.set_updated_at();

-- ───────────── Исследование ниш (общее для всех пользователей) ─────────────
create table public.niches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  queries jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_niches (
  user_id uuid not null references public.profiles (id) on delete cascade,
  niche_id uuid not null references public.niches (id) on delete cascade,
  primary key (user_id, niche_id)
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches (id) on delete cascade,
  platform public.platform_kind not null,
  time_window public.research_window not null,
  status public.run_status not null default 'queued',
  posts_fetched integer not null default 0,
  est_cost_usd numeric(10, 4) not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index research_runs_niche_idx on public.research_runs (niche_id, created_at desc);

-- Чужой контент: только производные данные, без текста.
create table public.observed_posts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.research_runs (id) on delete set null,
  niche_id uuid not null references public.niches (id) on delete cascade,
  platform public.platform_kind not null,
  platform_post_id text not null,
  author_ref text not null,
  author_followers integer,
  posted_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  score numeric,
  score_basis text check (score_basis in ('impressions', 'followers', 'raw')),
  fetched_at timestamptz not null default now(),
  unique (platform, platform_post_id, niche_id)
);
create index observed_posts_niche_idx on public.observed_posts (niche_id, posted_at desc);

create table public.patterns (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid not null references public.niches (id) on delete cascade,
  platform public.platform_kind not null,
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  lift numeric,
  sample_size integer not null default 0,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now()
);
create index patterns_niche_idx on public.patterns (niche_id, platform);

-- ───────────── Контент и публикации ─────────────
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid references public.social_accounts (id) on delete set null,
  parent_draft_id uuid references public.drafts (id) on delete set null,
  text text not null,
  thread_parts jsonb,
  pattern_id uuid references public.patterns (id) on delete set null,
  audience text,
  rationale text,
  enhancements jsonb not null default '[]'::jsonb,
  recommended_at timestamptz,
  predicted jsonb,
  status public.draft_status not null default 'suggested',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drafts_user_status_idx on public.drafts (user_id, status, created_at desc);
create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_for timestamptz not null,
  status public.publication_status not null default 'scheduled',
  idempotency_key text not null unique,
  platform_post_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index publications_due_idx on public.publications (status, scheduled_for);
create index publications_user_idx on public.publications (user_id, scheduled_for desc);
create trigger publications_updated_at before update on public.publications
  for each row execute function public.set_updated_at();

-- Атомарно забирает готовые к публикации записи. Параллельные воркеры не получат одну и ту же строку.
create function public.claim_due_publications(batch_size integer default 10)
returns setof public.publications
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select p.id
    from public.publications p
    where p.status = 'scheduled'
      and p.scheduled_for <= now()
      and (p.next_attempt_at is null or p.next_attempt_at <= now())
    order by p.scheduled_for
    limit batch_size
    for update skip locked
  )
  update public.publications p
     set status = 'publishing',
         locked_at = now(),
         attempts = p.attempts + 1
    from due
   where p.id = due.id
  returning p.*;
end;
$$;
revoke all on function public.claim_due_publications(integer) from public;

-- ───────────── Аналитика и обучение ─────────────
create table public.post_metrics (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.publications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  captured_at timestamptz not null default now(),
  impressions integer,
  likes integer,
  replies integer,
  reposts integer,
  quotes integer,
  raw jsonb,
  unique (publication_id, captured_at)
);
create index post_metrics_user_idx on public.post_metrics (user_id, captured_at desc);

create table public.account_snapshots (
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  day date not null,
  followers integer,
  following integer,
  primary key (account_id, day)
);

create table public.pattern_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pattern_id uuid not null references public.patterns (id) on delete cascade,
  trials integer not null default 0,
  mean_normalized_engagement numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, pattern_id)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period text not null,
  kind text not null,
  body text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index insights_user_idx on public.insights (user_id, created_at desc);

create table public.autopilot_settings (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  posts_per_day integer not null default 1 check (posts_per_day between 1 and 10),
  windows jsonb not null default '[]'::jsonb,
  max_per_week integer check (max_per_week is null or max_per_week > 0),
  require_review boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger autopilot_settings_updated_at before update on public.autopilot_settings
  for each row execute function public.set_updated_at();

-- ───────────── Логи и расходы ─────────────
create table public.agent_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  account_id uuid references public.social_accounts (id) on delete set null,
  action text not null,
  input jsonb,
  output jsonb,
  cost_usd numeric(10, 4),
  created_at timestamptz not null default now()
);
create index agent_logs_user_idx on public.agent_logs (user_id, created_at desc);

create table public.api_usage (
  id bigint generated always as identity primary key,
  provider text not null,
  endpoint text not null,
  units integer not null default 1,
  est_cost_usd numeric(10, 4) not null default 0,
  user_id uuid references public.profiles (id) on delete set null,
  niche_id uuid references public.niches (id) on delete set null,
  created_at timestamptz not null default now()
);
create index api_usage_day_idx on public.api_usage (provider, created_at desc);

-- ───────────── Биллинг ─────────────
create table public.plans (
  id text primary key,
  name text not null,
  stripe_price_id text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd',
  billing_interval text not null default 'month',
  trial_days integer not null default 0,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

insert into public.plans (id, name, price_cents, trial_days, limits)
values ('pro', 'Pro', 1500, 30, '{"accounts": 1, "posts_per_day": 5}'::jsonb);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stripe_invoice_id text not null unique,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Идемпотентность вебхуков Stripe: событие с тем же id повторно не обрабатывается.
create table public.stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ───────────── RLS ─────────────
alter table public.profiles enable row level security;
alter table public.user_strategy enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_tokens enable row level security;
alter table public.niches enable row level security;
alter table public.user_niches enable row level security;
alter table public.research_runs enable row level security;
alter table public.observed_posts enable row level security;
alter table public.patterns enable row level security;
alter table public.drafts enable row level security;
alter table public.publications enable row level security;
alter table public.post_metrics enable row level security;
alter table public.account_snapshots enable row level security;
alter table public.pattern_stats enable row level security;
alter table public.insights enable row level security;
alter table public.autopilot_settings enable row level security;
alter table public.agent_logs enable row level security;
alter table public.api_usage enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;

-- Свои данные: чтение и изменение.
create policy profiles_own on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy user_strategy_own on public.user_strategy for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_niches_own on public.user_niches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy drafts_own on public.drafts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy autopilot_own on public.autopilot_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Аккаунты: пользователь видит и отключает свои, но создаются они только через OAuth-функцию (service_role).
create policy social_accounts_select on public.social_accounts for select
  using (user_id = auth.uid());
create policy social_accounts_delete on public.social_accounts for delete
  using (user_id = auth.uid());

-- Публикации: видит свои, может только отменить ещё не взятую в работу.
create policy publications_select on public.publications for select
  using (user_id = auth.uid());
create policy publications_insert on public.publications for insert
  with check (
    user_id = auth.uid()
    and status = 'scheduled'
    and exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = auth.uid())
    and exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
  );
create policy publications_cancel on public.publications for update
  using (user_id = auth.uid() and status = 'scheduled')
  with check (user_id = auth.uid() and status in ('scheduled', 'cancelled'));

-- Только чтение своего.
create policy post_metrics_select on public.post_metrics for select using (user_id = auth.uid());
create policy pattern_stats_select on public.pattern_stats for select using (user_id = auth.uid());
create policy insights_select on public.insights for select using (user_id = auth.uid());
create policy agent_logs_select on public.agent_logs for select using (user_id = auth.uid());
create policy subscriptions_select on public.subscriptions for select using (user_id = auth.uid());
create policy payments_select on public.payments for select using (user_id = auth.uid());
create policy account_snapshots_select on public.account_snapshots for select
  using (exists (select 1 from public.social_accounts a where a.id = account_id and a.user_id = auth.uid()));

-- Общие данные ниш: чтение для вошедших пользователей, запись только service_role.
create policy niches_read on public.niches for select to authenticated using (true);
create policy research_runs_read on public.research_runs for select to authenticated using (true);
create policy patterns_read on public.patterns for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (is_active);

-- Без политик (доступ только у service_role): social_tokens, observed_posts, api_usage, stripe_events.
revoke all on public.social_tokens from anon, authenticated;
revoke all on public.observed_posts from anon, authenticated;
revoke all on public.api_usage from anon, authenticated;
revoke all on public.stripe_events from anon, authenticated;
