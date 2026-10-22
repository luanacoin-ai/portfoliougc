-- ============================================================================
-- AGENDAMENTO DOS ROBÔS DO INSTAGRAM (pg_cron)
-- ============================================================================
-- Rode este arquivo DEPOIS de instagram.sql e DEPOIS de publicar as funções
-- "ig-scheduler" e "ig-token-refresh" (passo a passo em INSTAGRAM-LEIA-ME.md).
--
-- O que ele agenda:
--   ig-scheduler       a cada 1 minuto: esvazia a fila de envios que o freio
--                      segurou e manda os passos com atraso.
--   ig-token-refresh   1 vez por semana (domingo, 06:00 UTC): renova o token
--                      do Instagram, que vale uns 60 dias.
--
-- ANTES DE RODAR, troque UMA coisa neste arquivo:
--   SEU_SCHED_SECRET_AQUI  ->  a senha que você inventou e guardou nos segredos
--                              das funções com o nome SCHED_SECRET (os dois
--                              lugares têm que ter a MESMA senha).
--
-- IMPORTANTE: essa senha é só pra você colar aqui no SQL Editor do Supabase.
-- NÃO salve este arquivo com a senha preenchida dentro da pasta do site, pra
-- ela não ir parar no GitHub. Cole uma cópia editada direto no SQL Editor.
--
-- O endereço do projeto abaixo já é o do seu Supabase (o mesmo do site).
-- ============================================================================

-- As duas extensões que fazem o relógio chamar uma função pela internet.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Se você já tinha agendado antes, apaga o agendamento antigo pra não duplicar.
do $$
begin
  perform cron.unschedule('ig-scheduler-1min');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('ig-token-refresh-semanal');
exception when others then null;
end $$;

-- A cada 1 minuto.
select cron.schedule(
  'ig-scheduler-1min',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://rhbudbirkumhxwxujmst.supabase.co/functions/v1/ig-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sched-key', 'SEU_SCHED_SECRET_AQUI'),
    body := '{}'::jsonb
  );
  $cron$
);

-- 1 vez por semana (domingo, 06:00 no horário UTC).
select cron.schedule(
  'ig-token-refresh-semanal',
  '0 6 * * 0',
  $cron$
  select net.http_post(
    url := 'https://rhbudbirkumhxwxujmst.supabase.co/functions/v1/ig-token-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sched-key', 'SEU_SCHED_SECRET_AQUI'),
    body := '{}'::jsonb
  );
  $cron$
);

-- Pra conferir se ficou agendado:
--   select jobname, schedule, active from cron.job;
-- Pra ver se os últimos disparos deram certo:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Pra desligar um agendamento:
--   select cron.unschedule('ig-scheduler-1min');
