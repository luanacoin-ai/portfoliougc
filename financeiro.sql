-- ============================================================================
-- FINANCEIRO: as tabelas da aba Financeiro do painel
-- ============================================================================
-- Como usar: Supabase > SQL Editor > New query > cole TUDO isto > Run.
-- Pode rodar de novo sem medo: tudo usa "if not exists" e "drop policy if exists".
--
-- Dinheiro é um dado sensível, então a trava aqui é mais apertada que nas outras
-- abas: não basta estar logada, tem que ser o SEU e-mail. Se um dia você trocar o
-- e-mail do painel, troque aqui também (procure por luanacoin@gmail.com).
-- O público anônimo não enxerga nada destas tabelas.
-- ============================================================================

-- ---------- perfis: "Pessoal", "Profissional"... cada um tem as suas contas ----------
create table if not exists public.fin_perfis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  saldo_inicial numeric(14,2) not null default 0,   -- quanto tinha na conta ANTES do primeiro lançamento
  meta_mensal numeric(14,2) not null default 0,     -- meta de receita por mês (0 = sem meta)
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------- lançamentos: tudo que entra e sai ----------
create table if not exists public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.fin_perfis(id) on delete cascade,
  data date not null,
  descricao text not null default '',
  valor numeric(14,2) not null check (valor >= 0),  -- sempre positivo; o "tipo" diz se entrou ou saiu
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null default 'Outros',
  pago boolean not null default true,               -- false = ainda a receber / a pagar
  origem text not null default 'manual' check (origem in ('manual', 'extrato', 'fatura')),
  parcela text,                                     -- "2/6"
  arquivo text,                                     -- nome do arquivo importado
  lote text,                                        -- identifica uma importação (pra desfazer tudo de uma vez)
  chave text,                                       -- evita importar a mesma linha duas vezes
  conta_id uuid,                                    -- veio de uma conta fixa do mês (aluguel, internet...)
  criado_em timestamptz not null default now()
);
create index if not exists fin_lancamentos_perfil_data on public.fin_lancamentos (perfil_id, data desc);
create index if not exists fin_lancamentos_lote on public.fin_lancamentos (lote);
create index if not exists fin_lancamentos_conta on public.fin_lancamentos (conta_id);
create unique index if not exists fin_lancamentos_chave_unica
  on public.fin_lancamentos (perfil_id, chave) where chave is not null;

-- ---------- contas fixas do mês: aluguel, internet, cartão... ----------
create table if not exists public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.fin_perfis(id) on delete cascade,
  nome text not null,
  valor numeric(14,2) not null default 0,
  dia_vencimento integer not null default 1 check (dia_vencimento between 1 and 31),
  categoria text not null default 'Casa',
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_contas_perfil on public.fin_contas (perfil_id);

-- ============================================================================
-- SEGURANÇA (RLS): só o seu e-mail lê e escreve
-- ============================================================================
create or replace function public.fin_eh_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'luanacoin@gmail.com'
$$;

alter table public.fin_perfis enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_contas enable row level security;

drop policy if exists "fin_perfis_tudo_somente_admin" on public.fin_perfis;
create policy "fin_perfis_tudo_somente_admin"
  on public.fin_perfis for all
  using ( public.fin_eh_admin() ) with check ( public.fin_eh_admin() );

drop policy if exists "fin_lancamentos_tudo_somente_admin" on public.fin_lancamentos;
create policy "fin_lancamentos_tudo_somente_admin"
  on public.fin_lancamentos for all
  using ( public.fin_eh_admin() ) with check ( public.fin_eh_admin() );

drop policy if exists "fin_contas_tudo_somente_admin" on public.fin_contas;
create policy "fin_contas_tudo_somente_admin"
  on public.fin_contas for all
  using ( public.fin_eh_admin() ) with check ( public.fin_eh_admin() );

-- ---------- os dois perfis de partida (só se ainda não existir nenhum) ----------
insert into public.fin_perfis (nome, ordem)
select 'Pessoal', 1
where not exists (select 1 from public.fin_perfis);

insert into public.fin_perfis (nome, ordem)
select 'Profissional', 2
where (select count(*) from public.fin_perfis) = 1
  and exists (select 1 from public.fin_perfis where nome = 'Pessoal');
