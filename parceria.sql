-- ============================================================================
-- PARCERIA: permuta ou parceria paga (abas Marcas e Campanhas)
-- ============================================================================
-- Como usar: Supabase > SQL Editor > New query > cole TUDO isto > Run.
-- Pode rodar de novo sem medo: não duplica nem apaga nada.
--
-- Cria a coluna "tipo_parceria" nas tabelas marcas e campanhas:
--   'permuta'  = você recebe produto ou serviço, sem dinheiro
--   'paga'     = parceria paga (dinheiro)
--   vazio      = ainda não definido
-- ============================================================================

alter table public.marcas add column if not exists tipo_parceria text;
alter table public.campanhas add column if not exists tipo_parceria text;

alter table public.marcas drop constraint if exists marcas_tipo_parceria_check;
alter table public.marcas add constraint marcas_tipo_parceria_check
  check (tipo_parceria is null or tipo_parceria in ('permuta', 'paga'));

alter table public.campanhas drop constraint if exists campanhas_tipo_parceria_check;
alter table public.campanhas add constraint campanhas_tipo_parceria_check
  check (tipo_parceria is null or tipo_parceria in ('permuta', 'paga'));
