-- ============================================================================
-- ABA BRAINSTORM: vídeos de referência e ideias por nicho adicionados por você
-- ============================================================================
-- Onde colar: entre no seu projeto em supabase.com, vá no menu "SQL Editor"
-- (ícone de terminal na lateral esquerda), clique em "New query", cole este
-- arquivo inteiro e clique em "Run".
--
-- Este arquivo é seguro de rodar mais de uma vez: as tabelas usam
-- "if not exists" e as regras de segurança são apagadas e recriadas.
-- ============================================================================


-- ============================================================================
-- TABELA: referencias_video
-- Cada linha é um vídeo de referência que você adicionou na sub-aba
-- "Referências de vídeo", além dos que já vêm prontos na biblioteca.
-- ============================================================================
create table if not exists public.referencias_video (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  titulo text not null,
  categoria text not null,
  duracao text,
  marca text,
  link text,
  emoji text
);

create index if not exists referencias_video_created_at_idx on public.referencias_video (created_at desc);


-- ============================================================================
-- TABELA: ideias_nicho
-- Cada linha é uma ideia de conteúdo que você adicionou na sub-aba
-- "Ideias por nicho", além das que já vêm prontas na biblioteca.
-- ============================================================================
create table if not exists public.ideias_nicho (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  titulo text not null,
  descricao text,
  nicho text not null
);

create index if not exists ideias_nicho_created_at_idx on public.ideias_nicho (created_at desc);


-- ============================================================================
-- TRAVA DE SEGURANÇA (RLS = Row Level Security)
-- ============================================================================
-- As duas tabelas ficam 100% privadas: só você, logada, pode ler ou
-- escrever. Ninguém de fora enxerga ou grava nada nelas.
-- ============================================================================

alter table public.referencias_video enable row level security;
alter table public.ideias_nicho enable row level security;

-- ---------- referencias_video ----------
drop policy if exists "referencias_video_select_somente_logada" on public.referencias_video;
create policy "referencias_video_select_somente_logada"
  on public.referencias_video for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "referencias_video_insert_somente_logada" on public.referencias_video;
create policy "referencias_video_insert_somente_logada"
  on public.referencias_video for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "referencias_video_update_somente_logada" on public.referencias_video;
create policy "referencias_video_update_somente_logada"
  on public.referencias_video for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "referencias_video_delete_somente_logada" on public.referencias_video;
create policy "referencias_video_delete_somente_logada"
  on public.referencias_video for delete
  using ( auth.role() = 'authenticated' );


-- ---------- ideias_nicho ----------
drop policy if exists "ideias_nicho_select_somente_logada" on public.ideias_nicho;
create policy "ideias_nicho_select_somente_logada"
  on public.ideias_nicho for select
  using ( auth.role() = 'authenticated' );

drop policy if exists "ideias_nicho_insert_somente_logada" on public.ideias_nicho;
create policy "ideias_nicho_insert_somente_logada"
  on public.ideias_nicho for insert
  with check ( auth.role() = 'authenticated' );

drop policy if exists "ideias_nicho_update_somente_logada" on public.ideias_nicho;
create policy "ideias_nicho_update_somente_logada"
  on public.ideias_nicho for update
  using ( auth.role() = 'authenticated' );

drop policy if exists "ideias_nicho_delete_somente_logada" on public.ideias_nicho;
create policy "ideias_nicho_delete_somente_logada"
  on public.ideias_nicho for delete
  using ( auth.role() = 'authenticated' );


-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
