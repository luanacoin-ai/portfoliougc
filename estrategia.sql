-- ============================================================================
-- ESTRATÉGIA: a tabela da aba Estratégia do painel
-- ============================================================================
-- Como usar: Supabase > SQL Editor > New query > cole TUDO isto > Run.
-- Pode rodar de novo sem medo: tudo usa "if not exists" e "drop policy if exists".
--
-- A estratégia inteira (nicho, pilares, público, tom de voz...) fica numa linha
-- só, a de id 1. Só o seu e-mail lê e escreve; o público anônimo não vê nada.
-- Se um dia você trocar o e-mail do painel, troque aqui também.
-- ============================================================================

create table if not exists public.estrategia (
  id integer primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.estrategia enable row level security;

drop policy if exists "estrategia_tudo_somente_admin" on public.estrategia;
create policy "estrategia_tudo_somente_admin"
  on public.estrategia for all
  using ( coalesce(auth.jwt() ->> 'email', '') = 'luanacoin@gmail.com' )
  with check ( coalesce(auth.jwt() ->> 'email', '') = 'luanacoin@gmail.com' );
