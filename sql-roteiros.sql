-- ============================================================================
-- BIBLIOTECA DE ROTEIROS (aba 📜 Roteiros do painel)
-- ============================================================================
-- Onde colar: entre no seu projeto em supabase.com, vá no menu "SQL Editor"
-- (ícone de terminal na lateral esquerda), clique em "New query", cole este
-- arquivo inteiro e clique em "Run".
--
-- Este arquivo é seguro de rodar mais de uma vez: as tabelas usam
-- "if not exists" e as regras de segurança são apagadas e recriadas.
-- ============================================================================


-- ============================================================================
-- TABELA: roteiros
-- Cada linha é um vídeo transcrito, seu ou de outra creator, guardado na
-- biblioteca da aba Roteiros.
-- ============================================================================
create table if not exists public.roteiros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fonte text not null default 'manual'
    check (fonte in ('instagram', 'tiktok', 'youtube', 'manual')),
  url text,
  perfil text,
  de_quem text not null default 'outra'
    check (de_quem in ('minha', 'outra')),
  titulo text,
  transcricao text,
  legenda text,
  postado_em date,
  tags text[] not null default '{}',
  obs text,
  status text not null default 'pronto'
    check (status in ('processando', 'pronto', 'falhou')),
  erro text,
  segmentos jsonb
);

create index if not exists roteiros_created_at_idx on public.roteiros (created_at desc);

-- Colunas da análise automática (feita pela Claude, quando você tem a chave
-- de IA salva): separa o gancho, o desenvolvimento em passos, o CTA, as
-- expressões usadas e o motivo do roteiro prender atenção.
alter table public.roteiros add column if not exists estrutura text[] not null default '{}';
alter table public.roteiros add column if not exists gancho text;
alter table public.roteiros add column if not exists desenvolvimento text[];
alter table public.roteiros add column if not exists cta text;
alter table public.roteiros add column if not exists expressoes text[];
alter table public.roteiros add column if not exists por_que_prende text;
alter table public.roteiros add column if not exists analise_status text not null default 'nenhuma'
  check (analise_status in ('nenhuma', 'processando', 'pronta', 'falhou'));
alter table public.roteiros add column if not exists analise_erro text;


-- ============================================================================
-- TABELA: configuracoes
-- Guarda configurações simples do painel em formato chave/valor. A aba
-- Roteiros usa ela pra guardar a sua chave da Supadata, assim ela funciona
-- em qualquer computador que você entrar no painel.
-- ============================================================================
create table if not exists public.configuracoes (
  chave text primary key,
  valor text,
  updated_at timestamptz not null default now()
);


-- ============================================================================
-- TRAVA DE SEGURANÇA (RLS = Row Level Security)
-- ============================================================================
-- As duas tabelas ficam 100% privadas: só você, logada, pode ler ou
-- escrever. Ninguém de fora enxerga ou grava nada nelas.
-- ============================================================================

alter table public.roteiros enable row level security;
alter table public.configuracoes enable row level security;

-- ---------- roteiros ----------
drop policy if exists "roteiros_select_somente_logada" on public.roteiros;
create policy "roteiros_select_somente_logada"
  on public.roteiros for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "roteiros_insert_somente_logada" on public.roteiros;
create policy "roteiros_insert_somente_logada"
  on public.roteiros for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "roteiros_update_somente_logada" on public.roteiros;
create policy "roteiros_update_somente_logada"
  on public.roteiros for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "roteiros_delete_somente_logada" on public.roteiros;
create policy "roteiros_delete_somente_logada"
  on public.roteiros for delete
  using ( auth.role() = 'authenticated' );


-- ---------- configuracoes ----------
drop policy if exists "configuracoes_select_somente_logada" on public.configuracoes;
create policy "configuracoes_select_somente_logada"
  on public.configuracoes for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "configuracoes_insert_somente_logada" on public.configuracoes;
create policy "configuracoes_insert_somente_logada"
  on public.configuracoes for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "configuracoes_update_somente_logada" on public.configuracoes;
create policy "configuracoes_update_somente_logada"
  on public.configuracoes for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "configuracoes_delete_somente_logada" on public.configuracoes;
create policy "configuracoes_delete_somente_logada"
  on public.configuracoes for delete
  using ( auth.role() = 'authenticated' );


-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
