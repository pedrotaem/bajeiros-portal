variable "name" {
  description = "Prefixo dos recursos (ex.: bajeiros-staging). A role <name>-deploy do módulo static-site é estendida por NOME literal (ver main.tf)"
  type        = string
}

variable "cognito_issuer" {
  description = "COGNITO_ISSUER da Lambda (output do módulo auth)"
  type        = string
}

variable "cognito_client_id" {
  description = "COGNITO_CLIENT_ID da Lambda (output do módulo auth)"
  type        = string
}

variable "aurora_engine_version" {
  description = "Aurora PostgreSQL — precisa ser >= 16.3 (auto-pause 0 ACU do Serverless v2)"
  type        = string
  default     = "16.14" # mais recente disponível em sa-east-1 em 2026-08 (16.6 saiu de catálogo)
}

variable "aurora_max_capacity" {
  description = "ACUs máximas do Serverless v2 (1 staging, 2 prod)"
  type        = number
  default     = 1
}

variable "aurora_seconds_until_auto_pause" {
  description = "Inatividade até pausar em 0 ACU (resume ~15s)"
  type        = number
  default     = 300
}

variable "backup_retention_days" {
  description = "Retenção de backup automático (7 staging, 35 prod)"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "true em prod (também desativa skip_final_snapshot)"
  type        = bool
  default     = false
}

variable "budget_limit_usd" {
  description = "Teto mensal do aws_budgets_budget (decisão: US$ 40)"
  type        = number
  default     = 40
}

variable "budget_alert_emails" {
  description = "Destinatários dos alertas de budget (50/80/100% real + 100% forecast)"
  type        = list(string)
}

variable "log_retention_days" {
  description = "Retenção dos logs da Lambda"
  type        = number
  default     = 30
}

variable "gateway_url" {
  description = "Function URL do AI Gateway (G3/DF-8). Vazio = assistente degrada gracioso. Não-vazio liga GATEWAY_AUTH=iam (SigV4)."
  type        = string
  default     = ""
}
