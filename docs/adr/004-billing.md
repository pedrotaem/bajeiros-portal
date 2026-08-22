# ADR-004: Provedor de billing — Stripe

**Status:** aceito (2026-08-22, decisão do product owner)

## Contexto

Planos pagos (M3). Requisitos técnicos: checkout hospedado (PCI SAQ-A — nunca tocar cartão), assinaturas recorrentes, webhooks assinados, customer portal. Modelo comercial definido: **cobrança via Pix, por usuário/mês, valor baixo/simbólico**.

## Decisão

**Stripe.** O product owner já tem conta ativa; DX/documentação superiores; era a preferência técnica de Arquiteto+DevOps na revisão v2 (D2).

## Atenção — Pix recorrente

Pix é, nativamente, pagamento avulso (não débito recorrente). Caminhos no Stripe, a validar na fase 15:

1. **Subscription com `collection_method: send_invoice`** — fatura por ciclo, pagável via Pix; usuário paga manualmente a cada mês (fricção real em valor simbólico).
2. **Pix Automático** (BCB, 2025 — débito recorrente autorizado uma vez): **verificar** disponibilidade no Stripe BR no momento da implementação.
3. Fallback: período maior (anual/semestral) p/ reduzir fricção de pagamento manual, ou cartão como alternativa ao Pix.

## Consequências

- Handlers de webhook conforme C10 (assinatura, replay ≤ 5 min, dedupe por `event.id`).
- `subscription.status = past_due` esperado com frequência no fluxo Pix manual → régua de lembrete por e-mail antes de degradar p/ read-only (15.4).
- Emissão de NF de serviço continua pendência comercial à parte (15.3) — Stripe não emite NF brasileira.
