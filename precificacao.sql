-- ============================================================================
-- PRECIFICAÇÃO: guarda o cálculo da aba Financeiro > Precificação
-- ============================================================================
-- Como usar: Supabase > SQL Editor > New query > cole TUDO isto > Run.
-- Pode rodar de novo sem medo.
-- Usa a mesma trava do financeiro.sql (só o seu e-mail lê e escreve), então
-- rode o financeiro.sql antes, se ainda não rodou.
-- ============================================================================

create table if not exists public.fin_precificacao (
  id uuid primary key default gen_random_uuid(),
  custos_fixos numeric(14,2) not null default 0,   -- custos fixos do mês
  equipamento numeric(14,2) not null default 0,    -- valor do equipamento
  vida_util numeric(6,1) not null default 24,      -- em meses
  gasto_direto numeric(14,2) not null default 0,   -- o que sai do bolso a cada trabalho
  renda numeric(14,2) not null default 0,          -- renda mensal desejada
  capacidade integer not null default 20,          -- trabalhos por mês
  lucro numeric(5,1) not null default 20,          -- margem de lucro em %
  imposto numeric(5,1) not null default 6,         -- impostos e taxas em %
  agenda integer not null default 70,              -- quão cheia está a agenda, em %
  oferta numeric(14,2),                            -- última oferta digitada
  atualizado_em timestamptz not null default now()
);

alter table public.fin_precificacao enable row level security;

drop policy if exists "fin_precificacao_tudo_somente_admin" on public.fin_precificacao;
create policy "fin_precificacao_tudo_somente_admin"
  on public.fin_precificacao for all
  using ( public.fin_eh_admin() ) with check ( public.fin_eh_admin() );
