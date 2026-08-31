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

# ---------- DF-17: login com Google ----------

variable "google_enabled" {
  description = "Liga o IdP Google + a trigger de vinculação (staging antes de prod)"
  type        = bool
  default     = false
}

variable "google_client_id" {
  description = "OAuth client ID do Google Cloud (via TF_VAR_google_client_id)"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "OAuth client secret do Google Cloud (via TF_VAR_google_client_secret)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "log_retention_days" {
  description = "Retenção do log da Lambda de vinculação"
  type        = number
  default     = 30
}
