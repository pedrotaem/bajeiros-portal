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
