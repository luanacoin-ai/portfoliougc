-- ============================================================================
-- SELEÇÃO NA ABA PROSPECÇÃO
-- ============================================================================
-- Onde colar: entre no seu projeto em supabase.com, vá no menu "SQL Editor"
-- (ícone de terminal na lateral esquerda), clique em "New query", cole este
-- arquivo inteiro e clique em "Run".
--
-- Este arquivo é seguro de rodar mais de uma vez: ele só ACRESCENTA uma
-- coluna na tabela que já existe ("add column if not exists"). Nada aqui
-- apaga tabela, coluna ou linha nenhuma do que você já tem.
-- ============================================================================

-- "selecionada": pra você marcar, na aba Prospecção, quais marcas quer
-- escolher (igual já funciona na aba Marcas). Fica salva no banco, então a
-- seleção não se perde quando você fecha o admin e volta outro dia.
alter table public.prospeccao add column if not exists selecionada boolean not null default false;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
