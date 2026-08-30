# Runbook — Portal Bajeiros

## Deploy normal

1. PR → CI verde (gitleaks, lint, format, typecheck, test, build) → merge em `main`.
2. `deploy.yml` roda: build único → staging automático → smoke test.
3. Validar staging manualmente (https://staging.bajeiros.com.br).
4. Aprovar o environment `production` no GitHub (Actions → run → Review deployments).
5. Mesmo artefato vai p/ prod → smoke test automático.
6. Tag de release: `git tag vX.Y.Z && git push --tags` (C9 da revisão).

## API (fase 11) — operação

- **Cold start + resume do Aurora (0 ACU)**: primeira request após inatividade leva **15–20s** (resume ~15s + cold da Lambda). O driver tem retry interno e o timeout é 28s; o smoke do deploy usa `--retry-all-errors`. Não é incidente — é o custo do 0 ACU.
- **Migração**: roda automaticamente no deploy (`migrate.bundle.mjs`, secret MASTER), ANTES de publicar a Lambda. Manual (emergência):

```bash
AWS_REGION=sa-east-1 \
DB_CLUSTER_ARN=... DB_MASTER_SECRET_ARN=... DB_APP_SECRET_ARN=... \
node apps/api/dist/lambda/migrate.bundle.mjs --dir apps/api/migrations
# (gerar o bundle antes: npm run build:lambda -w @bajeiros/api)
```

- **Rollback da Lambda**: baixar o artifact `lambda-<SHA-anterior>` do run verde anterior (retenção 30d) e republicar:

```bash
aws lambda update-function-code --function-name bajeiros-<env>-api \
  --zip-file fileb://lambda.zip --publish --region sa-east-1
```

Migrações são forward-only — rollback de código não desfaz migração; se a migração for o problema, corrigir com NOVA migração.

- **Budget**: US$ 40/mês por conta (alertas 50/80/100% + forecast → e-mail). Estourou: Cost Explorer por serviço; suspeitos usuais = Aurora fora do auto-pause (ver `ServerlessDatabaseCapacity` no CloudWatch) e tráfego CloudFront.

## Entrar com Google (DF-17) — habilitar num ambiente

Feito uma vez por ambiente (staging primeiro, prod só depois dos cenários manuais da spec §9).
As credenciais OAuth do Google não têm provider Terraform — este passo é manual de propósito.

1. **Google Cloud Console**, projeto por ambiente (`bajeiros-staging`, `bajeiros-prod`):
   - Tela de consentimento OAuth: tipo **External**, nome "Bajeiros", e-mail de suporte, link da política de privacidade.
   - Escopos: apenas `openid`, `email`, `profile` (não sensíveis → sem revisão do Google).
   - Domínios autorizados: `amazoncognito.com` **e** `bajeiros.com.br`.
   - Credenciais → **OAuth client ID** → **Web application**:
     - JavaScript origin: valor do output `auth.auth_domain_url`;
     - Redirect URI: valor do output `auth.google_redirect_uri` — **copiar, não digitar** (barra final/esquema errados dão `redirect_uri_mismatch`).
   - **Publicar** a tela de consentimento. Em _Testing_ só os test users listados conseguem entrar.
2. **Terraform** (as credenciais nunca entram em `.tfvars` versionado):

```bash
cd infra/envs/staging
TF_VAR_google_enabled=true \
TF_VAR_google_client_id='...apps.googleusercontent.com' \
TF_VAR_google_client_secret='GOCSPX-...' \
terraform apply
```

3. **GitHub → repo → Settings → Variables** do ambiente:
   - `LAMBDA_IDP_LINK_FUNCTION_NAME` = output `auth.idp_link_function_name` (sem ela o deploy não publica a trigger e a Lambda fica no stub, que não vincula);
   - `COGNITO_PROVIDERS` = `["google"]` (é o que faz o botão aparecer no SPA).
4. Rodar o deploy (ou `workflow_dispatch`) para publicar o código da trigger e o `config.json` novo.
5. Conferir os 4 cenários manuais da spec (§9, AC-9…AC-13). Log das decisões da vinculação:

```bash
aws logs tail /aws/lambda/bajeiros-<env>-idp-link --follow --region sa-east-1
# uma linha JSON por login federado: {"trigger":"pre-sign-up","decision":"linked",...}
# `decision` != linked explica por que não vinculou; e-mail sai só como hash (emailTag)
```

**Desligar / reverter:** `TF_VAR_google_enabled=false terraform apply` + limpar `COGNITO_PROVIDERS`.
Some o botão, o IdP e a trigger. Contas já vinculadas continuam funcionando pelo caminho
e-mail+senha — nada no banco depende da vinculação.

**Rotação do client secret:** gerar novo no Google Console, `terraform apply` com o
`TF_VAR_google_client_secret` novo, invalidar o antigo no Google.

## Rollback

**Opção A (preferida):** `git revert` do commit ruim em `main` → pipeline redeploya a versão anterior. Tempo: ~5 min.

**Opção B (pipeline quebrado):** restaurar objetos no S3 via versionamento:

```bash
# listar versões do index
aws s3api list-object-versions --bucket bajeiros-prod-site --prefix index.html
# restaurar versão anterior (copia versão antiga por cima)
aws s3api copy-object --bucket bajeiros-prod-site --key index.html \
  --copy-source "bajeiros-prod-site/index.html?versionId=VERSION_ID"
aws cloudfront create-invalidation --distribution-id DISTRO_ID --paths "/index.html" "/"
```

Assets antigos hasheados podem ter sido removidos pelo `--delete` — se a opção B falhar por asset ausente, use a opção A.

**Testar rollback 1× antes do go-live (C8).**

## Invalidation manual

```bash
aws cloudfront create-invalidation --distribution-id DISTRO_ID --paths "/index.html" "/"
```

## Incidentes

- Alarme 5xx (SNS → e-mail): verificar status AWS (health.aws.amazon.com), depois últimos deploys.
- Site fora do ar mas CloudFront ok: verificar DNS (Registro.br NS → Route53).
- CSP quebrando feature: header é Report-Only até promover; se enforce quebrou, `csp_enforce = false` no env + apply.

## Custos esperados

~US$ 1–5/mês (CloudFront + S3 + Route53 US$ 0,50/zona). Budget US$ 20 c/ alertas actual+forecast. Revisão mensal no Cost Explorer.

## Cadência operacional

- Dependabot PRs: semanal.
- securityheaders.com re-scan: trimestral.
- Revisão de custo: mensal.
