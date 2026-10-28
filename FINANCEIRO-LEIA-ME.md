# Aba Financeiro do painel

Controle do seu dinheiro dentro do painel: saldo, receitas, despesas, lucro, meta do mês,
gráficos, contas fixas e importação de extrato e fatura. Tudo fica no SEU Supabase e só o seu
e-mail consegue ver (trava de segurança no banco).

## Passo único: criar as tabelas

1. Abra o arquivo `financeiro.sql` (na pasta do site).
2. No Supabase, abra o **SQL Editor** e clique em **New query**.
3. Cole o texto inteiro e clique em **Run**.
4. Volte no painel, recarregue (Ctrl+F5) e abra **Financeiro** no menu.

Pode rodar o arquivo de novo sem medo: ele não duplica nada.

## O que tem na aba

- **Perfis financeiros** (Pessoal, Profissional, ou os que você criar): cada um tem os seus
  lançamentos, contas e meta. Troque no seletor do topo. "Gerenciar perfis" é onde você define
  o **saldo inicial** e a **meta de receita por mês**.
- **Visão geral:** saldo em conta agora, receitas, despesas, lucro e meta, mais 4 gráficos
  (receitas x despesas, despesas por categoria, comparativo mensal e entradas por categoria).
  Escolha o mês e o ano no topo, ou clique em **Anual**.
- **Lançamentos:** tudo que entrou e saiu, com busca, filtros, edição e CSV. Clique na etiqueta
  Pago / A pagar pra trocar.
- **Contas do mês:** aluguel, internet e outras contas fixas. Marque como paga e ela vira um
  lançamento de despesa (e entra no saldo).
- **Importar:** suba o extrato ou a fatura, revise e confirme.

## Como o saldo é calculado

Saldo em conta agora = saldo inicial + entradas pagas - saídas pagas (até hoje).
O saldo inicial é quanto você tinha na conta ANTES do primeiro lançamento que você registrou aqui.
Lançamento "A pagar" ou "A receber" não mexe no saldo até você marcar como pago.

## Importar extrato ou fatura

1. Baixe o arquivo no app do seu banco: **PDF**, **CSV** ou **OFX** (o OFX e o CSV são os mais certeiros).
2. Em **Financeiro > Importar**, escolha Extrato bancário ou Fatura do cartão e selecione o arquivo.
3. Confira a lista: desmarque o que não quiser, troque a categoria, e clique na etiqueta
   Entrada/Saída se algum lançamento estiver com o tipo errado.
4. Clique em **Mês organizado! Eu confirmo**. Só o que estiver marcado é salvo.

Cuidados que o painel já toma por você:

- O pagamento da fatura do cartão vem **desmarcado**, pra não contar duas vezes (os gastos já
  entram pela fatura).
- Se você importar o mesmo arquivo de novo, as linhas que já existem vêm marcadas como
  "já importado" e desmarcadas.
- Errou? Em **Importar > Importações recentes**, o botão **Desfazer esta importação** apaga só o
  que veio daquele arquivo.

Sobre o PDF: o painel lê o texto do PDF e procura linhas com data e valor. Funciona bem na
maioria dos extratos e faturas, mas cada banco escreve de um jeito, então **sempre revise**. Se o
PDF for uma foto (escaneado) não dá pra ler: use o CSV ou o OFX.

## Privacidade

- O arquivo é lido **no seu navegador**. Só o que você confirma na revisão vai pro seu banco de dados.
- Nenhum banco pede login, senha ou acesso: você mesma baixa o arquivo.
- As tabelas (`fin_perfis`, `fin_lancamentos`, `fin_contas`) só respondem ao e-mail
  `luanacoin@gmail.com`. Se um dia trocar o e-mail do painel, troque também no `financeiro.sql`
  (procure por `luanacoin@gmail.com`) e rode de novo.
- Para ler PDF, o painel baixa o leitor de PDF (pdf.js) da internet na primeira vez que você usa.
