data "aws_region" "current" {}

output "issuer" {
  description = "COGNITO_ISSUER da API (validação JWKS)"
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "client_id" {
  description = "App client do SPA (aud do ID token)"
  value       = aws_cognito_user_pool_client.spa.id
}

output "auth_domain_url" {
  description = "Domínio do Managed Login (authorize/token/logout) — vai no connect-src da CSP"
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "google_redirect_uri" {
  description = "URI EXATA a cadastrar no OAuth client do Google (copiar, não digitar)"
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com/oauth2/idpresponse"
}

output "idp_link_function_name" {
  description = "Lambda da trigger PreSignUp — vira a variable LAMBDA_IDP_LINK_FUNCTION_NAME no GitHub"
  value       = var.google_enabled ? aws_lambda_function.idp_link[0].function_name : ""
}
