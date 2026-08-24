# Revisão — Assistente de Regras (DF-8) + Bajeiros AI Gateway — 3 Personas

**Data:** 2026-08-23 · **Documentos revisados:** `specs/drafts/df8-assistente-regras.md` (v0.1) e `ai-gateway/specs/spec.md` (v0.1)
**Personas:** Arquiteto de Software Sênior (ARQ), Especialista DevOps/Infra (DEV), Especialista em Cibersegurança c/ competência LGPD (SEC) — todas 10+ anos, revisões independentes.

## Sumário executivo

A separação portal×gateway foi **aprovada por unanimidade**: interface/quotas/identidade no portal, IA (corpus, modelo, prompt, custo) atrás de contrato versionado, nenhuma credencial no browser. Três objeções estruturais convergiram:

1. **FR-DF8.6 como estava era inatendível (ARQ + DEV objetaram):** o `apps/api` vive atrás de API Gateway HTTP API, que **não suporta response streaming** — o proxy bufferizaria a resposta inteira e violaria AC-DF8.3. Correção: a rota do chat sai do API GW e vira **Lambda própria do portal com Function URL `RESPONSE_STREAM`**, plugada como behavior `/api/v1/assistant/*` no CloudFront **existente** do portal (mesmo domínio, sem CORS novo); essa Lambda valida o JWT do Cognito via JWKS ela mesma.
2. **CloudFront na frente do gateway era contradição (DEV objetou, ARQ/SEC ressalvaram):** com OAC quem assina SigV4 é o CloudFront — a autenticação do _portal_ evapora e voltaria um segredo estático. Com consumidor único dentro da AWS, CloudFront no gateway não agrega nada. Correção: **portal assina SigV4 direto na Function URL do gateway**; CloudFront/domínio só quando houver consumidor externo.
3. **Base legal errada (SEC objetou):** o processamento pela Anthropic é _necessário para a própria feature_ — não é finalidade opcional por consentimento (repetiria o erro corrigido na revisão v2/C2; consentimento condicionado não é livre e a revogação quebraria a feature). Correção: **execução de contrato (art. 7º, V) + aviso de transparência (art. 9) com aceite registrado** na primeira utilização.

Outras convergências: decisão **sem RAG vetorial** aprovada como acerto (corpus único pequeno; RAG seria over-engineering), mas com correção técnica — corpus JSON entra como documento _custom content_ (1 bloco por seção, mapeando citação→sectionId/página), pois `page_location` só existe para PDF; **custo por pergunta com cache miss domina a economia** (~US$ 0,30–0,60 no Opus × ~US$ 0,06–0,12 no Sonnet — tráfego esparso ≈ maioria miss no cache de 5 min); "1 requisição concorrente por rateKey" era inimplementável em Lambda stateless (vira best-effort + reserved concurrency como cap global); conta AWS dedicada foi rejeitada (stacks nos ambientes staging/prod existentes; dev solo). Repo separado confirmado — o repo do portal é **público**, e prompts/golden set não devem ser públicos.

## Vereditos (resumo por persona)

| Tema                                                    | ARQ                             | DEV                         | SEC                            |
| ------------------------------------------------------- | ------------------------------- | --------------------------- | ------------------------------ |
| Separação portal×gateway, contrato /v1, RFC 9457        | APROVA                          | APROVA                      | APROVA                         |
| Proxy SSE via `apps/api`/API GW (FR-DF8.6 original)     | **OBJETA**                      | **OBJETA**                  | —                              |
| CloudFront na frente do gateway (§6 original)           | RESSALVA                        | **OBJETA**                  | RESSALVA                       |
| Sem RAG; documento inteiro + citations + cache (ADR-G3) | RESSALVA (custo, page_location) | RESSALVA (custo cache miss) | —                              |
| Consentimento como base da feature (FR-DF8.10 original) | —                               | —                           | **OBJETA**                     |
| Concorrência por rateKey em memória (§5 original)       | RESSALVA                        | **OBJETA** (pontual)        | —                              |
| Conta AWS dedicada (ADR-G5)                             | RESSALVA (contra)               | RESSALVA (contra)           | —                              |
| Quota/abuso, rateKey, guardrails, evals, CI/repo        | APROVA                          | RESSALVA (operação)         | RESSALVA (S1–S8)               |
| Anthropic de sa-east-1; LGPD transferência              | —                               | APROVA                      | RESSALVA (salvaguarda art. 33) |

## Mudanças consolidadas (aplicadas aos specs)

| #   | Origem              | Mudança                                                                                                                                                                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | ARQ-A1, DEV-D2      | Rota do chat fora do API GW: Lambda `assistant` do portal c/ Function URL `RESPONSE_STREAM`, behavior `/api/v1/assistant/*` no CloudFront existente (CachingDisabled, repassa `Authorization`, não repassa `Host`, sem compressão); JWT validado na Lambda via JWKS |
| C2  | DEV-D3              | Decidir e registrar em ADR do portal: Function URL do proxy c/ `AWS_IAM`+OAC (browser não assina) **não serve**; usar AuthType `NONE` + JWT obrigatório + header secreto CloudFront→origin verificado na Lambda                                                     |
| C3  | DEV-D4              | Heartbeat SSE (`: ping` ~15 s) no gateway e no proxy; origin response timeout ≥ 60 s na behavior                                                                                                                                                                    |
| C4  | ARQ-A2, DEV-D1, SEC | Gateway sem CloudFront na v1; portal assina SigV4 direto na Function URL (`lambda:InvokeFunctionUrl`); URL via SSM/env por ambiente                                                                                                                                 |
| C5  | ARQ-A3, DEV-D5      | ADR-G5 decidido: stacks Terraform do gateway dentro das contas staging/prod existentes; gatilho de migração p/ conta própria = consumidor externo ou time separado                                                                                                  |
| C6  | ARQ-A4              | Corpus como documento _custom content_ (1 bloco por seção); mapeamento índice de citação→`sectionId`+página; sem depender de `page_location`                                                                                                                        |
| C7  | ARQ-A5, DEV-D6      | Concorrência por rateKey = best-effort por instância; enforcement real na quota do portal; reserved concurrency 5–10 na Lambda do gateway como cap global                                                                                                           |
| C8  | ARQ-A6, DEV-D7      | §7 do gateway ganha custo por pergunta sem cache (Opus ~US$ 0,30–0,60 × Sonnet ~US$ 0,06–0,12) e alternativa de cache TTL 1 h; modelo default → divergência D1                                                                                                      |
| C9  | SEC-S1              | FR-DF8.10/AC-DF8.7: base legal = execução de contrato; "aviso de primeira utilização com aceite registrado" (transparência), não consentimento revogável; refletir no contrato ODCS                                                                                 |
| C10 | SEC-S2              | `rateKey = HMAC(sal diário, user_id)` (rotação diária); logs do gateway entram no registro art. 37 c/ retenção 30 d                                                                                                                                                 |
| C11 | SEC-S3              | Limite agregado de citações/dia por rateKey + recusa padronizada a pedidos de transcrição; casos de exfiltração gradual e leak de system prompt no golden set                                                                                                       |
| C12 | SEC-S4              | `context` validado por schema tipado (ruleId regex, numéricos); nunca interpolado como instrução                                                                                                                                                                    |
| C13 | SEC-S5, DEV-D8      | Kill switch **automático** ao romper orçamento diário (alarme→flag) + override manual; métrica custom de custo (EMF) + AWS Budgets; alarmes errors/throttles; backoff 429/529 Anthropic; runbook de rotação da chave (duas chaves em sobreposição)                  |
| C14 | SEC-S6              | Teste de CI que falha se campo de conteúdo de mensagem aparecer no serializer de log; debug flag proibida com dados reais                                                                                                                                           |
| C15 | SEC-S7              | Checklist go-live G3: DPA Anthropic assinado, política de retenção da API verificada, transferência internacional registrada c/ salvaguarda nomeada (cláusulas contratuais, Res. CD/ANPD 19/2024) no aviso                                                          |
| C16 | SEC-S8              | E-mail verificado obrigatório antes do chat + rate por IP no proxy; nova seção "AI Gateway" (STRIDE) no threat model antes do G3                                                                                                                                    |
| C17 | ARQ-A7              | Incremento atômico de `assistant_usage` (UPDATE … RETURNING) **antes** de abrir o stream                                                                                                                                                                            |
| C18 | DEV-D9              | Terraform do gateway referencia OIDC provider existente via data source; bucket de corpus por ambiente c/ versionamento + block public access                                                                                                                       |
| C19 | ARQ                 | Golden set pode nascer c/ ~25 perguntas (alvo 50) p/ custo de eval controlado; eval sequencial p/ aproveitar cache                                                                                                                                                  |

## Divergências abertas (decisão do usuário)

- **D1 — Modelo default:** `claude-sonnet-5` (recomendação de ARQ e DEV: ~5–10× mais barato por pergunta fria; Opus opcional por env e comparado no eval) × `claude-opus-5` (qualidade máxima). Critério objetivo proposto: se Sonnet ≥ 90% no golden set, Sonnet fica.
- **D2 — Anthropic API direta × Bedrock (ADR-G2):** direta = features novas primeiro (citations/cache), mas exige DPA próprio + chave estática c/ runbook de rotação; Bedrock = credencial IAM (sem segredo estático), faturamento e LGPD sob o guarda-chuva AWS já registrado, ao custo de defasagem de features e verificação de disponibilidade regional. SEC recomenda decidir **antes do G1**; troca é barata agora (SDK isolado no gateway).
- **D3 — Produto:** valor da quota free (N msgs/dia); acesso anônimo como funil (v1 = não); feedback 👍/👎 por resposta (melhora evals, cria telemetria/finalidade extra — adiado por default).
- **D4 — Prioridade/sequência:** o gateway depende das contas AWS (C1 da revisão v2 — Organizations antes do 1º apply). Se DF-8 subir na fila, a criação das contas sobe junto; nada de provisionar em conta pessoal temporária.

**Confirmado (não é divergência):** repo separado `bajeiros-ai-gateway` privado — o repo do portal é público; prompts e golden set não devem ser públicos. Streaming fica na v1 (alternativa sem streaming violaria AC-DF8.3; descartada).
