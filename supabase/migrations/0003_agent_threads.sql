-- «Тред» агента: один проход исследование → паттерны → варианты поста → время → публикация.
-- Лимит в сутки считается атомарно в базе, а не в приложении.

create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid references public.social_accounts (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'ready', 'scheduled', 'failed')),
  research_source text check (research_source in ('public_search', 'own_posts', 'none')),
  pattern_basis text check (pattern_basis in ('top_vs_recent', 'own_engagement', 'none')),
  patterns jsonb not null default '[]'::jsonb,
  recommended_at timestamptz,
  time_basis text check (time_basis in ('own_posts', 'research', 'default')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_threads_user_idx on public.agent_threads (user_id, created_at desc);
create trigger agent_threads_updated_at before update on public.agent_threads
  for each row execute function public.set_updated_at();

alter table public.agent_threads enable row level security;
create policy agent_threads_select on public.agent_threads for select using (user_id = auth.uid());
-- Пишет только серверная часть (service_role) и функции ниже.
revoke insert, update, delete on public.agent_threads from anon, authenticated;
revoke all on public.agent_threads from anon;

alter table public.drafts add column thread_id uuid references public.agent_threads (id) on delete set null;
create index drafts_thread_idx on public.drafts (thread_id);

-- Лимит тредов в сутки. Пока нет Stripe, у всех действует лимит тарифа pro.
create function public._threads_daily_limit(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (pl.limits ->> 'posts_per_day')::integer
       from public.subscriptions s join public.plans pl on pl.id = s.plan_id
      where s.user_id = p_user and s.status in ('trialing', 'active')),
    (select (limits ->> 'posts_per_day')::integer from public.plans where id = 'pro'),
    5
  );
$$;
revoke all on function public._threads_daily_limit(uuid) from public;

-- Начало текущих суток по часовому поясу пользователя.
create function public._user_day_start(p_user uuid) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  select timezone into tz from public.profiles where id = p_user;
  begin
    return date_trunc('day', now() at time zone coalesce(tz, 'UTC')) at time zone coalesce(tz, 'UTC');
  exception when others then
    return date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  end;
end;
$$;
revoke all on function public._user_day_start(uuid) from public;

-- Неудачные треды и «зависшие» (выполняются дольше 10 минут) лимит не расходуют.
create function public._threads_used_today(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.agent_threads t
   where t.user_id = p_user
     and t.created_at >= public._user_day_start(p_user)
     and t.status <> 'failed'
     and not (t.status = 'running' and t.created_at < now() - interval '10 minutes');
$$;
revoke all on function public._threads_used_today(uuid) from public;

create function public.thread_usage()
returns table (used integer, daily_limit integer, resets_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query select public._threads_used_today(uid),
                      public._threads_daily_limit(uid),
                      public._user_day_start(uid) + interval '1 day';
end;
$$;

-- Занимает слот. Если лимит исчерпан, бросает ошибку P0429. Параллельные вызовы не обходят лимит.
create function public.start_agent_thread(p_account uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.social_accounts a where a.id = p_account and a.user_id = uid and a.status = 'active') then
    raise exception 'account_not_found' using errcode = 'P0404';
  end if;
  perform pg_advisory_xact_lock(hashtext('agent_thread:' || uid::text));
  if public._threads_used_today(uid) >= public._threads_daily_limit(uid) then
    raise exception 'daily_limit_reached' using errcode = 'P0429';
  end if;
  insert into public.agent_threads (user_id, account_id) values (uid, p_account) returning id into new_id;
  return new_id;
end;
$$;

-- Ставит выбранный вариант в очередь публикации. Остальные варианты треда отклоняются.
create function public.schedule_draft(p_draft uuid, p_when timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d public.drafts%rowtype;
  pub_id uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into d from public.drafts where id = p_draft and user_id = uid for update;
  if not found then raise exception 'draft_not_found' using errcode = 'P0404'; end if;
  if d.status not in ('suggested', 'draft') then raise exception 'draft_not_schedulable' using errcode = 'P0409'; end if;
  if d.account_id is null or not exists (select 1 from public.social_accounts a where a.id = d.account_id and a.user_id = uid and a.status = 'active') then
    raise exception 'account_not_active' using errcode = 'P0404';
  end if;
  if char_length(btrim(d.text)) = 0 or char_length(d.text) > 500 then raise exception 'text_length_invalid' using errcode = 'P0400'; end if;
  if d.text like '%[[%]]%' then raise exception 'placeholders_unfilled' using errcode = 'P0400'; end if;
  if p_when < now() + interval '1 minute' then raise exception 'time_in_past' using errcode = 'P0400'; end if;

  insert into public.publications (draft_id, account_id, user_id, scheduled_for, idempotency_key)
  values (d.id, d.account_id, uid, p_when, 'draft:' || d.id::text)
  on conflict (idempotency_key) do nothing
  returning id into pub_id;
  if pub_id is null then raise exception 'already_scheduled' using errcode = 'P0409'; end if;

  update public.drafts set status = 'scheduled' where id = d.id;
  if d.thread_id is not null then
    update public.drafts set status = 'rejected' where thread_id = d.thread_id and id <> d.id and status = 'suggested';
    update public.agent_threads set status = 'scheduled', recommended_at = coalesce(recommended_at, p_when) where id = d.thread_id;
  end if;
  return pub_id;
end;
$$;

revoke all on function public.thread_usage() from public;
revoke all on function public.start_agent_thread(uuid) from public;
revoke all on function public.schedule_draft(uuid, timestamptz) from public;
grant execute on function public.thread_usage() to authenticated;
grant execute on function public.start_agent_thread(uuid) to authenticated;
grant execute on function public.schedule_draft(uuid, timestamptz) to authenticated;
