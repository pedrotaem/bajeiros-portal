variable "name" {
  description = "Prefixo dos recursos (ex.: bajeiros-prod)"
  type        = string
}

variable "domain_name" {
  description = "FQDN servido pela distribuição (ex.: bajeiros.com.br)"
  type        = string
}

variable "aliases" {
  description = "Todos os hostnames da distribuição (inclui www se houver)"
  type        = list(string)
}

variable "zone_id" {
  description = "Hosted zone Route53 onde criar registros"
  type        = string
}

variable "csp_enforce" {
  description = "false = Content-Security-Policy-Report-Only; true = enforce"
  type        = bool
  default     = false
}

variable "csp_value" {
  description = "Valor do header CSP"
  type        = string
  default     = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
}

variable "noindex" {
  description = "true adiciona X-Robots-Tag: noindex (staging)"
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "org/repo autorizado no OIDC (ex.: pedro/bajeiros-portal)"
  type        = string
}

variable "github_environment" {
  description = "Environment do GitHub autorizado a assumir a role de deploy"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN do IAM OIDC provider do GitHub (criado no env global)"
  type        = string
}
