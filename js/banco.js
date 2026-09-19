/*
  Configuração do Supabase, num lugar só.

  Aqui ficam apenas as duas informações PÚBLICAS do seu projeto Supabase:
  o endereço do projeto e a chave "anon" (chave pública). Essa chave é segura
  para ficar visível no site: quem decide o que pode ser lido ou escrito é a
  trava de segurança (RLS) configurada dentro do banco, não esta chave.

  NUNCA coloque aqui a chave secreta (service_role) do Supabase. Ela nunca
  deve aparecer em nenhum arquivo do site.

  Toda página que precisar falar com o banco carrega, nesta ordem:
  1) o script do Supabase vindo do CDN
  2) este arquivo (js/banco.js)
*/

const SUPABASE_URL = "https://rhbudbirkumhxwxujmst.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7lwYI0SelXW79wgZbKZiAQ_HD4NEOTC";

// "banco" é o objeto que todas as páginas usam para ler e escrever no Supabase.
window.banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
