-- Одноразовые значения state для OAuth. Защищают от подмены ответа (CSRF) и связывают
-- возврат из Threads с пользователем, который нажал Connect.
-- Доступ только у service_role (Edge Functions). Клиент таблицу не видит.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform public.platform_kind not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index oauth_states_expires_idx on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;
