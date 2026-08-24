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

variable "github_repo" {
  type    = string
  default = "pedrotaem/bajeiros-portal"
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
}

output "name_servers" {
  description = "Copiar p/ staging_zone_name_servers no env global (delegação)"
  value       = aws_route53_zone.staging.name_servers
}

output "site" {
  value = module.site
}
