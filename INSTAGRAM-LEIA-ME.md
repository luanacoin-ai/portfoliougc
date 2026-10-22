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

> Se você já rodou uma versão anterior deste arquivo, **rode de novo inteiro**. É seguro, e ele acrescenta a permissão de apagar o histórico de uma pessoa (usada pelo botão da lixeira em Contatos).

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

No Supabase: **Edge Functions > Secrets** (link direto: https://supabase.com/dashboard/project/rhbudbirkumhxwxujmst/functions/secrets). Crie cada um destes, com o nome EXATAMENTE igual:

| Nome | O que colocar |
|---|---|
| `IG_ACCESS_TOKEN` | o token do Instagram (Passo 2) |
| `IG_ACCOUNT_ID` | o ID numérico da sua conta do Instagram (Passo 2). **Não é o ID do app**: o ID do app aparece como `client_id` no link do login da empresa, e o ID da conta é o número que aparece ao lado da sua conta, onde você gera o token (costuma começar com 17841). O envio das DMs não depende mais dele (usa a conta dona do token), mas ele ajuda a reconhecer as suas próprias mensagens |
| `APP_SECRET` | o App Secret do Instagram (Passo 2) |
| `APP_SECRET_ENFORCE` | `false` por enquanto (depois de testar tudo, vira `true`) |
| `VERIFY_TOKEN` | uma senha que VOCÊ inventa (ex: umas 20 letras e números sem sentido). Vai ser colada também no Meta, no Passo 6 |
| `SCHED_SECRET` | OUTRA senha que você inventa. Protege os robôs agendados |
| `GRAPH_API_VERSION` | `v21.0` |
| `TEST_IG_ACCOUNTS` | o ID numérico da sua conta de teste (a segunda conta). Contas aqui ignoram a regra de "1 DM por dia", pra você testar à vontade. Pode deixar vazio |

A chave de serviço do banco (`SUPABASE_SERVICE_ROLE_KEY`) o Supabase já coloca sozinho em todas as funções. Você não configura.

---

## Passo 4: publicar as 6 funções

No Supabase: **Edge Functions** (link direto: https://supabase.com/dashboard/project/rhbudbirkumhxwxujmst/functions) **> Deploy a new function > Via Editor**. Pra cada função: dê o nome EXATAMENTE como abaixo, cole o código do arquivo correspondente (abra o arquivo, Ctrl+A, Ctrl+C, cole no editor do Supabase) e clique em **Deploy**.

| Nome da função | Arquivo com o código | Verify JWT |
|---|---|---|
| `instagram-webhook` | `supabase/functions/instagram-webhook/index.ts` | **DESLIGADO** |
| `ig-scheduler` | `supabase/functions/ig-scheduler/index.ts` | **DESLIGADO** |
| `ig-token-refresh` | `supabase/functions/ig-token-refresh/index.ts` | **DESLIGADO** |
| `ig-insights` | `supabase/functions/ig-insights/index.ts` | ligado (padrão) |
| `ig-media` | `supabase/functions/ig-media/index.ts` | ligado (padrão) |
| `ig-analise` | `supabase/functions/ig-analise/index.ts` | ligado (padrão) |

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

## Passo 6: ligar o webhook no Meta (são DUAS coisas)

No app do Meta (o seu se chama **ClaudeDM**): **Casos de uso > Gerenciar mensagens e conteúdo no Instagram > Personalizar > Configuração da API com login do Instagram**. Nessa página ficam o token, o ID da conta e os webhooks.

**6a) Cadastrar o endereço do webhook** (seção "Configurar webhooks"):
- **URL de retorno de chamada (Callback URL):** `https://rhbudbirkumhxwxujmst.supabase.co/functions/v1/instagram-webhook`
- **Token de verificação:** o mesmo `VERIFY_TOKEN` do Passo 3.
- Clique em verificar e salvar. Só funciona se a função `instagram-webhook` já estiver publicada (Passo 4). Se der erro, confira o Verify JWT desligado e o `VERIFY_TOKEN`.
- **Assine os campos** (todos os três): `comments`, `messages` e `messaging_postbacks` (é este último que faz os botões da conversa funcionarem).

**6b) Ligar a assinatura da SUA conta** (este passo é esquecido com frequência e deixa tudo mudo): na mesma página, na parte onde você gera o token, ao lado da sua conta do Instagram, ligue a chave **"Assinar webhooks" (Subscribe to webhooks)**. Sem isso, o app pode estar publicado e configurado e mesmo assim nenhum comentário chega.

**Como saber se ficou certo:** abra no painel **Conteúdos > Instagram > Visão geral**. O cartão **"Conexão com o Instagram"** mostra "Tudo certo" quando o Instagram está avisando o sistema sobre comentários, mensagens e toques nos botões. Se faltar algum, o cartão fica vermelho e diz qual.

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
- **O token vence em cerca de 60 dias.** A renovação roda sozinha toda semana. No topo da aba Instagram fica uma **contagem regressiva** (dias, horas, minutos e segundos) até o token vencer. Ela fica amarela quando faltam menos de 15 dias e vermelha com menos de 5. Na **Visão geral** tem o botão **Renovar agora**, que pede ao Instagram mais 60 dias na hora.
- **DM solta** (alguém te manda uma mensagem sem comentar): só dispara se a mensagem tiver uma das palavras da automação. A opção "qualquer palavra" vale só para comentários, nunca para DM.
- O banco devolve no máximo 1000 linhas por pedido. Se um dia a tabela de contatos passar disso, as telas que listam tudo precisam de paginação.

---

## As 7 abas do Instagram (Conteúdos > Instagram)

No topo de todas as abas ficam dois selinhos: a **contagem regressiva do token** (clique nela pra ver os detalhes) e as **entregas das últimas 24 horas**.

| Aba | Pra que serve |
|---|---|
| **Visão geral** | O token com a contagem regressiva e o botão "Renovar agora", a saúde da conexão (o Instagram está avisando o sistema?), os números do dia e os últimos envios. Se o Instagram ainda não estiver ligado, mostra uma lista do que falta. |
| **Automações** | A lista das automações, com a **foto do post** de cada uma na frente do nome, e o editor com a prévia do celular. |
| **Leads** | A planilha de todo mundo que entrou numa automação: @, origem, palavra, automação, contato, etiquetas, interações, DMs enviadas, última vez e mais. Dá pra buscar, filtrar, ordenar, editar etiquetas, baixar em CSV e apagar uma pessoa. |
| **Análises** | Seguidores, novos seguidores, alcance por dia, contas engajadas e interações, com filtro de 7, 30 ou 90 dias (e "Tudo"). Mais os **melhores posts** (curtidas, comentários, salvamentos e visualizações) e **quem mais comenta**. |
| **Marcas** | Os leads que você marcou com a etiqueta **marca**, com um botão que manda a marca pra aba Marcas do painel. |
| **Propostas** | O controle das propostas de parceria que chegam: marca, valor, situação (nova, em conversa, fechada, recusada) e observação. |
| **Sorteio** | Sorteia ganhadores entre quem comentou num post, com regras (palavra obrigatória, @ de fora, suplentes). |

**Sobre as Análises:** os números da conta (alcance, novos seguidores, etc.) aparecem na hora e mudam quando você troca o filtro. A análise dos **posts** é pesada (o Instagram precisa ser consultado post por post), então só roda quando você clica em **Atualizar**, e o resultado fica guardado pra a tela abrir rápido. O Instagram só informa os **novos seguidores dos últimos 28 dias** (e só pra contas com mais de 100 seguidores) e o alcance dos últimos 90 dias, por isso "90 dias" e "Tudo" têm esse limite nos gráficos.

**Sobre "Quem mais comenta" e o Sorteio:** são @ de outras pessoas. Por privacidade, eles **não vão pro banco**: ficam guardados só no seu navegador. O Sorteio lê os comentários do post na hora, sorteia de forma aleatória e justa no seu navegador e não grava os comentários em lugar nenhum.

---

## Privacidade, LGPD e a Política de Privacidade

A página pública da política está em **https://luanacoin.com/politica-de-privacidade/** e a de exclusão de dados em **https://luanacoin.com/politica-de-privacidade/#exclusao-de-dados**. É a URL que o Meta for Developers pede (campos "Privacy Policy URL" e "Data Deletion Instructions URL"). O código da página está em `politica-de-privacidade/index.html`.

O que o sistema faz pra a política ser verdadeira:

- **Não guarda o texto** de comentários nem de mensagens. Guarda só o @, o ID, a palavra-chave da automação, o ponto da conversa, o registro de envios e, se um passo da conversa pedir, o e-mail ou telefone que a pessoa mandar.
- **Apaga sozinho** (o robô `ig-scheduler`, uma vez por hora) os contatos sem nenhuma interação há **12 meses**, junto com o histórico de envios com mais de 12 meses.
- **Pedido de exclusão** (a política promete responder em até 15 dias): aba **Instagram > Leads**, ache a pessoa pela busca e clique na lixeira. Ela apaga o contato, o histórico, a fila, os passos agendados e o e-mail ou telefone. Depois responda a pessoa confirmando.
- **Pedido de acesso ou portabilidade:** na mesma aba, busque a pessoa e clique em **Baixar lista (CSV)**.

Se você mudar o que o sistema guarda (por exemplo, passar a pedir telefone, ou usar uma ferramenta de IA), **atualize a política** antes: abra `politica-de-privacidade/index.html`, ajuste o texto das seções 2 a 6 e troque a data em "Última atualização" (aparece no começo da página e na tag `<time>`). Salvou e publicou, vale na hora.

Observação: a política descreve a prática da Luana, mas não substitui a opinião de um advogado. Se o negócio crescer, vale uma revisão profissional.

---

## Quando algo não funciona

| Sintoma | O que olhar |
|---|---|
| A aba Instagram mostra "Não consegui carregar as automações" | Você rodou o `instagram.sql` (Passo 1)? |
| "Conecte seu Instagram pra ver as análises" ou "Falta ligar o Instagram" | As funções `ig-insights` e `ig-analise` estão publicadas e o `IG_ACCESS_TOKEN` está nos segredos? A lista "Falta ligar o Instagram", na Visão geral, mostra o que falta |
| O cartão "Conexão com o Instagram" (aba Visão geral) está vermelho | Clique em **Ligar os avisos agora** (dentro do próprio cartão): ele liga na sua conta os 3 avisos (`comments`, `messages` e `messaging_postbacks`). Precisa da função `ig-insights` publicada na versão nova. Se não resolver, confira a assinatura de webhooks e os 3 campos no Meta (Passo 6) |
| O Meta não aceita o webhook | A função `instagram-webhook` está publicada, com Verify JWT desligado, e o `VERIFY_TOKEN` é o mesmo nos dois lugares? |
| Comentei e não aconteceu nada | Os 3 campos (`comments`, `messages`, `messaging_postbacks`) estão assinados? A conta que comentou tem papel no app (testador)? A automação está ligada? Veja "Últimos envios" |
| "Pulado: já recebeu uma DM nas últimas 24h" | É a regra de 1 por dia. Ponha o ID da conta de teste em `TEST_IG_ACCOUNTS` |
| Tudo fica "Na fila" e nada sai | O freio está pausado ou o `instagram.sql` não foi rodado por inteiro. Veja o aviso vermelho na aba (botão "Destravar") e rode o Passo 1 de novo |
| O botão chega sem botão (só texto com link) | O Instagram recusou o botão anexado e o sistema usou o plano B (pílula ou texto). O motivo aparece em "Últimos envios" |
| O token venceu | Gere um token novo no Meta (Passo 2) e atualize o segredo `IG_ACCESS_TOKEN` |
| "A última renovação falhou: o Instagram devolveu um token diferente do que está nos segredos" | Se o aviso mostra dois tamanhos diferentes, o Instagram de fato trocou o token: gere um token novo no Meta (Passo 2) e atualize o segredo `IG_ACCESS_TOKEN`. Se for um token colado com espaço ou quebra de linha, republicar `ig-token-refresh` e `ig-insights` resolve (elas já ignoram espaços nas pontas) |

Pra ver o que as funções registraram: Supabase > **Edge Functions** > escolha a função > aba **Logs**.

Pra destravar o freio sem o botão: no SQL Editor, `update public.ig_send_budget set paused_until = null, err_streak = 0;`

---

## Sobre o sistema antigo de automações

O arquivo `automacoes.sql` e a função `meta-webhook` são de uma versão anterior, que não aparece mais no painel e guardava o token dentro do banco. Esta versão nova NÃO usa nenhum dos dois: ela usa as tabelas `ig_*`, as funções `instagram-webhook`, `ig-*` e guarda tudo nos segredos. Se você tinha o webhook antigo cadastrado no Meta, troque a URL pelo endereço novo (Passo 6). Os arquivos antigos podem ficar onde estão.
