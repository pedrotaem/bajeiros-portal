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
