terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.70"
    }
  }
  backend "s3" {
    bucket       = "bajeiros-tfstate"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1" # ACM p/ CloudFront exige us-east-1
}

variable "github_repo" {
  type    = string
  default = "pedrotaem/bajeiros-portal"
}

data "terraform_remote_state" "global" {
  backend = "s3"
  config = {
    bucket = "bajeiros-tfstate"
    key    = "global/terraform.tfstate"
    region = "us-east-1"
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
