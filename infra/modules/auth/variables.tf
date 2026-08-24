variable "name" {
  description = "Prefixo de nomes (ex.: bajeiros-staging)"
  type        = string
}

variable "domain_prefix" {
  description = "Prefixo do domínio do Managed Login (único por região)"
  type        = string
}

variable "callback_urls" {
  description = "Redirect URIs exatas do SPA (esquema/host/porta/barra final)"
  type        = list(string)
}

variable "logout_urls" {
  description = "Destinos permitidos do /logout"
  type        = list(string)
}

variable "deletion_protection" {
  description = "Proteção contra destroy do pool (ligar em prod)"
  type        = bool
  default     = false
}
