# User Pool Cognito (tier Essentials) + Managed Login (code + PKCE) p/ o SPA.
# Recebe o provider via `providers` do chamador — pools ficam em sa-east-1
# (ADR-008: dados pessoais no Brasil), diferente do site (us-east-1/ACM).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.79" # user_pool_tier + managed_login_branding
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

resource "aws_cognito_user_pool" "this" {
  name                = var.name
  user_pool_tier      = "ESSENTIALS"
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # DF-17: vincula a identidade Google à conta local antes de o Cognito criar um
  # usuário novo, preservando `users.id = sub`. Sem Google, sem trigger.
  dynamic "lambda_config" {
    for_each = var.google_enabled ? [1] : []
    content {
      pre_sign_up = aws_lambda_function.idp_link[0].arn
    }
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.this.id
  managed_login_version = 2
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name}-spa"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = false # SPA público: PKCE, sem client secret
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], var.google_enabled ? ["Google"] : [])
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  # o client não aceita um IdP que ainda não existe no pool
  depends_on = [aws_cognito_identity_provider.google]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_managed_login_branding" "this" {
  user_pool_id                = aws_cognito_user_pool.this.id
  client_id                   = aws_cognito_user_pool_client.spa.id
  use_cognito_provided_values = true
}

# ---------- IdP Google (DF-17) ----------
# Credenciais vêm de fora do state versionado (TF_VAR_*): o cliente OAuth é criado
# à mão no Google Cloud Console, um por ambiente — ver runbook.
#
# O mapeamento precisa cobrir TODOS os atributos obrigatórios do pool: `name` é
# required no schema acima, então sem `name = "name"` todo login federado falha.
# `email_verified` é o que a API exige no ID token (auth/jwt.ts).

resource "aws_cognito_identity_provider" "google" {
  count = var.google_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile" # `profile` é o que traz `name`
  }

  attribute_mapping = {
    username       = "sub"
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
  }
}

# ---------- Lambda da trigger PreSignUp (stub; o CI publica o código real) ----------

data "archive_file" "idp_link_stub" {
  count       = var.google_enabled ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/idp-link-stub.zip"
  source {
    filename = "index.mjs"
    content  = <<-EOT
      // stub inicial — substituído pelo deploy.yml (aws lambda update-function-code).
      // Devolver o evento intacto = não vincular; o login segue funcionando.
      export const handler = async (event) => event
    EOT
  }
}

resource "aws_cloudwatch_log_group" "idp_link" {
  count             = var.google_enabled ? 1 : 0
  name              = "/aws/lambda/${var.name}-idp-link"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "idp_link_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "idp_link" {
  count = var.google_enabled ? 1 : 0

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.idp_link[0].arn}:*"]
  }
  statement {
    # exatamente as três ações do handler, só neste pool
    sid = "LinkProvider"
    actions = [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminLinkProviderForUser",
    ]
    resources = [aws_cognito_user_pool.this.arn]
  }
}

resource "aws_iam_role" "idp_link" {
  count              = var.google_enabled ? 1 : 0
  name               = "${var.name}-idp-link"
  assume_role_policy = data.aws_iam_policy_document.idp_link_trust.json
}

resource "aws_iam_role_policy" "idp_link" {
  count  = var.google_enabled ? 1 : 0
  name   = "idp-link"
  role   = aws_iam_role.idp_link[0].id
  policy = data.aws_iam_policy_document.idp_link[0].json
}

resource "aws_lambda_function" "idp_link" {
  count = var.google_enabled ? 1 : 0

  function_name = "${var.name}-idp-link"
  role          = aws_iam_role.idp_link[0].arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  timeout       = 5 # o Cognito corta em 5s de qualquer forma
  memory_size   = 256

  filename         = data.archive_file.idp_link_stub[0].output_path
  source_code_hash = data.archive_file.idp_link_stub[0].output_base64sha256

  lifecycle {
    ignore_changes = [filename, source_code_hash] # o CI é dono do código
  }

  # Só o log group: a POLICY não pode entrar aqui. Ela cita o ARN do pool, o pool
  # cita esta função em `lambda_config`, e o ciclo fecharia. Ordem real do apply:
  # role → função → pool → policy. Um login federado na janela entre o pool e a
  # policy simplesmente não vincula (RF-3.7 captura e devolve o evento).
  depends_on = [aws_cloudwatch_log_group.idp_link]
}

resource "aws_lambda_permission" "cognito_idp_link" {
  count = var.google_enabled ? 1 : 0

  statement_id  = "AllowCognitoPreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.idp_link[0].function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

# Extensão da role de deploy (criada no módulo static-site) para publicar o código.
# Mesmo padrão e mesma justificativa do nome literal usados no módulo `api`.

data "aws_iam_policy_document" "deploy_idp_link" {
  count = var.google_enabled ? 1 : 0
  statement {
    sid = "LambdaPublish"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
    ]
    resources = [aws_lambda_function.idp_link[0].arn]
  }
}

resource "aws_iam_role_policy" "deploy_idp_link" {
  count  = var.google_enabled ? 1 : 0
  name   = "deploy-idp-link"
  role   = "${var.name}-deploy"
  policy = data.aws_iam_policy_document.deploy_idp_link[0].json
}
