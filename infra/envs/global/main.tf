# Recursos compartilhados da CONTA PROD: hosted zone pai + OIDC provider do GitHub.
# Aplicar PRIMEIRO (uma vez), antes de staging/prod, com AWS_PROFILE=bajeiros-prod.
# A conta staging tem zona delegada própria (staging.bajeiros.com.br) — ver envs/staging.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.70"
    }
  }
  backend "s3" {
    bucket       = "bajeiros-tfstate-prod" # criado no bootstrap (ver infra/README.md)
    key          = "global/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    profile      = "bajeiros-prod"
  }
}

provider "aws" {
  region  = "us-east-1"
  profile = "bajeiros-prod"
}

resource "aws_route53_zone" "main" {
  name = "bajeiros.com.br"
}

resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "bajeiros.com.br"
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"amazontrust.com\"",
    "0 issue \"awstrust.com\"",
    "0 issue \"amazonaws.com\"",
  ]
}

# Delegação da zona staging (conta bajeiros-staging).
# Default = NS reais da zona delegada (output name_servers do env staging);
# atualizar se a zona staging for recriada.
variable "staging_zone_name_servers" {
  type = list(string)
  default = [
    "ns-1098.awsdns-09.org",
    "ns-137.awsdns-17.com",
    "ns-1807.awsdns-33.co.uk",
    "ns-617.awsdns-13.net",
  ]
}

resource "aws_route53_record" "staging_delegation" {
  count   = length(var.staging_zone_name_servers) > 0 ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "staging.bajeiros.com.br"
  type    = "NS"
  ttl     = 3600
  records = var.staging_zone_name_servers
}

# Thumbprint não é mais usado p/ validação (AWS confia na CA raiz do GitHub),
# mas o campo é obrigatório na API.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "name_servers" {
  description = "Apontar no Registro.br"
  value       = aws_route53_zone.main.name_servers
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
