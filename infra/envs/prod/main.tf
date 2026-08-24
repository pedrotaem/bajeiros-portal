terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.70"
    }
  }
  backend "s3" {
    bucket       = "bajeiros-tfstate-prod"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    profile      = "bajeiros-prod"
  }
}

# Conta bajeiros-prod (035842308271). Aplicar com AWS_PROFILE=bajeiros-prod,
# DEPOIS do env global (zona + OIDC vivem no state global, mesma conta).

provider "aws" {
  region  = "us-east-1" # ACM p/ CloudFront exige us-east-1
  profile = "bajeiros-prod"
}

# Cognito em sa-east-1 (ADR-008: dados pessoais no Brasil)
provider "aws" {
  alias   = "sa_east_1"
  region  = "sa-east-1"
  profile = "bajeiros-prod"
}

# Forma IMUTÁVEL do sub OIDC (owner@id/repo@id) — repos criados após 15/07/2026
# emitem só esse formato (changelog GitHub 2026-04-23). IDs: gh api repos/... .id
variable "github_repo" {
  type    = string
  default = "pedrotaem@29166147/bajeiros-portal@1342987014"
}

data "terraform_remote_state" "global" {
  backend = "s3"
  config = {
    bucket  = "bajeiros-tfstate-prod"
    key     = "global/terraform.tfstate"
    region  = "us-east-1"
    profile = "bajeiros-prod"
  }
}

module "site" {
  source = "../../modules/static-site"

  name               = "bajeiros-prod"
  domain_name        = "bajeiros.com.br"
  aliases            = ["bajeiros.com.br", "www.bajeiros.com.br"]
  zone_id            = data.terraform_remote_state.global.outputs.zone_id
  oidc_provider_arn  = data.terraform_remote_state.global.outputs.oidc_provider_arn
  github_repo        = var.github_repo
  github_environment = "production"
  noindex            = false
  csp_enforce        = false # promover a true após CSP limpa no staging (C2)
  extra_connect_src  = [module.auth.auth_domain_url]
}

module "auth" {
  source    = "../../modules/auth"
  providers = { aws = aws.sa_east_1 }

  name                = "bajeiros-prod"
  domain_prefix       = "bajeiros" # prefixo é único por região — validar no 1º apply
  deletion_protection = true
  callback_urls = [
    "https://bajeiros.com.br/",
    "https://www.bajeiros.com.br/",
  ]
  logout_urls = [
    "https://bajeiros.com.br/",
    "https://www.bajeiros.com.br/",
  ]
}

output "auth" {
  description = "issuer/client_id/domínio p/ as variables do GitHub"
  value       = module.auth
}

# Alarme 5xx (C7.1 do plano)
resource "aws_sns_topic" "alerts" {
  name = "bajeiros-prod-alerts"
}

resource "aws_cloudwatch_metric_alarm" "cf_5xx" {
  alarm_name          = "bajeiros-prod-cloudfront-5xx"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    DistributionId = module.site.distribution_id
    Region         = "Global"
  }
}

output "site" {
  value = module.site
}
