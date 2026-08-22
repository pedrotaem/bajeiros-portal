# Infra (Terraform)

Stack: S3 privado (OAC) + CloudFront (PriceClass_All) + ACM + Route53 + IAM OIDC p/ GitHub Actions. Região: `us-east-1` (exigência do ACM p/ CloudFront).

## Estrutura

- `modules/static-site/` — módulo reutilizável (bucket, distro, headers, cert, DNS, role de deploy)
- `envs/global/` — hosted zone + OIDC provider (aplicar 1×, primeiro)
- `envs/staging/` — staging.bajeiros.com.br (noindex, CSP report-only)
- `envs/prod/` — bajeiros.com.br + www (alarme 5xx)

## Bootstrap (manual, uma única vez)

> ⚠️ **Antes de qualquer apply** (revisão v2, C1/C17): criar AWS Organizations com contas separadas `staging` e `prod` (+ `management`). Distribuição CloudFront não migra entre contas — provisionar já no lugar certo. O bootstrap abaixo (bucket tfstate) e cada env rodam na conta correspondente. Ajuste decorrente pendente nos backends: 1 bucket de state por conta (`bajeiros-tfstate-staging`/`-prod`) e zona Route53 no env `global` da conta prod, com o env staging referenciando a zona via variável (o `terraform_remote_state` atual assume bucket único).

Com credenciais admin (SSO) na conta:

```bash
aws s3api create-bucket --bucket bajeiros-tfstate --region us-east-1
aws s3api put-bucket-versioning --bucket bajeiros-tfstate \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket bajeiros-tfstate \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Lock de state: nativo do S3 (`use_lockfile = true`, Terraform ≥ 1.10) — sem DynamoDB.

## Ordem de apply (fase 1: manual, local — decisão D3 da revisão)

```bash
cd infra/envs/global  && terraform init && terraform apply
# anotar outputs: name_servers (→ Registro.br), oidc_provider_arn
cd ../staging         && terraform init && terraform apply
cd ../prod            && terraform init && terraform apply
```

Depois de cada env: copiar outputs (`bucket_name`, `distribution_id`, `deploy_role_arn`) p/ as **variables dos environments** `staging`/`production` no GitHub (`SITE_BUCKET`, `CF_DISTRIBUTION_ID`, `AWS_DEPLOY_ROLE_ARN`).

⚠️ A validação do ACM só conclui depois que os NS da zona estiverem ativos no Registro.br. Sequência real: apply global → apontar NS no Registro.br → aguardar propagação → apply staging/prod.

⚠️ SNS `bajeiros-prod-alerts`: criar subscription de e-mail manualmente (`aws sns subscribe ... --protocol email`) — subscription exige confirmação por e-mail, não versionável.

## Pendências registradas (da revisão)

- WAF adiado (decisão consciente, fase 1).
- Contas AWS separadas staging/prod: **obrigatório antes da fase 2** (auth/dados).
- Apply via pipeline com gate: evolução (dissenso D3 registrado).
- `csp_enforce = true` em prod só após report-only limpo no staging.
