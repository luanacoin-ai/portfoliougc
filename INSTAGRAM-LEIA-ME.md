# Automação de DM do Instagram: passo a passo

Isso liga a aba **Instagram** do seu painel (Conteúdos > Instagram). Quando alguém comenta uma palavra num post seu, a pessoa recebe uma DM automática com botão, link ou uma conversa inteira, e o contato fica salvo.

A tela do painel já está pronta e no ar. O que falta é a parte de "fora": o banco, as funções no Supabase e a conexão com o Meta (Instagram). São os passos abaixo, nesta ordem. Leva uma tarde na primeira vez.

**Regra de ouro:** as senhas e chaves (token do Instagram, segredo do app, etc.) ficam SÓ nos "segredos" das funções no Supabase. Nunca cole nenhuma delas num arquivo da pasta do site, no chat ou no GitHub.

---

## Como funciona (em 5 linhas)

1. Alguém comenta a palavra que você escolheu num post.
2. O Instagram avisa a função `instagram-webhook` no Supabase.
3. Ela acha a automação certa, manda a DM com botão e responde o comentário em público.
4. Quando a pessoa toca num botão, a conversa segue (outra mensagem, ou um link).
5. Um "freio" segura os envios pra você nunca passar do limite do Instagram e tomar bloqueio.

---

## Passo 1: criar as tabelas no Supabase

1. Entre em supabase.com, abra o seu projeto e vá em **SQL Editor** (ícone de terminal na lateral).
2. Clique em **New query**.
3. Abra o arquivo `instagram.sql` (está na pasta do site), copie TUDO, cole no Supabase e clique em **Run**.
4. Deve aparecer "Success". É seguro rodar de novo se precisar.

Isso cria as tabelas, o freio de envio (as duas funções `take_send_slot` e `record_send_result`), as regras de acesso (só o seu e-mail enxerga) e a pasta de arquivos `ig-arquivos`.

> **Atenção:** sem o freio, NENHUMA DM por comentário sai (tudo vai pra fila e a fila nunca anda). É o passo que não pode faltar.

Depois deste passo, a aba Instagram do painel já abre e você já consegue criar automações (elas só ainda não disparam nada).

---

## Passo 2: o app no Meta for Developers

Você precisa de uma conta do Instagram **profissional** (Criador de conteúdo ou Empresa).

1. Entre em developers.facebook.com e crie um **app** do tipo **Empresa (Business)**.
2. No app, adicione o produto **Instagram** e escolha **API setup with Instagram login** (API do Instagram com login do Instagram).
3. Conecte a sua conta profissional do Instagram.
4. Libere as permissões:
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
5. Gere o **token de acesso** da sua conta (o Meta oferece "Generate token", que já vem de longa duração, cerca de 60 dias) e anote o **ID da conta do Instagram** (um número comprido). Guarde os dois num lugar seguro, só pra colar no Passo 3.
6. Anote também o **App Secret** do Instagram (aparece na mesma página de configuração da API do Instagram).

Sobre testar: enquanto o app estiver em **modo de desenvolvimento**, o Instagram só avisa sobre comentários e mensagens de contas que têm um papel no app. Para testar, adicione uma SEGUNDA conta sua como **testador do Instagram** (em Funções do app > Testadores do Instagram) e aceite o convite dentro do Instagram dessa segunda conta. Para valer para o público em geral, o Meta exige a revisão do app (acesso avançado às permissões de comentários e mensagens).

---

## Passo 3: os segredos das funções (no Supabase)

No Supabase: **Edge Functions > Secrets** (ou "Manage secrets"). Crie cada um destes, com o nome EXATAMENTE igual:

| Nome | O que colocar |
|---|---|
| `IG_ACCESS_TOKEN` | o token do Instagram (Passo 2) |
| `IG_ACCOUNT_ID` | o ID numérico da sua conta do Instagram (Passo 2) |
| `APP_SECRET` | o App Secret do Instagram (Passo 2) |
| `APP_SECRET_ENFORCE` | `false` por enquanto (depois de testar tudo, vira `true`) |
| `VERIFY_TOKEN` | uma senha que VOCÊ inventa (ex: umas 20 letras e números sem sentido). Vai ser colada também no Meta, no Passo 6 |
| `SCHED_SECRET` | OUTRA senha que você inventa. Protege os robôs agendados |
| `GRAPH_API_VERSION` | `v21.0` |
| `TEST_IG_ACCOUNTS` | o ID numérico da sua conta de teste (a segunda conta). Contas aqui ignoram a regra de "1 DM por dia", pra você testar à vontade. Pode deixar vazio |

A chave de serviço do banco (`SUPABASE_SERVICE_ROLE_KEY`) o Supabase já coloca sozinho em todas as funções. Você não configura.

---

## Passo 4: publicar as 5 funções

No Supabase: **Edge Functions > Deploy a new function > Via Editor**. Pra cada função: dê o nome EXATAMENTE como abaixo, cole o código do arquivo correspondente (abra o arquivo, Ctrl+A, Ctrl+C, cole no editor do Supabase) e clique em **Deploy**.

| Nome da função | Arquivo com o código | Verify JWT |
|---|---|---|
| `instagram-webhook` | `supabase/functions/instagram-webhook/index.ts` | **DESLIGADO** |
| `ig-scheduler` | `supabase/functions/ig-scheduler/index.ts` | **DESLIGADO** |
| `ig-token-refresh` | `supabase/functions/ig-token-refresh/index.ts` | **DESLIGADO** |
| `ig-insights` | `supabase/functions/ig-insights/index.ts` | ligado (padrão) |
| `ig-media` | `supabase/functions/ig-media/index.ts` | ligado (padrão) |

**Por que desligar o Verify JWT em três delas:** quem chama `instagram-webhook` é o próprio Instagram, e quem chama as outras duas é o relógio do banco. Nenhum dos dois tem o seu login. No lugar do login, a segurança é a assinatura do Instagram (webhook) e a senha `SCHED_SECRET` (os robôs). As outras duas (`ig-insights` e `ig-media`) são chamadas pelo seu painel, logada, e conferem se é você mesmo.

Onde fica o interruptor: na página da função, aba **Details** (ou a opção "Verify JWT"). Se publicar pela linha de comando, é `--no-verify-jwt`.

---

## Passo 5: ligar os robôs que rodam sozinhos

Eles esvaziam a fila de envios a cada minuto e renovam o token toda semana.

1. Abra o arquivo `instagram-agendamento.sql`.
2. Copie o conteúdo e cole no **SQL Editor** do Supabase (uma nova query).
3. No texto COLADO, troque `SEU_SCHED_SECRET_AQUI` (use "localizar e substituir": ele aparece nos dois agendamentos) pela senha `SCHED_SECRET` do Passo 3.
4. Clique em **Run**.

**Não salve o arquivo com a senha dentro da pasta do site**, senão ela vai pro GitHub. Edite só no SQL Editor.

Pra conferir: rode `select jobname, schedule, active from cron.job;` e veja os dois agendamentos.

---

## Passo 6: cadastrar o webhook no Meta

No app do Meta, na página da API do Instagram, procure a configuração de **Webhooks**:

- **URL de retorno de chamada (Callback URL):** `https://rhbudbirkumhxwxujmst.supabase.co/functions/v1/instagram-webhook`
- **Token de verificação:** o mesmo `VERIFY_TOKEN` do Passo 3.
- Clique em verificar e salvar. Deve dar certo na hora (se der erro, confira se a função está publicada e com o Verify JWT desligado).
- **Assine os campos** (todos os três):
  - `comments`
  - `messages`
  - `messaging_postbacks`  (é este que faz os botões da conversa funcionarem)

---

## Passo 7: testar

1. No painel: **Conteúdos > Instagram > Nova automação**. Escolha uma palavra (ex: `quero`), escreva a mensagem, deixe o botão ligado com um link e salve.
2. Com a **segunda conta** (a testadora), comente `quero` num post seu.
3. Em poucos segundos a segunda conta deve receber a DM com o botão, e o seu post ganha a resposta pública.
4. Olhe o cartão **Últimos envios** na aba Automações: ele mostra cada tentativa (Enviado, Erro, Na fila, Pulado) e o motivo.

A sua própria conta é ignorada de propósito (o sistema não responde a você mesma).

---

## Passo 8: ligar a trava de segurança

Quando tudo estiver funcionando, troque o segredo `APP_SECRET_ENFORCE` para `true`. A partir daí, a função recusa qualquer pedido que não venha mesmo do Instagram (assinatura inválida). Enquanto estava `false`, ela só avisava no log.

---

## Regras e limites (pra não tomar bloqueio)

- **Só responde quem pediu.** A pessoa comentou a palavra: é opt-in. Nada de spam, lista comprada ou disparo em massa.
- **1 DM por pessoa a cada 24 horas** nos gatilhos de comentário. As contas de `TEST_IG_ACCOUNTS` ignoram essa regra.
- **O freio de envio** segura bem abaixo do limite do Instagram: no máximo 6 por minuto, 60 por hora e 180 por dia. Passou disso, a pessoa entra na fila e o robô manda no minuto seguinte. Se o Instagram recusar várias mensagens seguidas, os envios **pausam por 3 horas** (aparece um aviso vermelho na aba, com o botão "Destravar envios agora").
- **Janela de 24 horas do Instagram:** fora de uma interação recente (comentário ou toque no botão) não dá pra mandar DM. O comentário e o toque no botão abrem a janela.
- **Resposta a comentário** só vale por cerca de 7 dias.
- **Título de botão:** até 20 letras. **Botões anexados:** no máximo 3 por mensagem. **Mensagem com botão:** até 640 letras.
- **Arquivos:** até 25 MB. O Instagram pode recusar arquivo na primeira mensagem (a que responde o comentário). O jeito mais seguro é mandar o arquivo numa mensagem DEPOIS do toque no botão (modo "Continua a conversa").
- **O token vence em cerca de 60 dias.** A renovação roda sozinha toda semana. Se falhar, a aba Métricas mostra um aviso.
- **DM solta** (alguém te manda uma mensagem sem comentar): só dispara se a mensagem tiver uma das palavras da automação. A opção "qualquer palavra" vale só para comentários, nunca para DM.
- O banco devolve no máximo 1000 linhas por pedido. Se um dia a tabela de contatos passar disso, as telas que listam tudo precisam de paginação.

---

## Quando algo não funciona

| Sintoma | O que olhar |
|---|---|
| A aba Instagram mostra "Não consegui carregar as automações" | Você rodou o `instagram.sql` (Passo 1)? |
| "Conecte seu Instagram pra ver as métricas" | A função `ig-insights` está publicada e o `IG_ACCESS_TOKEN` está nos segredos? |
| O Meta não aceita o webhook | A função `instagram-webhook` está publicada, com Verify JWT desligado, e o `VERIFY_TOKEN` é o mesmo nos dois lugares? |
| Comentei e não aconteceu nada | Os 3 campos (`comments`, `messages`, `messaging_postbacks`) estão assinados? A conta que comentou tem papel no app (testador)? A automação está ligada? Veja "Últimos envios" |
| "Pulado: já recebeu uma DM nas últimas 24h" | É a regra de 1 por dia. Ponha o ID da conta de teste em `TEST_IG_ACCOUNTS` |
| Tudo fica "Na fila" e nada sai | O freio está pausado ou o `instagram.sql` não foi rodado por inteiro. Veja o aviso vermelho na aba (botão "Destravar") e rode o Passo 1 de novo |
| O botão chega sem botão (só texto com link) | O Instagram recusou o botão anexado e o sistema usou o plano B (pílula ou texto). O motivo aparece em "Últimos envios" |
| O token venceu | Gere um token novo no Meta (Passo 2) e atualize o segredo `IG_ACCESS_TOKEN` |

Pra ver o que as funções registraram: Supabase > **Edge Functions** > escolha a função > aba **Logs**.

Pra destravar o freio sem o botão: no SQL Editor, `update public.ig_send_budget set paused_until = null, err_streak = 0;`

---

## Sobre o sistema antigo de automações

O arquivo `automacoes.sql` e a função `meta-webhook` são de uma versão anterior, que não aparece mais no painel e guardava o token dentro do banco. Esta versão nova NÃO usa nenhum dos dois: ela usa as tabelas `ig_*`, as funções `instagram-webhook`, `ig-*` e guarda tudo nos segredos. Se você tinha o webhook antigo cadastrado no Meta, troque a URL pelo endereço novo (Passo 6). Os arquivos antigos podem ficar onde estão.
