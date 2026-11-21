-- Запуск публикации по расписанию. Выполни один раз в Supabase SQL Editor.
-- Перед этим: Database → Extensions → включи pg_cron и pg_net.
-- Подставь свой ТВОЙ_REF и тот же CRON_SECRET, что добавлен в секреты Edge Functions.
select cron.schedule(
  'publish-due-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ТВОЙ_REF.supabase.co/functions/v1/publish-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'ТВОЙ_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
-- Отключить: select cron.unschedule('publish-due-every-minute');
