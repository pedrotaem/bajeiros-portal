output "api_endpoint_domain" {
  description = "Domínio do API GW (sem https://) — vira origin /api/* no CloudFront"
  value       = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
}

output "lambda_function_name" {
  description = "GitHub variable LAMBDA_FUNCTION_NAME"
  value       = aws_lambda_function.api.function_name
}

output "cluster_arn" {
  description = "GitHub variable DB_CLUSTER_ARN"
  value       = aws_rds_cluster.db.arn
}

output "master_secret_arn" {
  description = "GitHub variable DB_MASTER_SECRET_ARN (migração/DDL)"
  value       = aws_rds_cluster.db.master_user_secret[0].secret_arn
}

output "app_secret_arn" {
  description = "GitHub variable DB_APP_SECRET_ARN (runtime, role sem BYPASSRLS)"
  value       = aws_secretsmanager_secret.app_db.arn
}
