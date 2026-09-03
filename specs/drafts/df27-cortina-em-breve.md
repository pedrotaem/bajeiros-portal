# DF-27 — Cortina "Em breve" em produção

- **Status:** ✅ **IMPLEMENTADA — N1** (2026-09-02); N2 (§5.5) segue opcional e não entrou.
  Não vai para `spec.md`, que é do validador. **Ligar em prod é ato de operação** (§8): o código
  está no ar, a variable `COMING_SOON` e o `apply` do `noindex` é que decidem.
  - Produção (`bajeiros.com.br`) atende uma tela **"Em breve"** no lugar do portal.
  - **Login continua possível** — a cortina tem porta.
  - **Só o administrador** (`users.is_admin`, hoje `pedrotaem@gmail.com`) vê o portal real.
  - **Staging (`staging.bajeiros.com.br`) não é afetado** — é onde o trabalho continua.
  - Ligar/desligar é **operação**, não release: um `config.json` publicado e uma invalidação.
- **Dependências:** DF-9 (`is_admin` e `POST /me`), DF-17 (login Cognito), DF-25 (a vitrine que
  a cortina esconde), DF-12 (o shell que deixa de montar)
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-9](df9-admin.md) ·
  [DF-25](df25-vitrine-publica.md) · [runbook](../../docs/runbook.md) ·
  [plano de produção v2](../../docs/plano-producao-v2.md)

## 1. Contexto e motivação

Prod e staging rodam **o mesmo artefato de build**: o deploy publica o mesmo `dist/` nos dois
ambientes e só troca o `config.json` (`.github/workflows/deploy.yml`). Hoje isso significa que
tudo que entra em `main` fica visível em `bajeiros.com.br` no mesmo dia — inclusive a vitrine
pública do DF-25, que é a cara do produto e ainda não está pronta para receber gente.

O que se quer é o estado normal de um produto antes do lançamento: **o domínio já existe, a
marca já aparece, o conteúdo ainda não.** E quem constrói precisa continuar entrando no domínio
de produção pelo caminho de verdade — mesmo login, mesmo Cognito, mesmos dados — para conferir
prod com prod, não staging com prod.

Duas restrições moldam a solução:

1. **O login não pode ser desligado.** Se a porta fecha para todo mundo, o administrador também
   fica de fora, e a única volta seria um deploy.
2. **A autorização já existe e não muda.** `POST /api/v1/me` devolve `isAdmin`
   (`modules/identity/routes.ts`), promovido só à mão por conexão owner (DF-9). A cortina
   consome esse sinal; não inventa um segundo conceito de administrador.

## 2. Objetivos e não-objetivos

**Objetivos**

- Visitante anônimo em produção vê **só** a cortina "Em breve".
- O fluxo de login segue inteiro a partir da cortina (Cognito, Google, criação de conta).
- Administrador logado vê o portal de produção **sem nenhuma cortina**.
- Staging e o dev local ficam com o comportamento de hoje, sem uma linha de diferença.
- Alternar a cortina não exige rebuild nem PR.

**Não-objetivos**

- **Controle de acesso.** A cortina é de produto. O que protege dado é a API (JWT + RLS), e
  isso não muda uma linha. Ver §9, que é a parte honesta desta spec.
- Lista de beta-testers, convites de acesso antecipado ou papéis novos. Um administrador, o
  que já existe.
- Formulário de "avise-me no lançamento" (captura de e-mail). Cabe depois, sem tocar nada disto.
- Reabrir a decisão do ADR-009 dec. 4 (sem router): a cortina é decisão de **render**, não de rota.

## 3. Histórias de usuário

- **US-DF27.a** Como visitante que digitou `bajeiros.com.br`, quero entender que o portal está
  chegando — e não topar com um produto meio pronto.
- **US-DF27.b** Como administrador, quero entrar em produção pelo login normal e usar o portal
  inteiro, sem flag de URL nem build especial.
- **US-DF27.c** Como quem desenvolve, quero continuar publicando em `main` e vendo tudo em
  staging, sem que a cortina de prod mude uma linha do meu trabalho.
- **US-DF27.d** Como dono do portal, quero **derrubar a cortina no dia do lançamento em
  minutos**, sem depender de pipeline verde.

## 4. Decisão de arquitetura

A cortina tem duas camadas possíveis. Elas são independentes e **N1 é a entrega**; N2 é
opcional e fica aqui especificada para ser mecânica quando/se for pedida.

|                | **N1 — cortina no app**                              | **N2 — cortina na borda**                |
| -------------- | ---------------------------------------------------- | ---------------------------------------- |
| Onde           | React, antes do `Shell`                              | CloudFront Function (viewer-request)     |
| Esconde de     | visitante, buscador (com `noindex`), preview de link | idem, **e** o HTML/bundle nunca chega    |
| Não esconde de | quem abre o devtools                                 | quem forja `?entrar=1` (§9)              |
| Custo          | 1 componente + 1 campo no `config.json`              | + 1 página estática, + `terraform apply` |
| Alternar       | publicar `config.json` (segundos)                    | `terraform apply` (minutos)              |

**Recomendação: implementar N1 agora, junto com `noindex` em prod enquanto a cortina estiver
ligada.** N1 resolve o objetivo declarado (ninguém que acessa vê o conteúdo) com uma peça, e o
`noindex` resolve buscador. N2 só se paga se o requisito virar "nem o HTML pode sair" — e mesmo
aí ele não fecha de todo, porque login aberto **obriga** a servir o app a quem pede login.

**Por que não Basic Auth / senha na borda:** fecharia o login junto (o Cognito nunca receberia o
visitante) e trocaria a identidade real do administrador por uma senha compartilhada. Contraria
os dois requisitos do enunciado.

## 5. Requisitos funcionais

### 5.1 A chave (config por ambiente)

- **FR-DF27.1** `AppConfig` (`apps/web/src/config.ts`) ganha `comingSoon?: boolean`. **Ausente =
  desligada.** `loadAppConfig` preserva o campo no caminho `cognito`; o fallback `DEV_CONFIG`
  nunca liga a cortina — dev local e qualquer falha de leitura seguem sem cortina (§6, fail-open).
- **FR-DF27.2** O passo "Gerar config.json do ambiente" do `deploy.yml` escreve
  `"comingSoon": <vars.COMING_SOON || false>`, lido da variable do **environment `production`**.
  O environment `staging` não define a variable → `false`. O build continua **único**.
- **FR-DF27.3** `config.json` já é publicado com `Cache-Control: no-cache` e já entra na
  invalidação mínima. Alternar a cortina = publicar um arquivo de 200 bytes + invalidar um
  caminho (§8). Nenhuma etapa de build participa.

### 5.2 A cortina no app (N1)

- **FR-DF27.4** Regra única de decisão, função pura testável:
  `mostrarCortina(config, user) === (config.comingSoon === true && user?.isAdmin !== true)`.
- **FR-DF27.5** Com a cortina ativa, o `App` renderiza **só** a cortina: `Shell`, `HomePage`,
  `PublicHome`, `TeamPage`, `CommunityPage` e o editor **não montam**. Nada de WebGL, nada de
  dado do DF-25 no DOM. É isso que faz a cortina esconder de fato, em vez de sobrepor.
- **FR-DF27.6** A cortina renderiza `<SessionPanels />` junto: o botão **"Entrar"** abre
  `panel: 'login'` e o painel de login existente funciona inteiro (e-mail/senha e Google,
  conforme `authProviders()`), sem componente de login novo.
- **FR-DF27.7** O boot **não muda**: `loadAppConfig` → `initSession` → `createRoot`
  (`main.tsx`). O callback OIDC (`?code=`) e o convite (`#convite=`) continuam tratados antes do
  primeiro render. A cortina nunca intercepta boot — só render.
- **FR-DF27.8** Sessão iniciada e **não** administradora: a cortina permanece, agora no estado
  "conta criada — avisamos no lançamento", com o nome de quem entrou e um botão **"Sair"**
  (`logout()`). Sem redirect, sem laço, sem erro.
- **FR-DF27.9** Sessão administradora (`isAdmin === true`): a cortina desaparece por completo e
  o portal de produção fica idêntico ao de hoje, inclusive a página `admin`.
- **FR-DF27.10** A cortina carrega o **disclaimer permanente do `spec.md` §1** (portal sem
  vínculo com a SAE). Enquanto ela for a única página visível, a obrigação de interface mora nela.
- **FR-DF27.11** `track('page:em-breve')` só para sessão logada — a regra do DF-9 de não
  rastrear anônimo continua valendo, e é a cortina que mais recebe anônimo.

### 5.3 O assistente anônimo

- **FR-DF27.12** `ANON_DAILY` (hoje constante `2` em `modules/assistant/routes.ts`) vira
  `ASSISTANT_ANON_DAILY`, com default `2`. **Produção com cortina roda `0`.** É a única rota que
  gasta dinheiro com LLM sem conta, e ela não passa pela UI: uma cortina que a deixasse aberta
  seria decorativa justo do lado que custa. A resposta é a mensagem de limite que já existe.

### 5.4 Buscadores

- **FR-DF27.13** Enquanto a cortina estiver ligada, prod aplica `X-Robots-Tag: noindex, nofollow`
  (`noindex = true` no módulo `static-site`; staging já é `true`). Derrubar a cortina e devolver
  `noindex = false` é **o mesmo ato**, e está no checklist do §8.

### 5.5 A cortina na borda (N2 — opcional, não entra agora)

- **FR-DF27.14** A lógica entra **dentro da função `spa_router` existente**, condicionada por
  `var.coming_soon`. CloudFront aceita **uma função por evento por comportamento** — criar uma
  segunda função de viewer-request desligaria o fallback da SPA. Com `coming_soon = false` o
  código publicado é o de hoje.
- **FR-DF27.15** Pedido de página (URI sem `.`, ou `/`, ou `/index.html`) sem passe →
  `request.uri = '/em-breve.html'`. `/api/*` tem comportamento próprio e **nunca** passa por aqui.
- **FR-DF27.16** Passes aceitos: cookie `bj_preview=<segredo>`; querystring com `code` **e**
  `state` (callback OIDC); `?entrar=1` (o botão de login da página estática); `?acesso=<segredo>`.
- **FR-DF27.17** `em-breve.html` é **autônoma** (sem bundle, sem fetch), publicada pelo mesmo
  deploy com `Cache-Control: no-cache`, e o "Entrar" dela aponta para `/?entrar=1` — a autenticação
  continua existindo **uma vez só**, no app.
- **FR-DF27.18** O SPA grava o cookie quando a URL traz `?acesso=<valor>`: o segredo vem **da URL
  que o administrador digitou**, nunca do bundle. `path=/; max-age=31536000; SameSite=Lax; Secure`,
  e o parâmetro sai da URL com `history.replaceState`, como o convite já faz.
- **FR-DF27.19** O segredo vive em `TF_VAR_coming_soon_secret`, nunca em `.tfvars` versionado
  (mesmo contrato das credenciais do Google no DF-17). Rotacionar = `apply`.

## 6. Requisitos não-funcionais

- **Alternância sem release.** N1 alterna publicando `config.json`; sem `npm ci`, sem CI verde.
- **Fail-open no cliente, deliberado.** `config.json` ilegível → `DEV_CONFIG` → sem cortina. A
  escolha é disponibilidade acima de opacidade: um portal no ar sem cortina é erro menor que um
  portal inacessível por causa de um arquivo de 200 bytes. Quem quiser fail-closed usa N2.
- **Custo zero de render.** A cortina não monta 3D, não busca dado, não chama a API. Uma tela e
  um botão.
- **Acessibilidade** (design-system): um `<h1>`, contraste AA, foco visível, o botão "Entrar"
  como primeiro elemento focável, nada preso atrás de `aria-hidden`.
- **Reversível.** Nenhuma migração, nenhum dado, nenhum contrato de API novo. Remover a feature é
  remover um componente e um campo opcional.

## 7. Conteúdo da cortina

Uma tela, centrada, sem rail e sem topbar — é a única página do site:

- marca (o logo com a arte de gaiola já em `public/marca/`);
- `<h1>` **"Em breve"**;
- uma linha do que é: ferramentas e memória da comunidade Baja brasileira;
- **"Entrar"** (única ação; abre o painel de login);
- estado alternativo para sessão não-admin: "Sua conta está pronta — avisamos assim que abrirmos"
  - "Sair";
- disclaimer do `spec.md` §1 no rodapé (FR-DF27.10).

Sem contagem regressiva (data não decidida e prometida em público envelhece mal) e sem captura de
e-mail (§2, não-objetivo).

## 8. Operação

**Ligar** (o dia de hoje):

1. Promover `pedrotaem@gmail.com` a `is_admin` em **produção** (conexão owner, runbook DF-9) —
   **antes** de ligar a cortina. É o passo que evita se trancar do lado de fora.
2. Conferir entrando em prod: `POST /me` devolvendo `isAdmin: true`.
3. Variable `COMING_SOON=true` no environment `production`; `noindex = true` no `envs/prod` + apply.
4. Re-rodar o deploy (`workflow_dispatch`) **ou**, para efeito imediato, publicar o `config.json`
   à mão e invalidar `/config.json` (comandos exatos no runbook, seção Cortina).

**Desligar** (dia do lançamento): `COMING_SOON=false`, `noindex = false` + apply, publicar
`config.json`, invalidar. Site inteiro de volta em menos de um minuto de propagação.

**Se você se trancar para fora** (promoção não aplicada, conta errada, `is_admin` perdido):

- publicar `config.json` com `comingSoon:false` (não depende de login nenhum); ou
- com N2 no ar, abrir `https://bajeiros.com.br/?acesso=<segredo>`.

Ambos entram no runbook — cortina sem chave reserva é incidente esperando data.

## 9. Segurança e limites honestos

- **N1 é cortina, não muro.** O bundle continua público e o conteúdo estático (vitrine, panorama,
  catálogo de regras) sai com ele. Quem abrir o devtools e forçar `comingSoon:false` vê a
  interface. Aceitável porque **é exatamente o que já é público hoje**.
- **O que a cortina nunca esteve protegendo:** equipes, projetos, fichas, conhecimento. Esses
  dependem de JWT válido e das políticas de RLS, antes e depois desta spec.
- **N2 fecha buscador, preview de link e visitante casual** — não fecha quem sabe acrescentar
  `?entrar=1`. E não tem como fechar: "o login continua possível" implica servir o app a quem
  pede login. Está escrito aqui para não ser descoberto depois como falha.
- **O cookie de bypass não é credencial.** Ele remove a cortina; não autentica, não autoriza, não
  dá acesso a dado nenhum. Por isso não precisa ser `HttpOnly` (é o próprio SPA que o grava).
- **Superfície nova = zero rota nova.** Nenhum endpoint, nenhuma coluna, nenhum escopo.

## 10. Critérios de aceite

- **AC-DF27.1** Anônimo em `bajeiros.com.br` vê "Em breve"; nenhum texto ou dado da vitrine
  aparece no DOM.
- **AC-DF27.2** "Entrar" na cortina abre o painel de login e o fluxo Cognito (inclusive Google)
  completa até o retorno em `/`.
- **AC-DF27.3** Conta comum recém-criada, autenticada com sucesso, **continua na cortina**, com o
  estado de conta pronta e o botão "Sair" funcionando.
- **AC-DF27.4** `pedrotaem@gmail.com` (`is_admin = true`) vê o portal de produção completo —
  Início, Equipe, Ferramentas, Comunidade, Administração — sem cortina em nenhuma delas.
- **AC-DF27.5** `staging.bajeiros.com.br` não muda em nada; o `config.json` de staging não tem
  `comingSoon` (ou o tem `false`).
- **AC-DF27.6** `npm run dev` local não mostra cortina em nenhuma hipótese.
- **AC-DF27.7** Em prod com cortina, pergunta anônima ao assistente é recusada pelo limite diário.
- **AC-DF27.8** Prod responde `X-Robots-Tag: noindex, nofollow` enquanto a cortina estiver ligada.
- **AC-DF27.9** Desligar a cortina devolve o site sem rebuild e sem PR, em ≤ 1 minuto.
- **AC-DF27.10** Sessão administradora recarregando a página cai na cortina por um instante e sai
  dela quando `POST /me` responde — sem piscar conteúdo do portal antes da hora, e sem travar se a
  API demorar (cold start do Aurora, ~15–20 s no primeiro acesso).
- **AC-DF27.11** (N2, se implementado) `curl -s https://bajeiros.com.br/` devolve `em-breve.html`,
  sem `<script>` do bundle.

## 11. Testes

- **Unitário** (`apps/web/src/cortina.test.ts`): tabela-verdade de `mostrarCortina` —
  `comingSoon` ausente/`false`/`true` × `user` nulo/comum/admin.
- **Unitário** (config): `loadAppConfig` preserva `comingSoon` no caminho cognito e **não** o
  inventa no fallback dev.
- **Guarda de fonte** (estilo `vitrine.test.ts`): `App.tsx` não monta `Shell` no ramo da cortina.
- **API** (`apps/api/src/test/assistant.test.ts`): `ASSISTANT_ANON_DAILY=0` recusa a pergunta
  anônima e não chama o gateway.
- **Manual em prod**, na ordem do §10: anônimo → login de conta comum → login do administrador →
  desligar e religar a cortina.
- **Smoke do deploy:** o teste atual faz `grep -qi "bajeiros"` no corpo da raiz — a cortina
  **passa** (a marca está nela). Com N2, revisar: `em-breve.html` precisa conter "bajeiros".

## 12. Plano de implementação

**Fase 1 — N1 (entrega):** `config.ts` (campo) → `cortina.ts` (decisão pura) → `ComingSoon.tsx`

- CSS → ramo no `App.tsx` → `ASSISTANT_ANON_DAILY` → `deploy.yml` → `noindex` no `envs/prod` →
  runbook. Oito arquivos tocados; nenhum contrato, nenhuma migração.

**Fase 2 — N2 (opcional, só se pedido):** `em-breve.html` + `var.coming_soon` e
`var.coming_soon_secret` no módulo `static-site` + a lógica dentro do `spa_router` + o cookie do
`?acesso=` no SPA + apply em prod. **Nunca aplicar N2 antes de N1 estar no ar e verificado** — a
ordem inversa deixa a borda escondendo um app que ainda mostraria o conteúdo a quem entrasse.

## 13. Riscos e decisões abertas

- **A promoção a `is_admin` em produção ainda não foi confirmada.** É pré-requisito do §8 passo 1,
  e é o único risco real de auto-trancamento.
- **Fail-open × fail-closed** (§6): decidido fail-open. Reversível trocando uma condição, se o
  julgamento mudar.
- **`noindex` durante a cortina:** proposto ligar. A alternativa — deixar o Google indexar a
  página "Em breve" para marcar o domínio — troca uma vantagem pequena por uma primeira impressão
  ruim no resultado de busca por meses. Decisão do dono do portal.
- **Cortina no `www`:** os dois aliases servem a mesma distribuição, então a cortina cobre os dois
  de graça. Nada a fazer; registrado para não virar dúvida.
- **N2 nesta rodada?** Recomendação: não. Se o objetivo incluir "nem o HTML pode sair para
  buscador ou preview de link", `noindex` (FR-DF27.13) resolve a parte que importa por muito menos.
