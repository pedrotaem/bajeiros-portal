# Conta bajeiros-staging (853617423060). Aplicar com AWS_PROFILE=bajeiros-staging.
# Zona delegada staging.bajeiros.com.br: a conta staging não escreve na zona pai
# (conta prod), então tem zona própria + OIDC provider próprio.
# 1º apply: -target=aws_route53_zone.staging → copiar name_servers p/ o env global
# (variável staging_zone_name_servers) → re-aplicar global → apply completo aqui.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.70"
    }
  }
  backend "s3" {
    bucket       = "bajeiros-tfstate-staging"
    key          = "staging/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    profile      = "bajeiros-staging"
  }
}

provider "aws" {
  region  = "us-east-1" # ACM p/ CloudFront exige us-east-1
  profile = "bajeiros-staging"
}

# Cognito em sa-east-1 (ADR-008: dados pessoais no Brasil)
provider "aws" {
  alias   = "sa_east_1"
  region  = "sa-east-1"
  profile = "bajeiros-staging"
}

# Forma IMUTÁVEL do sub OIDC (owner@id/repo@id) — repos criados após 15/07/2026
# emitem só esse formato (changelog GitHub 2026-04-23). IDs: gh api repos/... .id
variable "github_repo" {
  type    = string
  default = "pedrotaem@29166147/bajeiros-portal@1342987014"
}

resource "aws_route53_zone" "staging" {
  name = "staging.bajeiros.com.br"
}

resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.staging.zone_id
  name    = "staging.bajeiros.com.br"
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"amazontrust.com\"",
    "0 issue \"awstrust.com\"",
    "0 issue \"amazonaws.com\"",
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

module "site" {
  source = "../../modules/static-site"

  name               = "bajeiros-staging"
  domain_name        = "staging.bajeiros.com.br"
  aliases            = ["staging.bajeiros.com.br"]
  zone_id            = aws_route53_zone.staging.zone_id
  oidc_provider_arn  = aws_iam_openid_connect_provider.github.arn
  github_repo        = var.github_repo
  github_environment = "staging"
  noindex            = true
  csp_enforce        = false # Report-Only até validar (C2)
  extra_connect_src  = [module.auth.auth_domain_url]
  api_origin_domain  = module.api.api_endpoint_domain
}

# G3/DF-8: Function URL do AI Gateway (stack do repo bajeiros-ai-gateway, mesma
# conta, key própria no mesmo bucket de state). Aplicar o gateway ANTES deste env.
data "terraform_remote_state" "ai_gateway" {
  backend = "s3"
  config = {
    bucket  = "bajeiros-tfstate-staging"
    key     = "ai-gateway/terraform.tfstate"
    region  = "us-east-1"
    profile = "bajeiros-staging"
  }
}

# API (fase 11): Aurora 0 ACU + Data API + Lambda + API GW — tudo em sa-east-1 (ADR-008)
module "api" {
  source    = "../../modules/api"
  providers = { aws = aws.sa_east_1 }

  name                = "bajeiros-staging"
  cognito_issuer      = module.auth.issuer
  cognito_client_id   = module.auth.client_id
  aurora_max_capacity = 1
  # backup 7d, deletion_protection false, budget US$ 40 — defaults do módulo
  budget_alert_emails = ["pedrotaem@gmail.com"]
  gateway_url         = data.terraform_remote_state.ai_gateway.outputs.gateway.function_url
}

module "auth" {
  source    = "../../modules/auth"
  providers = { aws = aws.sa_east_1 }

  name          = "bajeiros-staging"
  domain_prefix = "bajeiros-staging"
  # match EXATO (esquema/host/porta/barra final); localhost p/ dev contra o pool real
  callback_urls = [
    "https://staging.bajeiros.com.br/",
    "http://localhost:5173/",
    "http://localhost:5175/",
  ]
  logout_urls = [
    "https://staging.bajeiros.com.br/",
    "http://localhost:5173/",
    "http://localhost:5175/",
  ]
}

output "auth" {
  description = "issuer/client_id/domínio p/ as variables do GitHub e API local"
  value       = module.auth
}

output "name_servers" {
  description = "Copiar p/ staging_zone_name_servers no env global (delegação)"
  value       = aws_route53_zone.staging.name_servers
}

output "site" {
  value = module.site
}

output "api" {
  description = "GitHub variables: LAMBDA_FUNCTION_NAME, DB_CLUSTER_ARN, DB_MASTER_SECRET_ARN, DB_APP_SECRET_ARN"
  value       = module.api
}
