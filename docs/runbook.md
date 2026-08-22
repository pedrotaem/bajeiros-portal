# Runbook — Portal Bajeiros

## Deploy normal

1. PR → CI verde (gitleaks, lint, format, typecheck, test, build) → merge em `main`.
2. `deploy.yml` roda: build único → staging automático → smoke test.
3. Validar staging manualmente (https://staging.bajeiros.com.br).
4. Aprovar o environment `production` no GitHub (Actions → run → Review deployments).
5. Mesmo artefato vai p/ prod → smoke test automático.
6. Tag de release: `git tag vX.Y.Z && git push --tags` (C9 da revisão).

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
