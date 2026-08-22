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
    key          = "staging/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1" # ACM p/ CloudFront exige us-east-1
}

variable "github_repo" {
  type    = string
  default = "CHANGE_ME/bajeiros-portal" # org/repo — ajustar após criar o repo
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

  name               = "bajeiros-staging"
  domain_name        = "staging.bajeiros.com.br"
  aliases            = ["staging.bajeiros.com.br"]
  zone_id            = data.terraform_remote_state.global.outputs.zone_id
  oidc_provider_arn  = data.terraform_remote_state.global.outputs.oidc_provider_arn
  github_repo        = var.github_repo
  github_environment = "staging"
  noindex            = true
  csp_enforce        = false # Report-Only até validar (C2)
}

output "site" {
  value = module.site
}
