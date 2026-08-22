# ADR-004: Provedor de billing

**Status:** **aberto** (divergência D2 da revisão v2 — desempate é comercial, não técnico)

## Contexto

Planos pagos (M3). Requisitos técnicos: checkout hospedado (PCI SAQ-A — nunca tocar cartão), assinaturas recorrentes, webhooks assinados, customer portal. Requisitos comerciais em aberto: taxas sobre Pix, emissão de NF de serviço, aceitação BR.

## Opções

- **Stripe** (preferência Arquiteto+DevOps): DX/documentação superiores, Pix/boleto configuráveis, portal pronto.
- **Mercado Pago / Pagar.me**: Pix nativo com taxas menores, integração fiscal BR mais próxima.

## Pendência p/ decidir

Comparar taxas efetivas (cartão/Pix), suporte a NF, e esforço de integração — antes do início da fase 15. Handlers de webhook seguem o mesmo desenho independente do provedor (assinatura, replay ≤5 min, dedupe por event id — C10).
