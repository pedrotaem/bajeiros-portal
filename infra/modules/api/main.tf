# API na AWS (fase 11, ADR-007/008): Aurora Serverless v2 PG 16 com 0 ACU +
# RDS Data API + Lambda FORA de VPC + API GW HTTP atrás do CloudFront existente.
# Recebe o provider sa_east_1 do chamador (dados pessoais no Brasil, ADR-008).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.79"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

# ---------- rede: VPC default, SG SEM ingress ----------
# O acesso é só via Data API (HTTPS/IAM) — nenhum caminho de rede até o cluster.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "db" {
  name       = "${var.name}-db"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Aurora ${var.name} - sem ingress (acesso somente via RDS Data API)"
  vpc_id      = data.aws_vpc.default.id
  # nenhuma regra de ingress de propósito
}

# ---------- Aurora Serverless v2 (0 ACU) + Data API ----------

resource "aws_rds_cluster" "db" {
  cluster_identifier = "${var.name}-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # Serverless v2 usa provisioned + db.serverless
  engine_version     = var.aurora_engine_version
  database_name      = "bajeiros"

  # Data API (ADR-007) — Lambda fora de VPC fala HTTPS com o cluster
  enable_http_endpoint = true

  serverlessv2_scaling_configuration {
    min_capacity             = 0 # auto-pause (exige engine >= 16.3, ADR-008 confirmado)
    max_capacity             = var.aurora_max_capacity
    seconds_until_auto_pause = var.aurora_seconds_until_auto_pause
  }

  # secret MASTER gerenciado pela AWS (Secrets Manager) — usado só nas migrações
  manage_master_user_password = true
  master_username             = "postgres"

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]

  storage_encrypted         = true
  backup_retention_period   = var.backup_retention_days
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = "${var.name}-db-final"
}

resource "aws_rds_cluster_instance" "db" {
  identifier         = "${var.name}-db-1"
  cluster_identifier = aws_rds_cluster.db.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.db.engine
  engine_version     = aws_rds_cluster.db.engine_version
}

# ---------- secret do APP (role bajeiros_app, NOBYPASSRLS → RLS viva) ----------
# O runner de migração alinha a senha do role a este secret; o runtime da Lambda
# usa SÓ este secret (nunca o master).

resource "random_password" "app_db" {
  length  = 32
  special = false # evita escaping no ALTER ROLE e em URLs
}

resource "aws_secretsmanager_secret" "app_db" {
  name = "${var.name}-db-app"
}

resource "aws_secretsmanager_secret_version" "app_db" {
  secret_id = aws_secretsmanager_secret.app_db.id
  secret_string = jsonencode({
    username = "bajeiros_app"
    password = random_password.app_db.result
  })
}

# ---------- Lambda (stub — o CI é dono do código via update-function-code) ----------

resource "random_password" "assistant_rate_salt" {
  length  = 32
  special = false
}

data "archive_file" "lambda_stub" {
  type        = "zip"
  output_path = "${path.module}/lambda-stub.zip"
  source {
    filename = "index.mjs"
    content  = <<-EOT
      // stub inicial — substituído pelo deploy.yml (aws lambda update-function-code)
      export const handler = async () => ({
        statusCode: 503,
        headers: { "content-type": "application/problem+json" },
        body: JSON.stringify({ title: "API ainda não publicada", status: 503 }),
      })
    EOT
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_permissions" {
  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    sid = "DataApi"
    actions = [
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:RollbackTransaction",
      "rds-data:ExecuteStatement",
      "rds-data:BatchExecuteStatement",
    ]
    resources = [aws_rds_cluster.db.arn]
  }
  statement {
    # SÓ o secret do app — o master (DDL) fica restrito ao deploy/migração
    sid       = "AppSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app_db.arn]
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy" "lambda" {
  name   = "api"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}

resource "aws_lambda_function" "api" {
  function_name = "${var.name}-api"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  timeout       = 28 # < timeout de 29s do API GW; cobre resume do Aurora com retry
  memory_size   = 512

  filename         = data.archive_file.lambda_stub.output_path
  source_code_hash = data.archive_file.lambda_stub.output_base64sha256

  environment {
    variables = {
      AUTH_MODE           = "cognito"
      COGNITO_ISSUER      = var.cognito_issuer
      COGNITO_CLIENT_ID   = var.cognito_client_id
      DB_MODE             = "data-api"
      DB_CLUSTER_ARN      = aws_rds_cluster.db.arn
      DB_SECRET_ARN       = aws_secretsmanager_secret.app_db.arn
      DB_NAME             = "bajeiros"
      ASSISTANT_RATE_SALT = random_password.assistant_rate_salt.result
      # G3/DF-8: Function URL do AI Gateway (vazio = 502 gracioso no /chat)
      GATEWAY_URL  = trimsuffix(var.gateway_url, "/")
      GATEWAY_AUTH = var.gateway_url == "" ? "" : "iam" # SigV4 (Function URL AWS_IAM)
      # DF-19 AC-10 / DF-20 §9: 'declarado' é a v1 autodeclarativa; 'aferido' liga as
      # contraprovas. A troca NÃO exige migração — é o mesmo dado, outro cálculo — e o
      # gate é de produto (uma temporada de v1 acumulada), não de deploy.
      EVOLUTION_MODE = var.evolution_mode
      # DF-27: degustação anônima do assistente. `0` enquanto a cortina "Em breve"
      # estiver de pé — é a única rota que gasta LLM sem conta e não passa pela UI.
      ASSISTANT_ANON_DAILY = tostring(var.assistant_anon_daily)
    }
  }

  # o CI publica o código real — o Terraform não pode reverter para o stub
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.lambda]
}

# ---------- API Gateway HTTP (throttling; JWT validado NA aplicação — ADR-001) ----------

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 50
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# ---------- extensão da role de deploy (criada no módulo static-site) ----------
# Nome LITERAL "<name>-deploy" de propósito: referenciar module.site aqui criaria
# ciclo (site precisa de api_origin_domain deste módulo). A role já existe dos
# applies anteriores; num bootstrap do zero, aplicar o site antes.

data "aws_iam_policy_document" "deploy_api" {
  statement {
    sid = "LambdaPublish"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration", # `aws lambda wait function-updated` usa esta action
    ]
    resources = [aws_lambda_function.api.arn]
  }
  statement {
    # migração via Data API roda no deploy, ANTES de publicar o código novo
    sid = "MigrateDataApi"
    actions = [
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:RollbackTransaction",
      "rds-data:ExecuteStatement",
      "rds-data:BatchExecuteStatement",
    ]
    resources = [aws_rds_cluster.db.arn]
  }
  statement {
    # os DOIS secrets: master p/ DDL da migração, app p/ o ALTER ROLE pós-migração
    sid     = "MigrateSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_rds_cluster.db.master_user_secret[0].secret_arn,
      aws_secretsmanager_secret.app_db.arn,
    ]
  }
}

resource "aws_iam_role_policy" "deploy_api" {
  name   = "deploy-api"
  role   = "${var.name}-deploy"
  policy = data.aws_iam_policy_document.deploy_api.json
}

# ---------- budget (decisão fase 11: teto US$ 40/mês por conta) ----------

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.budget_alert_emails
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }
}
