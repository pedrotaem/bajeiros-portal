# DF-28 — Assistente sem conta: demonstração no lugar da degustação

- **Status:** proposto em 2026-09-03. Fecha no próprio draft — não vai para `spec.md`, que é do
  validador.
  - A **degustação anônima** do assistente (2 perguntas por dia por IP) **acaba**. Quem não tem
    conta não gasta mais um token de LLM.
  - No lugar do painel bloqueado, a página do assistente passa a mostrar uma **demonstração
    animada** de uma conversa real: pergunta → resposta com citação → pergunta de continuação →
    resposta.
  - O rodapé da demonstração diz que o assistente é para quem tem conta e **convida** a entrar ou
    criar a conta.
- **Dependências:** DF-8 (o assistente), DF-12 (shell e `PageId`), DF-25 (vitrine, que é quem
  promete a ferramenta), DF-27 (cortina — esta spec **substitui** a FR-DF27.12)
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-8](df8-assistente-regras.md) ·
  [DF-25](df25-vitrine-publica.md) · [DF-27](df27-cortina-em-breve.md) ·
  [design-system §6 (movimento)](../../docs/design-system.md)

## 1. Contexto e motivação

O assistente do regulamento nasceu fechado (DF-8, consenso C16: exigia e-mail verificado) e foi
**aberto depois**, no `48add3e`, com uma degustação de **2 perguntas por dia por IP**. A intenção
era funil: quem experimenta cria conta. Um ano de portal depois, o que existe é o custo, e não a
evidência do funil.

O que a degustação é hoje, medido no código e não de memória:

1. **É a única rota do portal que gasta dinheiro sem conta.** Toda outra chamada anônima lê
   HTML estático. Uma pergunta ao gateway custa entre US$ 0,01 (leitura de cache de 1 h) e
   US$ 0,22 (escrita de cache fria, medida no E2E de staging em 2026-08-26).
2. **A contenção é de mentira e está escrito no arquivo.** A quota anônima vive num `Map` em
   memória do processo (`anonUsage`, `routes.ts`), com comentário próprio dizendo
   "best-effort; reinício zera". Em Lambda, cada instância tem o seu `Map` — o teto real nunca
   foi 2 por dia, foi 2 por dia **por instância viva**.
3. **Ela não é medível.** Anônimo não entra no `assistant_log` por promessa explícita do aviso
   de transparência ("nada é armazenado"). Então não existe, e nunca existiu, o número que
   justificaria a degustação: quantas contas ela criou.
4. **O DF-27 já teve que fechá-la à mão.** A cortina "Em breve" precisou de uma variável de
   ambiente inteira (`ASSISTANT_ANON_DAILY=0`) só para essa rota, porque ela é a única que não
   passa pela tela — o §5.3 daquele draft registra isso como exceção, não como padrão.

Some o custo, mas some junto a **única prova sem atrito** do produto. Quem chega pela vitrine
(DF-25) lê que o assistente "responde citando seção e página" e não tinha como conferir sem se
cadastrar. É esse buraco que a demonstração fecha — e ela fecha melhor do que a degustação
fechava, porque duas perguntas de quem ainda não sabe o que perguntar costumam ser gastas em
"oi" e num teste de limite.

O pedido do dono do produto, literal: retirar a liberação e, em vez de mostrar o assistente
bloqueado, mostrar uma **demonstração animada** do uso, com o convite a entrar embaixo.

## 2. Painel bloqueado × demonstração

A alternativa barata seria manter a tela do chat com o campo desabilitado e um aviso. Ela foi
recusada por três motivos concretos, todos verificáveis nesta base de código:

| Painel desabilitado                                                               | Demonstração                                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Mostra o que a pessoa **não** pode fazer. O produto aparece como uma porta.       | Mostra o que a pessoa **ganha**: a resposta, com a seção e a página.             |
| Não responde à pergunta que a vitrine levanta ("cita seção e página" — cita bem?) | Responde: a citação aparece na tela, no mesmo chip que o assistente real usa.    |
| Campo desabilitado convida a tentar digitar; frustração é o primeiro contato.     | Não há campo para tentar. O único caminho na tela é a ação que a gente quer.     |
| Zero custo de manutenção.                                                         | Custa manter o roteiro alinhado com o regulamento vigente (§9.2, com mitigação). |

O precedente interno também aponta para a demonstração: o `PrecisaDeConta` (DF-25) já é o padrão
para destino que exige conta, e ele **explica** em vez de redirecionar em silêncio. A
demonstração é o mesmo princípio com o próximo grau de esforço, aplicado à única página do portal
onde o valor é difícil de descrever em texto e fácil de mostrar.

## 3. Objetivos e não-objetivos

**Objetivos**

- Fechar o gasto de LLM sem conta, **na API** e não na tela.
- Dar a quem não tem conta uma prova honesta do que o assistente faz, em menos de 15 segundos,
  sem digitar nada.
- Convidar à conta no lugar exato onde a pessoa acabou de ver o valor.
- Deixar o caminho de volta (reabrir a degustação) barato e escrito, para o caso de a decisão se
  mostrar errada (§9.1).

**Não-objetivos**

- **Não** é uma prévia interativa. A pessoa não digita, não escolhe pergunta, não gera resposta.
- **Não** é um vídeo, nem GIF, nem imagem. É a mesma árvore de componentes do chat real, com
  texto entrando por temporizador (§5.4) — assim ela não descola do visual do produto.
- **Não** muda nada para quem tem conta: aviso de transparência, quota de 20/dia, streaming,
  citações e registro no `assistant_log` continuam idênticos.
- **Não** inventa capacidade: a resposta mostrada é uma paráfrase do que o regulamento diz de
  verdade, com a citação certa (§5.3).
- **Não** cria tabela, migração, contrato ODCS nem rota nova.

## 4. Requisitos funcionais

### 4.1 A porta fecha na API

- **FR-DF28.1** Todo o módulo `/api/v1/assistant` passa a exigir sessão. O router sai de
  `optionalAuth` e passa a ser montado **depois** do `requireAuth` global, junto com os demais —
  deixa de ser exceção na ordem do `app.ts`.
- **FR-DF28.2** `POST /assistant/chat` sem `Authorization` responde **401**, e o gateway **não é
  chamado**. Nenhum token de LLM é gasto por quem não tem conta.
- **FR-DF28.3** `GET /assistant/status` também exige sessão. A resposta perde o campo
  `anonymous`: ele só existia para a UI distinguir os dois modos, e não há mais dois modos.
- **FR-DF28.4** A quota anônima por IP some inteira: o `Map` em memória, o `anonBump`, o
  `rateKey` de `anon:<ip>` e a variável `ASSISTANT_ANON_DAILY` (env da API e variável do módulo
  Terraform). O que sobra é a quota de conta gratuita, contada no `assistant_log`.
- **FR-DF28.5** O middleware `optionalAuth` é **removido** junto — ele fica sem nenhum uso, e
  middleware de auth frouxo sem call site é convite a erro futuro (montar uma rota com ele por
  engano aceita anônimo em silêncio). O tipo `OptionalAuthEnv` fica, porque o `accessLog` o usa.
- **FR-DF28.6** O aceite anônimo do aviso de transparência (`localStorage`
  `bajeiros:assistant-notice-v1`) deixa de ser lido e de ser escrito. O aviso volta a ser o que o
  DF-8 desenhou: registro em trilha de auditoria, com conta.

### 4.2 A demonstração

- **FR-DF28.7** Sem sessão, a página do assistente mostra a demonstração no lugar do chat. Com
  sessão, nada muda.
- **FR-DF28.8** A demonstração encena **quatro turnos**, nesta ordem: pergunta, resposta,
  pergunta de continuação, resposta. A segunda pergunta é uma **continuação** da primeira, e não
  outro assunto — é o que mostra que o assistente mantém o fio.
- **FR-DF28.9** Ela usa os **mesmos componentes e classes** do chat real: bolha de pergunta,
  bolha de resposta com o mini-renderer (`Rich`), indicador de digitação e os chips de citação
  `seção · p. N`. Uma demonstração que não parece o produto não demonstra o produto.
- **FR-DF28.10** A encenação tem quatro fases por turno: a pergunta é **digitada letra a letra**
  na caixa de texto, é **enviada** (vira bolha, caixa esvazia), o assistente **pensa** (o mesmo
  `…` do chat real) e a resposta **entra em blocos**, como o streaming faz. As citações aparecem
  **ao fim** da resposta, como no produto.
- **FR-DF28.10-a** A caixa de texto existe **só enquanto a encenação roda** — ela está ali para
  mostrar a pergunta sendo digitada. Parada no fim, com o `Sua pergunta…` de sempre, ela seria o
  campo morto que o §2 recusa (§9.4).
- **FR-DF28.11** A demonstração roda **uma passada e para**, no estado final (a conversa inteira
  na tela). Nunca em laço — o design system proíbe o que pulsa sem parar (§5.5).
- **FR-DF28.12** Um controle **"Repetir"** roda de novo, sob demanda. É a única forma de
  reexecutar.
- **FR-DF28.13** A tela diz que é uma **demonstração**, com essa palavra, num rótulo permanente
  acima da conversa. Nunca se passa por resposta gerada na hora.
- **FR-DF28.14** Sem sessão, a página **não faz nenhuma chamada de API** — nem `status`, nem
  `notice`, nem `chat`. Quem não tem conta não gera requisição para uma rota que vai recusá-lo.

### 4.3 O convite

- **FR-DF28.15** Abaixo da conversa, um bloco fixo explica em uma frase que o assistente é para
  quem tem conta, e oferece a ação primária **"Entrar ou criar conta"**, que abre o painel de
  login (`setPanel('login')`) — o mesmo caminho do resto do portal.
- **FR-DF28.16** O bloco declara o que a conta dá, com o número real: **20 perguntas por dia**,
  no plano gratuito. Promessa vaga ("acesso completo") não é convite, é anúncio.
- **FR-DF28.17** O convite não promete o que a demonstração já mostrou de outro jeito, e não usa
  linguagem de escassez, contagem regressiva ou urgência fabricada.
- **FR-DF28.18** O rodapé mantém o aviso que vale em toda tela do assistente: ele pode errar,
  confira no PDF oficial, não substitui a inspeção (B6.4).

### 4.4 Os outros caminhos até o assistente

- **FR-DF28.19** O cartão do assistente no hub de Ferramentas (DF-12), sem sessão, deixa de
  pedir a quota e passa a dizer que a ferramenta **precisa de conta**; o botão vira **"Ver a
  demonstração"** e leva à mesma página.
- **FR-DF28.20** Com sessão, esse cartão mostra a quota **certa**. Hoje ele lê `remaining` e
  `limit`, campos que a API nunca devolveu (ela devolve `dailyLimit` e `usedToday`), e por isso
  cai sempre no texto de indisponível — defeito real, corrigido aqui (§9.4).
- **FR-DF28.21** O botão "perguntar ao assistente" do checklist do validador (`RulePanel`)
  continua levando à página do assistente sem sessão — quem está sem conta cai na demonstração,
  que é a resposta honesta. A pergunta pré-preenchida **fica guardada** no store e aparece na
  caixa de texto se a pessoa entrar sem sair da página.
- **FR-DF28.22** A vitrine (DF-25) deixa de dizer que as duas ferramentas "abrem sem conta". O
  validador abre; o assistente passa a ser descrito com o que ele é agora. Texto de vitrine que
  não corresponde à tela é o pior tipo de dívida: ele é lido primeiro.

### 4.5 Movimento e acessibilidade

- **FR-DF28.23** Com `prefers-reduced-motion: reduce`, a demonstração **não anima**: a conversa
  inteira aparece de uma vez, no estado final, e o botão "Repetir" desaparece (não há o que
  repetir). Isto é decidido em JS, não por `@media` — o CSS global do design system reduz
  duração, mas não desliga um temporizador.
- **FR-DF28.24** A região da conversa é `aria-live="off"`: a animação não deve narrar a conversa
  em pedaços a quem usa leitor de tela. O leitor recebe o conteúdo completo, que é o que a
  fase final rende de qualquer modo.
- **FR-DF28.25** A demonstração não bloqueia nada: o rail, a topbar e o resto do portal seguem
  navegáveis enquanto ela roda.

## 5. Decisões que valem para quem mexer nisso

### 5.1 Fechar no servidor, não no botão

Esconder o campo de texto e manter a rota aberta seria mais rápido e teria fechado o pedido —
e teria deixado a rota que gasta dinheiro aberta para `curl`. A regra do repo é a do DF-26 §6.2:
quem garante é a camada de baixo. Aqui a camada de baixo é o `requireAuth`, e a mudança que a
efetiva é **tirar o módulo da exceção** que ele ocupava no `app.ts` desde o DF-8.

Ganho colateral: o `accessLog` do assistente deixa de ser aplicado duas vezes (uma pelo módulo,
outra pelo global) — o módulo aplicava o seu porque estava fora do escopo global.

### 5.2 A degustação sai, e o que sai com ela

Não fica variável de ambiente desligada, nem `Map` morto, nem middleware sem uso. Config que
existe mas não faz nada é a mesma classe de problema do doc que envelhece: alguém no ano que vem
lê `ASSISTANT_ANON_DAILY` e conclui que a degustação existe.

Isso **substitui a FR-DF27.12**. A cortina "Em breve" não precisa mais fechar o assistente por
variável: sem conta não há assistente em ambiente nenhum, o que é estritamente mais fechado que
`ASSISTANT_ANON_DAILY=0`. A AC-DF27.7 (pergunta anônima recusada em prod com cortina) continua
verdadeira, por um motivo mais forte. O draft do DF-27 recebe a nota de substituição.

O caminho de volta, se a decisão se mostrar errada, está no §9.1 — e é `git revert` de um commit,
não uma arqueologia.

### 5.3 Roteiro fixo, conteúdo verdadeiro, rótulo honesto

A tentação é escrever a resposta mais bonita possível. Três travas:

1. **O conteúdo sai do corpus real.** As duas respostas foram escritas a partir das seções
   `B6.3.3.1` e `B6.3.3.2.x` do RATBSB emenda 7, conferidas no corpus extraído do PDF — inclusive
   as páginas dos chips (49 e 50), que não foram estimadas.
2. **É paráfrase, nunca transcrição.** Vale aqui a mesma regra do resto do portal: parafrasear a
   regra, não reproduzir o texto do regulamento. O assistente real cita trecho curto (≤ 25
   palavras, contrato do gateway); a demonstração não cita trecho nenhum.
3. **A tela diz que é demonstração** (FR-DF28.13). Sem esse rótulo, um roteiro fixo bem feito é
   indistinguível de uma resposta gerada — e a primeira pergunta de verdade que sair diferente
   viraria "o portal mentiu".

O par de perguntas escolhido não é decorativo: "qual a seção mínima dos tubos primários" é a
dúvida mais comum de gaiola, e "como comprovo a equivalência na inspeção" é exatamente o tipo de
continuação que só um assistente com o regulamento inteiro responde — o validador, que só lê
geometria, não responde.

### 5.4 Temporizador sobre os componentes do chat, não CSS nem vídeo

Três implementações possíveis: vídeo/GIF gravado, animação CSS pura, ou a árvore de componentes
real alimentada por temporizador. A terceira ganha:

- **Vídeo** desatualiza silenciosamente a cada mudança de estilo, pesa no bundle ou vira pedido
  de rede, e não herda o tema (o portal tem claro e escuro, com dois seletores).
- **CSS puro** obrigaria a escrever o texto no HTML e revelá-lo por `steps()`; o efeito de
  streaming em blocos não sai, e cada mudança de roteiro vira mudança de CSS.
- **Componentes + temporizador** herda tema, tokens, tipografia e o mini-renderer de markdown de
  graça. E a parte que decide **o que aparece em cada quadro** vira função **pura**, testável sem
  DOM — o mesmo formato do `contextoDaPagina()` (DF-26) e do `mostrarCortina()` (DF-27).

Os quadros são pré-calculados em `apps/web/src/assistant-demo.ts`. O componente só anda no
índice e desenha o quadro atual.

### 5.5 Uma passada, e o design system é quem manda

O §6 do design system fecha com "nada pisca, nada pulsa por mais de um ciclo, nada se move sem
interação do usuário". Uma demonstração em laço violaria as três. Uma passada única, disparada
pela navegação até a página, e parada no estado final não viola nenhuma na prática: é conteúdo se
revelando uma vez, e o repouso é a conversa completa — o mesmo estado que `prefers-reduced-motion`
entrega de imediato.

O "Repetir" existe justamente para não precisar do laço: quem quiser ver de novo pede.

Nenhuma propriedade proibida é animada. Não há transição de `width`, `height` ou `padding`: o que
muda entre quadros é **texto**, e o contêiner tem altura própria com rolagem, como o fio do chat
real.

### 5.6 Sem rede para quem não tem conta

A decisão de qual tela mostrar vem do `user` da sessão, que o `App` já usa para todos os outros
destinos. Não se pergunta à API "posso?" para receber um 401 previsível. Isso apaga o estado de
carregamento inteiro na primeira impressão: a demonstração começa no primeiro quadro, e não
depois de um `fetch`.

## 6. Modelo de dados

**Nenhuma mudança.** Sem tabela nova, sem migração, sem contrato ODCS novo, sem coluna. O
`assistant_log` continua sendo o que era, e continua só de quem tem conta — a diferença é que
agora essa é a única população possível.

Some uma linha de configuração (`ASSISTANT_ANON_DAILY`) da API e do módulo Terraform, o que exige
um `apply` para tirar a variável de ambiente da Lambda. Sem `apply`, a variável fica setada e
ignorada — inofensivo, e é o estado esperado entre o merge e a próxima aplicação de infra.

## 7. Módulos afetados

| Módulo                                       | Mudança                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api/src/app.ts`                        | assistente sai da exceção: montado depois do `requireAuth` global        |
| `apps/api/src/modules/assistant/routes.ts`   | `requireAuth`; quota anônima, `anonDaily` e `rateKey` de IP removidos    |
| `apps/api/src/auth/middleware.ts`            | `optionalAuth` removido (`OptionalAuthEnv` fica, o `accessLog` usa)      |
| `apps/api/src/env.ts`                        | `ASSISTANT_ANON_DAILY` removida                                          |
| `apps/api/src/test/assistant.test.ts`        | testes de anônimo viram testes de 401; teste da variável do DF-27 sai    |
| `infra/modules/api/{main,variables}.tf`      | variável `assistant_anon_daily` e a env da Lambda removidas              |
| `infra/envs/prod/main.tf`                    | perde a linha `assistant_anon_daily = 0`                                 |
| `apps/web/src/assistant-demo.ts`             | **novo**: roteiro + gerador **puro** de quadros                          |
| `apps/web/src/assistant-demo.test.ts`        | **novo**: testes do gerador                                              |
| `apps/web/src/components/AssistantDemo.tsx`  | **novo**: a tela da demonstração                                         |
| `apps/web/src/components/AssistantPanel.tsx` | ramo sem sessão; caminhos de anônimo (aviso, quota, `localStorage`) saem |
| `apps/web/src/components/ToolsHub.tsx`       | cartão sem conta + correção da leitura da quota                          |
| `apps/web/src/components/PublicHome.tsx`     | a frase "abrem sem conta" passa a valer só para o validador              |
| `apps/web/src/shell.css`                     | seção da demonstração, só com tokens                                     |
| `specs/drafts/df27-cortina-em-breve.md`      | nota de substituição na FR-DF27.12                                       |
| `specs/draft-features.md`                    | placar e seção do DF-28                                                  |

Nada em `packages/`. Nada de migração.

## 8. Critérios de aceite

| #          | Critério                                                                                                    | Verificação      |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-DF28.1  | `POST /assistant/chat` sem `Authorization` → 401 `problem+json`, e o gateway não é chamado                  | vitest ✔         |
| AC-DF28.2  | `GET /assistant/status` sem `Authorization` → 401; com sessão, responde sem o campo `anonymous`             | vitest ✔         |
| AC-DF28.3  | Token inválido continua dando 401 (não vira anônimo silencioso)                                             | vitest ✔         |
| AC-DF28.4  | Com conta, aviso, quota de 20/dia, SSE e `assistant_log` seguem idênticos ao DF-8                           | vitest ✔         |
| AC-DF28.5  | `ASSISTANT_ANON_DAILY` não existe mais no código nem na infraestrutura (só na história das specs)           | grep ✔           |
| AC-DF28.6  | O gerador de quadros começa vazio e termina com os 4 turnos completos e todas as citações                   | vitest ✔         |
| AC-DF28.7  | Em modo imediato (movimento reduzido) o gerador devolve **um** quadro, já no estado final                   | vitest ✔         |
| AC-DF28.8  | A demonstração inteira dura menos de 20 s e cada quadro tem espera positiva                                 | vitest ✔         |
| AC-DF28.9  | Toda citação do roteiro aponta para seção e página que existem no corpus do RATBSB emenda 7                 | conferido ✔      |
| AC-DF28.10 | Sem sessão, a página do assistente não dispara requisição nenhuma                                           | browser ✔        |
| AC-DF28.11 | Sem sessão, a tela mostra o rótulo "demonstração" e o convite com a ação primária de login                  | vitest ✔         |
| AC-DF28.12 | O cartão de Ferramentas sem conta diz que precisa de conta e leva à demonstração; com conta mostra a quota  | vitest ✔         |
| AC-DF28.13 | Zero hex novo em `apps/web/src`; inventário de ícones e marcas intocado                                     | guards ✔         |
| AC-DF28.14 | No navegador: a demonstração roda uma vez, para no fim, "Repetir" roda de novo, e o login abre pelo convite | manual/browser ✔ |

## 9. Riscos e o que fica em aberto

### 9.1 Some a única prova sem atrito — e o caminho de volta

A degustação era ruim como contenção e cara como funil, mas era a única forma de alguém **usar**
o assistente antes de decidir. A demonstração cobre a pergunta "o que ele faz", e não cobre "ele
acerta a minha dúvida". Se o cadastro cair de forma perceptível depois disto, a hipótese a testar
é esta.

O caminho de volta, na ordem que preserva as decisões desta spec: **primeiro** a quota anônima
volta com contagem que funciona (tabela, não `Map` de processo — o `Map` é o defeito, não a
degustação), **depois** com teto global de custo por dia, e **só então** sem exigir conta. Nunca
o inverso.

### 9.2 O roteiro envelhece com o regulamento

Emenda nova pode mudar a numeração, a página ou o conteúdo das seções citadas — e a demonstração
não tem como saber. Ela passaria a mostrar, com ar de autoridade, uma citação morta.

Mitigação hoje: o roteiro é **um arquivo só**, com as citações declaradas em dado (não espalhadas
no JSX), e a troca de emenda já é um evento manual que mexe no corpus do gateway. Fica escrito
aqui que ele entra na mesma lista de revisão. O que **não** se faz é gerar a demonstração
chamando o assistente de verdade no build: isso reintroduz custo, rede e não-determinismo numa
tela que precisa ser sempre igual.

### 9.3 Roteiro bonito demais é promessa

A resposta encenada não tem hesitação, não erra e chega na hora. O assistente real às vezes
demora, às vezes responde com menos precisão e depende do gateway estar de pé. O rótulo de
demonstração e os avisos de rodapé são a mitigação honesta. A tentação a resistir na próxima
iteração é acrescentar mais turnos e respostas mais impressionantes — o custo é a distância entre
o que se mostrou e o que se entrega.

### 9.4 Defeitos que só aparecem rodando

**Achado lendo o código, antes de mexer**, e corrigido junto porque é da mesma tela: o cartão do
assistente em Ferramentas lê `remaining`/`limit` de uma resposta que traz `dailyLimit`/`usedToday`.
A quota **nunca** apareceu ali desde o DF-12 — o cartão sempre caiu no texto de indisponível, e
nenhum teste pegou porque nenhum teste lê aquela tela. Corrigido (FR-DF28.20) e conferido no
navegador: com conta o cartão passou a mostrar "20 de 20 perguntas hoje".

**Achado rodando o app** (pilha local: Postgres dev, API em `AUTH_MODE=dev`, vite; ciclo inteiro
percorrido sem conta e com conta, zero erro e zero aviso no console):

1. **A caixa de texto ficava parada no fim da encenação**, com o `Sua pergunta…` convidando a
   escrever num campo que não recebe nada — exatamente o painel bloqueado que o §2 recusa. Ela
   passou a existir só **enquanto** a encenação roda: some junto com o último quadro, deixando a
   conversa e o convite. Em movimento reduzido ela nunca aparece, porque não há digitação a
   mostrar.

Pendência herdada e não resolvida aqui: as abas da administração seguem sem estilo (DF-26 §9.6).

### 9.5 O CSS do assistente ainda é do mundo antigo

A tela do chat vive em `styles.css`, com hex literal e catraca de token pendente (o redesign do
DF-11 ainda não chegou nela). A demonstração **reusa** as classes existentes para não descolar do
visual do chat, e escreve o que é novo em `shell.css`, com tokens. O efeito é uma tela com dois
sistemas de cor convivendo até a fase do redesign que migrar o assistente — consciente, e
registrado para não parecer descuido.

## 10. Plano

| Passo | Entrega                                                                                 |
| ----- | --------------------------------------------------------------------------------------- |
| 1     | API: `requireAuth` no módulo, remoção da quota anônima, do `optionalAuth` e da variável |
| 2     | Infra: variável fora do módulo e do env de produção                                     |
| 3     | Web: roteiro + gerador puro de quadros, com testes                                      |
| 4     | Web: `AssistantDemo`, ramo sem sessão no `AssistantPanel`, CSS com tokens               |
| 5     | Web: cartão de Ferramentas (conta e correção da quota) e a frase da vitrine             |
| 6     | Rodar o app: demonstração sem conta, login pelo convite, chat normal com conta          |
