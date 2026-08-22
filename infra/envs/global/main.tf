# Recursos compartilhados: hosted zone + OIDC provider do GitHub.
# Aplicar PRIMEIRO (uma vez), antes de staging/prod.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.70"
    }
  }
  backend "s3" {
    bucket       = "bajeiros-tfstate" # criado no bootstrap (ver infra/README.md)
    key          = "global/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"
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
