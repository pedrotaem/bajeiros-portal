# Revisão do Plano de Produção — Portal Bajeiros

**Data:** 2026-08-22 · **Documento revisado:** `docs/plano-producao.md` v1.0
**Método:** revisão independente por 3 personas (Arquiteto de Software Sênior, Especialista DevOps/Infra, Especialista em Cibersegurança — todas 10+ anos), veredito por fase e por decisão-chave, seguido de consolidação de consenso.

---

## Sumário executivo

O plano é **sólido e bem dimensionado** para o problema: SPA estática em S3+CloudFront com OIDC é a arquitetura correta, e o plano evita over-engineering nos pontos certos (WAF adiado, conta única, apply manual). As 3 personas **aprovam a arquitetura geral sem objeção**.

Foram encontrados: **1 erro técnico factual** (PriceClass_200 não cobre América do Sul — o passo 5.4 como escrito não entrega POP em São Paulo), **3 lacunas de pipeline** (build único promovido entre ambientes; ordem de upload de assets vs `index.html`; validação de IaC no CI) e **2 refinamentos de segurança** (CSP em modo Report-Only antes de enforce; trust policy OIDC por environment, não por branch). Nenhuma objeção estrutural.

**14 mudanças unânimes** (lista na seção Consenso) e **4 divergências abertas** para decisão do usuário (visibilidade do repo, proteção de acesso ao staging, apply do Terraform via pipeline, `--ignore-scripts` no npm).

---

## Revisão por fase

### Fase 0 — Pré-requisitos

| Persona   | Veredito            | Justificativa                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Escopo mínimo correto; decisão de visibilidade registrada como risco é a postura certa.                                                                                                                                                                                                                         |
| DevOps    | APROVA COM RESSALVA | 0.2: usar **AWS Budgets** (não só billing alarm CloudWatch, que exige us-east-1 e métrica com lag). Adicionar orçamento também de _forecast_. IAM Identity Center correto.                                                                                                                                      |
| Segurança | APROVA COM RESSALVA | 0.1 ok (MFA root, sem keys). 0.5: a análise está factualmente correta — CodeQL e push protection de secret scanning em repo **privado pessoal** exigem produto pago (GitHub Code Security/Secret Protection); em público são grátis. Minha posição: isso pesa a favor de repo **público** (ver Divergência D1). |

### Fase 1 — Higiene do repositório

| Persona   | Veredito            | Justificativa                                                                                                                                                                                                                                                                                            |
| --------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Repo = `portal/` é a decisão certa: exclui material de terceiros, e o futuro monorepo (fase 2, backend) pode nascer de subdiretórios dentro do mesmo repo. LICENSE: registrar decisão explícita mesmo privado.                                                                                           |
| DevOps    | APROVA              | `.nvmrc` + `npm ci` corretos. Node 22 LTS ok (Node 24 LTS também é opção válida em 2026; irrelevante para Vite 5 — anotar e seguir).                                                                                                                                                                     |
| Segurança | APROVA COM RESSALVA | 1.3 (auditoria pré-commit) não pode ser só manual: rodar **gitleaks** (ou trufflehog) na árvore antes do 1º commit e depois como job de CI. Risco legal do texto do regulamento: além de grep por trechos literais, registrar no README que as regras são paráfrase — mitigação já prevista, formalizar. |

### Fase 2 — Qualidade de código

| Persona   | Veredito | Justificativa                                                                                                                 |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA   | Ferramental padrão, sem excesso. Cobertura sem gate rígido é maduro para o estágio.                                           |
| DevOps    | APROVA   | Scripts nomeados = passos de CI legíveis.                                                                                     |
| Segurança | APROVA   | 2.5 (disclaimer como pré-requisito de go-live) é o controle de risco legal mais importante do plano — manter como bloqueante. |

### Fase 3 — GitHub

| Persona   | Veredito            | Justificativa                                                                                                                                                                                           |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Rulesets > branch protection clássico, correto. CODEOWNERS adiado ok.                                                                                                                                   |
| DevOps    | APROVA COM RESSALVA | 3.6: environments com required reviewer só têm efeito pleno se a trust policy OIDC (6.1) referenciar o **environment** — casar as duas fases (ver mudança C5).                                          |
| Segurança | APROVA COM RESSALVA | 3.3/3.4 dependem da decisão privado/público (D1). Se ficar privado: rodar gitleaks como job de CI substitui parcialmente secret scanning; CodeQL fica como pendência registrada — aceitável, não ideal. |

### Fase 4 — CI

| Persona   | Veredito            | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Pipeline mínimo completo.                                                                                                                                                                                                                                                                                                                                                                                           |
| DevOps    | APROVA COM RESSALVA | Falta CI da infra: `terraform fmt -check` + `terraform validate` + scanner (trivy config ou checkov) no PR. Sem isso o diretório `infra/` fica fora do gate.                                                                                                                                                                                                                                                        |
| Segurança | APROVA COM RESSALVA | 4.2 (SHA-pinned, permissions read, concurrency) é estado da arte — Dependabot para github-actions atualiza SHAs pinados, então não há custo de manutenção. Adicionar: `npm ci --ignore-scripts` para mitigar postinstall malicioso (ver Divergência D4 — pode quebrar builds; testar). 4.3 npm audit não-bloqueante: aceito **desde que** alertas do Dependabot sejam triados semanalmente (cadência 9.2 já cobre). |

### Fase 5 — Infra AWS

| Persona   | Veredito                           | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA                             | Módulo + 2 envs é a estrutura certa; contas separadas adiadas ok **desde que** revisitado antes da fase 2 (quando entrar auth/dados de usuário). Terraform > CDK aqui: fase 2 usa Supabase (fora da AWS) e Terraform tem provider p/ isso — ponto a favor da escolha.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DevOps    | **OBJETA (5.4)** / APROVA restante | **Erro factual: PriceClass_200 NÃO inclui América do Sul.** POPs de São Paulo/Rio só entram em **PriceClass_All**. Como escrito ("All ou 200 p/ ter POP em São Paulo"), escolher 200 deixaria usuários BR sendo servidos de Miami (~100–150ms extra). Correção: **PriceClass_All** — o custo extra para o volume esperado é de centavos. 5.1 correto: lock nativo S3 (`use_lockfile`) existe desde Terraform 1.10, dispensa DynamoDB. 5.3 OAC correto (bucket policy com principal `cloudfront.amazonaws.com` + condição `AWS:SourceArn`). 5.4 SPA fallback 403→`/index.html` 200 é o padrão com OAC (S3 REST retorna 403 p/ chave inexistente sem `s3:ListBucket`); ciente de que mascara 403 reais — aceitável p/ SPA de rota única. 5.6/5.7 corretos (ACM us-east-1; CAA). |
| Segurança | APROVA COM RESSALVA                | 5.5: **não ativar CSP direto em enforce.** Publicar primeiro como `Content-Security-Policy-Report-Only` no staging, validar console, depois promover. three.js/R3F: se entrarem decoders WASM (draco/meshopt via drei), CSP precisará de `'wasm-unsafe-eval'` em `script-src` — hoje o app não carrega GLTF, então começar sem e documentar o gatilho. HSTS: começar **sem** `preload` (2 anos + preload é quase irreversível); adicionar preload só após semanas estáveis. 5.9 WAF adiado: **concordo** para site estático sem backend — Shield Standard cobre L3/L4; reavaliar obrigatoriamente na fase 2 (auth). 5.10 ok. DNSSEC (Registro.br + Route53 KMS): opcional, não bloquear go-live — complexidade operacional real.                                              |

### Fase 6 — CD

| Persona   | Veredito            | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA COM RESSALVA | 6.3: o artefato implantado em prod deve ser **o mesmo** validado em staging — build único no CI, promovido. Rebuild entre ambientes quebra a garantia "o que testei é o que lancei".                                                                                                                                                                                                                                                                                                         |
| DevOps    | APROVA COM RESSALVA | Mesmo ponto do build único. 6.4: **ordem de upload importa** — subir `/assets/*` primeiro e `index.html` por último; senão há janela em que o index novo referencia bundle ainda ausente. `--delete` imediato + usuário com index antigo em cache = 404 de chunk; mitigar mantendo assets antigos por janela de graça (ou aceitando, já que `index.html` é `no-cache` e invalidado — risco baixo, mas documentar). 6.6: testar rollback antes do go-live — promover a item do checklist 8.1. |
| Segurança | APROVA COM RESSALVA | 6.1: trust policy deve usar claim `sub` com **environment** (`repo:owner/bajeiros-portal:environment:production`), não branch — branch protection não impede workflow de outra branch assumir role se a condição for só `ref`. 6.2 least privilege correto. 6.5 apply manual: aceito fase 1 (ver D3).                                                                                                                                                                                        |

### Fase 7 — Observabilidade

| Persona   | Veredito            | Justificativa                                                                                                                                                    |
| --------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Adiar RUM/analytics com decisão registrada é o certo p/ MVP sem coleta de dados.                                                                                 |
| DevOps    | APROVA COM RESSALVA | Alarme 5xx em CloudFront de site estático quase nunca dispara (bom); adicionar alarme de **anomalia de requests** (custo/abuso) é barato e útil. UptimeRobot ok. |
| Segurança | APROVA              | Sem coleta = sem superfície LGPD na fase 1. Quando entrar analytics, cookieless (Plausible/logs) mantém isso — plano já registra.                                |

### Fase 8 — Go-live

| Persona   | Veredito            | Justificativa                                                                                                                                                                                   |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA              | Checklist cobre o essencial do produto (fluxos manuais nomeados).                                                                                                                               |
| DevOps    | APROVA COM RESSALVA | 8.2: fazer o cutover de NS **com a stack já validada via URL da distro CloudFront** (`d123.cloudfront.net`) — DNS é o último passo, não simultâneo. Adicionar teste de rollback (vindo de 6.6). |
| Segurança | APROVA              | securityheaders.com nota A + CSP sem violação como critério objetivo — bom.                                                                                                                     |

### Fase 9 — Pós-lançamento

| Persona   | Veredito            | Justificativa                                                                                                 |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Arquiteto | APROVA COM RESSALVA | Adicionar: **tag git por release de produção** (rastreabilidade do que está no ar + rollback por referência). |
| DevOps    | APROVA              | Runbook + cadência mensal de custo adequados.                                                                 |
| Segurança | APROVA              | Lista de evolução honesta (pendências conscientes registradas, não escondidas).                               |

---

## Revisão das decisões-chave

| #   | Decisão                   | Arquiteto                                                                         | DevOps                                                                                 | Segurança                                                                                                         | Resultado                                        |
| --- | ------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Repo privado vs público   | RESSALVA — privado agora, abrir cedo (comunidade é ativo do projeto)              | APROVA privado (indiferente tecnicamente)                                              | **OBJETA** — público desde já: CodeQL + push protection grátis; obscuridade do código não é controle de segurança | **Divergência D1**                               |
| 2   | Terraform vs CDK          | APROVA Terraform (Supabase na fase 2 tem provider Terraform; CDK amarraria à AWS) | APROVA Terraform                                                                       | APROVA (tooling de scan maduro: trivy/checkov)                                                                    | Unânime: manter Terraform                        |
| 3   | Conta AWS única           | RESSALVA — obrigatório revisitar antes da fase 2                                  | APROVA fase 1                                                                          | RESSALVA — idem arquiteto                                                                                         | Unânime c/ condição (mudança C7)                 |
| 4   | WAF adiado                | APROVA                                                                            | APROVA (custo sem benefício p/ estático)                                               | RESSALVA — reavaliar na fase 2                                                                                    | Unânime: manter adiado                           |
| 5   | Apply manual do Terraform | APROVA fase 1                                                                     | RESSALVA — plan no PR + apply via pipeline com environment gate é pouco esforço a mais | APROVA fase 1 (menor blast radius)                                                                                | **Divergência D3**                               |
| 6   | CSP com three.js          | APROVA c/ validação staging                                                       | APROVA                                                                                 | RESSALVA — Report-Only primeiro (mudança C2)                                                                      | Unânime c/ ajuste                                |
| 7   | Sem analytics/RUM         | APROVA p/ MVP                                                                     | APROVA                                                                                 | APROVA (LGPD)                                                                                                     | Unânime: manter                                  |
| 8   | PriceClass                | (defere ao DevOps)                                                                | **OBJETA** — 200 não cobre América do Sul; usar **All**                                | (sem posição)                                                                                                     | Unânime: corrigir p/ PriceClass_All (mudança C1) |

---

## CONSENSO

### (a) Edições no documento do plano — unânimes

1. **C1 — Corrigir 5.4:** PriceClass_200 não inclui América do Sul; POP em São Paulo exige **PriceClass_All**. Fixar PriceClass_All.
2. **C2 — Ajustar 5.5:** CSP entra primeiro como `Content-Security-Policy-Report-Only` (staging), promove a enforce após validação; documentar gatilho `'wasm-unsafe-eval'` (se decoders WASM entrarem). HSTS **sem** `preload` no lançamento.
3. **C3 — Ajustar 6.3/6.4:** build **único** no CI, mesmo artefato promovido staging→prod (sem rebuild); ordem de upload: assets hasheados primeiro, `index.html` por último; documentar trade-off do `--delete` (janela de graça ou aceitar risco com index `no-cache`).
4. **C4 — Ampliar 4.x:** CI da infra — `terraform fmt -check`, `terraform validate` e scanner de IaC (trivy/checkov) em PRs que tocam `infra/`.
5. **C5 — Ajustar 6.1:** trust policy OIDC condicionada por **environment** (`repo:…:environment:production` / `:environment:staging`), casando com 3.6.
6. **C6 — Formalizar 1.3:** auditoria pré-commit com **gitleaks** (árvore completa antes do 1º commit) + gitleaks como job de CI permanente.
7. **C7 — Anotar 5.2:** contas AWS separadas deixam de ser opcionais **antes da fase 2** (auth/dados de usuário).
8. **C8 — Ampliar 8.1:** incluir no checklist de go-live: teste de rollback executado; validação completa via URL CloudFront **antes** do cutover de NS.
9. **C9 — Ampliar 9.1:** tag git por release de produção.
10. **C10 — Ajustar 0.2:** usar AWS Budgets (actual + forecast) como mecanismo primário de alerta de custo.

### (b) Ações de implementação — unânimes (executáveis no repo agora)

11. **C11 —** `git init` em `portal/` + `.gitignore` + `.nvmrc` + `.editorconfig` + `README.md` (com disclaimer e nota de paráfrase do regulamento) + `SECURITY.md`; rodar gitleaks antes do 1º commit.
12. **C12 —** ESLint (flat config + typescript-eslint + react-hooks) + Prettier + scripts `lint`/`format:check`/`typecheck`.
13. **C13 —** Workflows: `ci.yml` (hardened: `permissions: contents: read`, SHA-pinned, concurrency, `npm ci`, lint→format→typecheck→test→build c/ artefato) + `dependabot.yml` (npm + github-actions weekly) + job gitleaks + job de validação Terraform.
14. **C14 —** Terraform `infra/` completo (módulo static-site: S3 privado versionado + OAC + CloudFront PriceClass_All + Response Headers Policy com CSP Report-Only + ACM + Route53 + logs; envs staging/prod; doc de bootstrap do state) + `deploy.yml` (OIDC por environment, build único promovido, sync ordenado, invalidation mínima, smoke tests, gate de prod) + `docs/runbook.md` + disclaimer no rodapé da UI (passo 2.5).

### Divergências abertas — decisão do usuário

- **D1 — Visibilidade do repo.** Segurança: **público** desde já (CodeQL + secret push protection grátis; código não é segredo, regras são paráfrase). Arquiteto: privado no lançamento, abrir nos primeiros meses (controle de narrativa da marca). DevOps: indiferente. _Consequência prática: se privado, 3.3/3.4 viram gitleaks-em-CI + pendência registrada._
- **D2 — Proteção de acesso ao staging.** Segurança: basic-auth via CloudFront Function (staging não deve ser público). DevOps: `X-Robots-Tag: noindex` + URL não divulgada bastam p/ conteúdo idêntico ao prod. Arquiteto: neutro, levemente pró-noindex (menos fricção).
- **D3 — Apply do Terraform.** DevOps: plan no PR + apply via pipeline com gate desde o início. Arquiteto + Segurança: apply manual na fase 1 (menor blast radius de credencial CI), pipeline na evolução. _2×1 pelo manual — mantido o plano, registrado o dissenso._
- **D4 — `npm ci --ignore-scripts` no CI.** Segurança: adotar (mitiga postinstall malicioso — vetor real em ataques npm recentes). DevOps: testar antes — pode quebrar dependências que dependem de postinstall; adotar somente se o build passar. Arquiteto: acompanha DevOps. _Encaminhamento sugerido: testar no CI; se verde, adotar._
