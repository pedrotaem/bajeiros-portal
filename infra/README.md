# Infra (Terraform)

Stack: S3 privado (OAC) + CloudFront (PriceClass_All) + ACM + Route53 + IAM OIDC p/ GitHub Actions. Região: `us-east-1` (exigência do ACM p/ CloudFront).

## Contas (AWS Organizations — C1/C17 da revisão v2)

- `bajeiros-staging` **853617423060** — env `staging` (zona delegada staging.bajeiros.com.br + OIDC próprio)
- `bajeiros-prod` **035842308271** — envs `global` (zona pai + OIDC) e `prod`
- management `786795697763` — só Org/billing/Identity Center, sem workloads

Credenciais via IAM Identity Center: profiles CLI `bajeiros-staging` e `bajeiros-prod` (`aws sso login --profile ...`). Cada env roda com `AWS_PROFILE` da conta correspondente (backend e provider usam a mesma credencial).

## Estrutura

- `modules/static-site/` — módulo reutilizável (bucket, distro, headers, cert, DNS, role de deploy)
- `envs/global/` — conta **prod**: hosted zone pai + delegação NS do staging + OIDC provider (aplicar 1×, primeiro)
- `envs/staging/` — conta **staging**: zona delegada + OIDC próprio + staging.bajeiros.com.br (noindex, CSP report-only)
- `envs/prod/` — conta **prod**: bajeiros.com.br + www (alarme 5xx)

## Bootstrap (manual, uma única vez, por conta)

1 bucket de tfstate por conta:

```bash
# AWS_PROFILE=bajeiros-prod → bucket bajeiros-tfstate-prod
# AWS_PROFILE=bajeiros-staging → bucket bajeiros-tfstate-staging
aws s3api create-bucket --bucket bajeiros-tfstate-<env> --region us-east-1
aws s3api put-bucket-versioning --bucket bajeiros-tfstate-<env> \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket bajeiros-tfstate-<env> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Lock de state: nativo do S3 (`use_lockfile = true`, Terraform ≥ 1.10) — sem DynamoDB.

## Ordem de apply (fase 1: manual, local — decisão D3 da revisão)

```bash
export AWS_PROFILE=bajeiros-prod
cd infra/envs/global  && terraform init && terraform apply
# anotar outputs: name_servers (→ Registro.br), oidc_provider_arn

# zona delegada do staging primeiro (só a zona), p/ obter os NS dela:
export AWS_PROFILE=bajeiros-staging
cd ../staging && terraform init
terraform apply -target=aws_route53_zone.staging
# copiar output name_servers → re-aplicar global com a delegação:
AWS_PROFILE=bajeiros-prod terraform -chdir=../global apply \
  -var 'staging_zone_name_servers=[...]'

# com NS no Registro.br ativos + delegação criada, applies completos:
terraform apply                       # staging (valida cert via zona delegada)
export AWS_PROFILE=bajeiros-prod
cd ../prod && terraform init && terraform apply
```

Depois de cada env: copiar outputs (`bucket_name`, `distribution_id`, `deploy_role_arn`) p/ as **variables dos environments** `staging`/`production` no GitHub (`SITE_BUCKET`, `CF_DISTRIBUTION_ID`, `AWS_DEPLOY_ROLE_ARN`).

⚠️ A validação do ACM só conclui depois que os NS da zona estiverem ativos no Registro.br. Sequência real: apply global → apontar NS no Registro.br → aguardar propagação → apply staging/prod.

⚠️ SNS `bajeiros-prod-alerts`: criar subscription de e-mail manualmente (`aws sns subscribe ... --protocol email`) — subscription exige confirmação por e-mail, não versionável.

## Pendências registradas (da revisão)

- WAF adiado (decisão consciente, fase 1).
- Contas AWS separadas staging/prod: **obrigatório antes da fase 2** (auth/dados).
- Apply via pipeline com gate: evolução (dissenso D3 registrado).
- `csp_enforce = true` em prod só após report-only limpo no staging.
