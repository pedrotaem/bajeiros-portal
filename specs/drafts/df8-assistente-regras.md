# DF-8 — Assistente de Regras (chat de IA sobre o regulamento completo)

- **Status:** ✅ **REVISADA** (2026-08-23) — revisão 3 personas em `docs/revisao-assistente-ia.md`; consensos C1–C19 aplicados neste texto. Divergências D1–D4 aguardam decisão do usuário antes da implementação.
- **Ordem de desenvolvimento:** após fase 14 (equipes); depende do gateway de IA estar no ar (repo separado).
- **Dependências:** sessão/login (implementado, PR #10), quotas por plano (padrão de entitlements existente em `apps/api`), **Bajeiros AI Gateway** (solução separada — spec em `ai-gateway/specs/spec.md`, fora deste repo).
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · spec do gateway (repo `bajeiros-ai-gateway`) · revisão em `docs/revisao-assistente-ia.md`.

## 1. Contexto e motivação

O motor determinístico cobre a seção B6 (gaiola) do RATBSB emenda 7 — ~40 regras
automatizáveis de geometria. O regulamento completo tem muito mais: requisitos
administrativos, motor/transmissão, freios, elétrica, segurança geral, documentação,
dinâmica de provas. Equipes têm dúvidas em linguagem natural ("posso usar farol de LED?",
"qual o prazo do relatório de projeto?", "o extintor pode ficar atrás do banco?") que hoje
exigem caçar no PDF de ~150 páginas.

A feature é um **chat de IA em linguagem natural fundamentado no regulamento completo**,
com citações (seção + página) para o usuário conferir no PDF oficial. O portal **não**
fala com o provedor de LLM: fala com o **Bajeiros AI Gateway**, um serviço separado
(repo, infra e deploy próprios) que encapsula corpus, modelo, prompts e guardrails.
O portal trata o gateway como caixa-preta com contrato versionado.

## 2. Objetivos e não-objetivos

**Objetivos**

- Página/painel de chat multi-turno sobre o regulamento completo, em pt-BR.
- Toda resposta com citações (identificador da seção + página do PDF oficial).
- Integração com o validador: perguntar sobre uma infração do checklist com 1 clique.
- Separação estrita: interface/UX/quotas no portal; IA (corpus, modelo, prompt, custos de
  inferência) no gateway. Nenhuma credencial de IA no portal web ou no bundle.
- Controle de custo: quotas por plano aplicadas no backend do portal.

**Não-objetivos**

- O gateway em si (spec própria, repo separado).
- Gerar ou editar geometria de gaiola por IA.
- Substituir o motor determinístico ou a inspeção oficial (disclaimer obrigatório).
- Fine-tuning de modelo (o grounding é por contexto/citações, decisão do gateway).
- Persistência de conversas no servidor (v1 é efêmera; ver §9).

## 3. Histórias de usuário

- **US-DF8.a** Como projetista, quero perguntar em linguagem natural sobre qualquer
  seção do regulamento (não só B6) e receber resposta com a referência exata para
  conferir no PDF oficial.
- **US-DF8.b** Como projetista, ao ver uma infração no checklist, quero clicar
  "perguntar ao assistente" e receber explicação da regra e caminhos de correção,
  já com o contexto da minha medida × limite.
- **US-DF8.c** Como capitão, quero as citações (seção + página) em cada resposta para
  validar a informação antes de decidir com a equipe.
- **US-DF8.d** Como operador do produto, quero quota por plano aplicada no backend para
  o custo de inferência não fugir de controle.

## 4. Requisitos funcionais

- **FR-DF8.1** Nova área "Assistente de Regras": acessível pela landing (entrada
  secundária, sem competir com o CTA único do editor) e pela topbar do editor.
  Requer login (reaproveita sessão existente; anônimo vê teaser + botão Entrar).
- **FR-DF8.2** Chat multi-turno. Histórico da conversa vive **no cliente** (memória da
  aba, mesmo padrão do token de sessão); cada requisição envia a janela recente de
  mensagens. Recarregar a página zera a conversa (comunicado na UI).
- **FR-DF8.3** Resposta em streaming (SSE) com render incremental de markdown e botão
  "parar geração".
- **FR-DF8.4** Citações: chips por resposta com identificador da seção (ex.: B10.3.1) e
  página do PDF oficial. O chip **não** exibe trecho verbatim longo do regulamento
  (restrição de copyright — mesmo princípio do motor: parafrasear); mostra id + página e,
  no máximo, trecho curto (≤ 25 palavras) quando o gateway o fornecer.
- **FR-DF8.5** Contexto do validador: item do checklist ganha ação "perguntar ao
  assistente" que abre o chat com pergunta pré-preenchida contendo id da regra,
  `measured`/`limit` e status. Somente dados geométricos — nunca dados pessoais.
- **FR-DF8.6** Proxy de streaming **fora do API Gateway** (que não suporta response
  streaming — revisão C1): Lambda dedicada `assistant` do portal com Function URL
  `RESPONSE_STREAM`, exposta como behavior `/api/v1/assistant/*` no CloudFront
  existente (CachingDisabled, origin request policy repassa `Authorization` e não
  repassa `Host`, sem compressão, origin response timeout ≥ 60 s). A Lambda valida o
  JWT do Cognito via JWKS (perde o authorizer do API GW), aplica quota e zod, e chama o
  gateway assinando SigV4. Function URL do proxy: AuthType `NONE` + JWT obrigatório +
  header secreto CloudFront→origin verificado na Lambda (browser não assina SigV4 —
  registrar em ADR do portal, C2). Heartbeat SSE (`: ping` ~15 s) repassado (C3).
  O browser **nunca** fala com o gateway nem conhece sua credencial.
- **FR-DF8.7** Quota por plano no backend (free: N mensagens/dia, valor em entitlement
  hardcoded como nos projetos; contador em Postgres). Incremento **atômico**
  (`UPDATE … RETURNING`) antes de abrir o stream (C17). Excedeu → 429 RFC 9457 com
  mensagem amigável na UI e horário de renovação. Pré-requisitos anti-abuso: e-mail
  verificado obrigatório para usar o chat + rate limit por IP no proxy (C16).
- **FR-DF8.8** Disclaimer permanente no painel do chat: assistente pode errar; não
  substitui o regulamento oficial nem a inspeção técnica; conferir sempre o PDF.
  Mesmo tom do aviso legal existente da landing.
- **FR-DF8.9** Falha do gateway (timeout, 5xx, orçamento esgotado) degrada com mensagem
  clara e opção de tentar de novo; nunca quebra o restante do portal.
- **FR-DF8.10** Aviso de transparência (art. 9 LGPD) na primeira utilização, com
  **aceite registrado** (trilha append-only): informa que o conteúdo digitado é
  processado por provedor de IA fora do Brasil (transferência internacional com
  salvaguarda nomeada — cláusulas contratuais/DPA) e recomenda não incluir dados
  pessoais. **Base legal = execução de contrato (art. 7º, V)** da funcionalidade que o
  usuário aciona voluntariamente — **não** é consentimento de finalidade opcional
  (revisão C9: consentimento condicionado não é livre e a revogação quebraria a
  feature de forma incoerente). Refletir a base legal no contrato ODCS.

## 5. Dados e contratos

- **Sem persistência de conversas** na v1 (nem no portal nem no gateway).
- Nova tabela `assistant_usage` (contador diário): `user_id`, `day`, `count`.
  Novo contrato ODCS com classificação (user_id = pseudônimo, base legal execução de
  contrato p/ operação de quota; retenção curta, ex.: 90 dias).
- Aceite do aviso de transparência registrado na trilha append-only existente
  (export LGPD já cobre); é registro de ciência, não consentimento revogável (C9).
- Requisição ao gateway carrega **id opaco de rate-limit**:
  `rateKey = HMAC(sal com rotação diária, user_id)` (C10) — pseudonimização, não
  anonimização; o gateway nunca recebe e-mail, nome ou user_id real, e seus logs
  entram no registro de operações art. 37 com retenção 30 dias.

## 6. Módulos afetados (portal)

| Módulo                        | Mudança                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `apps/api` (novo entrypoint)  | Lambda `assistant` própria (Function URL `RESPONSE_STREAM`, fora do API GW): JWT via JWKS, quota, zod, cliente SigV4 do gateway, SSE pass-through |
| `infra/` (portal)             | behavior `/api/v1/assistant/*` no CloudFront + Function URL + header secreto CF→origin + ADR do padrão (C1/C2) |
| `apps/api/migrations`         | `000X_assistant.sql`: tabela `assistant_usage` + RLS                     |
| `contracts/`                  | contrato ODCS `assistant_usage`                                          |
| `apps/web` (novo)             | `Assistant.tsx` (chat), store zustand da conversa, parser SSE            |
| `apps/web/Landing.tsx`        | entrada secundária p/ o assistente                                       |
| `apps/web` checklist          | ação "perguntar ao assistente" por item                                  |
| `SessionPanels`/consents      | finalidade opcional "assistente de IA"                                   |

## 7. UI/UX

- Layout de chat convencional: mensagens alternadas, input multiline (Enter envia,
  Shift+Enter quebra linha), indicador de streaming, botão parar.
- Chips de citação ao fim de cada resposta do assistente; disclaimer fixo no rodapé do
  painel.
- Quando aberto a partir de uma infração, a primeira mensagem já aparece preenchida e
  editável antes de enviar.
- Contador discreto de quota restante do dia (free).
- Acessível: foco gerenciado, `aria-live` no streaming, Esc fecha painel (alinha com o
  quick win pendente de modais).

## 8. Critérios de aceite

| #        | Critério                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| AC-DF8.1 | Pergunta sobre regra fora do B6 (ex.: freios) responde com citação de seção/página corretas conferíveis no PDF     |
| AC-DF8.2 | Estourar a quota free retorna 429 RFC 9457 e a UI mostra mensagem com horário de renovação                          |
| AC-DF8.3 | Resposta chega em streaming visível (primeiro token < poucos segundos; sem esperar a resposta inteira)             |
| AC-DF8.4 | Nenhuma credencial do gateway aparece no bundle, no network do browser ou em variável exposta ao Vite               |
| AC-DF8.5 | "Perguntar ao assistente" numa infração inclui id da regra + medida/limite no prompt pré-preenchido                 |
| AC-DF8.6 | Com o gateway fora do ar, o chat mostra erro amigável e o resto do portal segue funcionando                         |
| AC-DF8.7 | Primeira utilização exibe o aviso de transparência e registra o aceite; sem aceite o chat não envia, e o restante do portal segue utilizável |

## 9. Riscos e questões em aberto

- **Alucinação:** mitigada por grounding com citações no gateway + disclaimer + evals
  (do lado do gateway); risco residual comunicado ao usuário. O portal nunca apresenta a
  resposta como veredito de conformidade — só o motor determinístico faz isso.
- **Copyright:** citações limitadas a id/página/trecho curto; política de paráfrase é
  guardrail do gateway, mas a UI também não deve formatar respostas como reprodução do
  texto oficial.
- **Persistência de histórico** (retomar conversa em outro dia): adiada; se entrar,
  vira dado pessoal com contrato ODCS, retenção e export/erasure próprios.
- **Anônimos:** v1 exige login (controle de custo/abuso). Reavaliar quota mínima
  anônima como funil, com proteção anti-abuso, depois de medir custo real.
- **Feedback 👍/👎 por resposta** (insumo p/ evals do gateway): desejável, mas cria
  telemetria — decidir junto com a finalidade opcional de analytics.

## 10. Plano de implementação (quando aprovada)

1. Infra do proxy (C1/C2): Lambda `assistant` c/ Function URL `RESPONSE_STREAM`,
   behavior no CloudFront do portal, header secreto CF→origin, ADR do padrão.
2. Contrato ODCS `assistant_usage` + migração + lógica de quota/JWT/zod na Lambda com
   gateway mockado (testes de quota atômica, validação, SSE pass-through, heartbeat).
3. UI do chat + store + parser SSE contra o mock.
4. Aviso de transparência com aceite registrado (C9).
5. Integração com o gateway real em staging (contrato versionado `/v1`, SigV4).
6. Ação "perguntar ao assistente" no checklist.
7. Promover a US/FR em `spec.md`; atualizar threat model — nova seção "AI Gateway"
   STRIDE antes do go-live (C16).
