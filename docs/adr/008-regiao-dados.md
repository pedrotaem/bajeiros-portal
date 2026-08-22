# ADR-008: Região da camada de dados/API — sa-east-1

**Status:** aceito (2026-08-22, método: debate pros/contras + voto de minerva da persona de Segurança)

## Contexto

A divergência D1 da revisão v2: onde ficam Aurora, Lambda, API Gateway e Cognito (plano v2). Não afeta a stack v1 (S3 estático + CloudFront) nem CloudFront/ACM/WAF-de-CloudFront, que são us-east-1/globais por exigência da AWS. Usuários-alvo: estudantes no Brasil.

## Argumentos do Arquiteto (defende sa-east-1)

**Pros:**

- Latência São Paulo↔us-east-1 ≈ 110–140 ms RTT vs ≈ 5–30 ms em sa-east-1. App é interativo (save, validação server-side, colaboração no M2): cada request paga o RTT — CloudFront na frente amortiza TLS handshake (keep-alive no edge), **não** o RTT por chamada.
- Residência dos dados no Brasil elimina a discussão de transferência internacional da LGPD e é argumento de confiança p/ universidades.
- Decidir região **antes** do primeiro apply custa zero; migrar banco com dados depois custa caro.

**Contras (honestos):**

- sa-east-1 é ~20–40% mais cara (Lambda/Aurora/S3) e historicamente recebe features novas com atraso.
- **Melhor argumento contra mim:** a disponibilidade do RDS Data API (ADR-007) e do scale-to-zero do Aurora Serverless v2 em sa-east-1 precisa ser confirmada — se faltar, perco parte do desenho de custo/simplicidade que defendo.

## Argumentos do DevOps (defende us-east-1)

**Pros:**

- Tudo numa região só: v1 já está em us-east-1 (tfstate, ACM, zona), menos providers/aliases no Terraform, menos chance de erro operacional.
- Região mais barata e sempre a primeira a receber serviços novos — Data API e 0 ACU garantidos.
- No beta, tráfego é pequeno; 140 ms em chamadas não-críticas é tolerável.

**Contras (honestos):**

- O argumento de custo é fraco em termos absolutos: no beta, a conta é ~US$ 0 + storage; 30% de quase nada é nada.
- **Melhor argumento contra mim:** a latência não é transitória — é um teto permanente na UX de um produto que quer ser colaborativo; e a "simplicidade de uma região" morre de qualquer forma, porque CloudFront/ACM já obrigam us-east-1 como segunda região lógica.

## Voto de minerva (Segurança)

**sa-east-1.** Fundamentação:

1. **LGPD (art. 33):** transferência internacional é legal com salvaguardas (cláusulas-padrão da Resolução CD/ANPD nº 19/2024 + DPA da AWS), mas é obrigação a documentar, manter e explicar na política de privacidade. Dados no Brasil **eliminam a obrigação em vez de gerenciá-la** — minimização de superfície de conformidade, coerente com o perfil dos titulares (estudantes BR).
2. Latência menor também é segurança de produto: timeouts curtos e retries menos agressivos reduzem janela p/ comportamentos estranhos em handlers idempotentes (billing, saves concorrentes).
3. O sobrecusto (~20–40%) é irrelevante em valor absoluto no estágio atual e não compra nenhuma redução de risco em us-east-1.

## Decisão final

Camada de dados/API do plano v2 (Aurora, Lambda, API GW, Cognito, buckets de assets de projeto e logs com dado pessoal) em **sa-east-1**. CloudFront, ACM de CloudFront e WAF de CloudFront permanecem us-east-1/globais (exigência AWS). Stack estática v1 permanece como está.

## Consequências / condições

- **Condição de verificação (início da fase 11):** confirmar em sa-east-1 (a) RDS Data API p/ Aurora Serverless v2 e (b) scale-to-zero (0 ACU). Se (a) faltar → fallback do ADR-007 (Lambda em VPC + endpoints) **mantendo sa-east-1**; se (b) faltar → reavaliar este ADR (o custo idle muda a equação). Ambos marcados **verificar**.
- Terraform: envs v2 ganham provider `sa-east-1` + alias `us-east-1` p/ recursos de edge; documentar no `infra/README.md` quando a fase 11 abrir.
- Aceitar o prêmio de preço de sa-east-1; revisar na análise de custo mensal.
- Snapshot cross-region de backup (16.3) → us-east-1 como região secundária (transferência internacional de backup cifrado: registrar como salvaguarda no programa LGPD).
