# DF-16 — Início: a página do dia da equipe

> Rascunho de feature (2026-08-29). Deriva do canvas
> ["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b)
> (tela "Início — membro logado"). É a superfície que responde **"o que eu faço agora?"** — e o
> fecho do ciclo da informação: os próximos passos gerados pelo DF-13 aparecem aqui e abrem a
> ferramenta certa.

- **Dependências:** DF-12 (destino `inicio`), DF-13 (fila, níveis, temporada, atividade), DF-14
  (atividade de conhecimento), DF-15 (resultado/competição da equipe vinculada). Consome também
  `projects` (continuar) e `assistant_log` (retomar conversa — DF-9 já persiste).
- **Regra de composição:** o Início **não tem conteúdo próprio** — só agrega e prioriza. Nenhum
  dado nasce aqui; toda linha tem dono em outro DF.

## 1. Contexto e motivação

Hoje o pós-login cai no editor — ótimo para quem ia modelar, mudo para todo o resto (capitão
conferindo pendências, novato procurando a trilha, quem quer saber o que mudou desde ontem). O
Início troca "qual ferramenta abro?" por "o que precisa de mim?", e é onde a evolução cobra
presença sem virar cobrança: três passos, não trinta.

## 2. Objetivos

| #   | Objetivo                                                                             |
| --- | ------------------------------------------------------------------------------------ |
| O1  | Um lugar que prioriza: 3 próximos passos, atividade recente, continuar de onde parou |
| O2  | Evolução visível em 10 segundos (média + barras por área, compacto)                  |
| O3  | Temporada como pulso: contagem regressiva para o próximo marco                       |
| O4  | Carregar rápido mesmo com Aurora a 0 ACU (um endpoint agregador)                     |

### Não-objetivos

- Feed configurável/personalizável por widget — composição fixa na v1.
- Notificações push/e-mail — outra feature (a atividade aqui é pull).
- Conteúdo para anônimo — deslogado vê a landing (DF-12).

## 3. Composição (conforme o canvas)

| Módulo                  | Fonte                               | Conteúdo                                                                                                       |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Saudação                | perfil + DF-13 temporada            | "Boa tarde, <nome>" (hora local) · equipe · temporada · "faltam N dias para <marco>"                           |
| Próximos passos         | DF-13 fila                          | 3 primeiros passos abertos; chip de status quando aplicável; CTA abre a ferramenta/tela do passo               |
| Atividade da equipe     | DF-13 activity (evidências+eventos) | 5–8 itens: salvamentos com contagens canônicas, decisões, guias, trilha, mudanças de nível, resultados (DF-15) |
| Evolução (compacto)     | DF-13 níveis                        | média (serifa) + 6 barras mini + "ver evolução completa ›"                                                     |
| Continuar de onde parou | `projects` + `assistant_log`        | último projeto tocado **pelo usuário** (Abrir) · última conversa do assistente (Retomar)                       |
| Temporada               | DF-13 + DF-15                       | último resultado da equipe vinculada · próximo prazo · próxima competição                                      |

Prioridade de leitura (ordem visual): saudação → passos → atividade; coluna lateral: evolução →
continuar → temporada. Densidade `comfortable`.

## 4. Requisitos funcionais

- RF-1.1 `GET /me/home` — **um** endpoint agregador que compõe tudo acima em uma resposta
  (equipe ativa do usuário). Motivo: Aurora Serverless a 0 ACU acorda em ~15 s; cinco fetches em
  cascata multiplicam o pior caso. O endpoint compõe as consultas numa transação e a UI renderiza
  com skeleton (C-17) módulo a módulo.
- RF-1.2 CTA de passo abre o destino certo: passo de critério do validador → `page: 'editor'`
  com o projeto da temporada; passo de conhecimento → aba Conhecimento; declaração → painel de
  critérios da Evolução. Mapa `criterion_id → destino` vive junto do catálogo.
- RF-1.3 Atividade usa as strings canônicas e cores de status **com o texto como portador**
  ("37 CONFORME · 3 NÃO CONFORME"); horário relativo curto (há 2 h · ontem · seg · 23 ago).
- RF-1.4 "Continuar" do editor = último snapshot cujo autor é o usuário (qualquer projeto da
  equipe); do assistente = última pergunta do usuário (título truncado). Ausentes → módulo
  omitido (nunca card vazio).
- RF-1.5 Saudação por hora local do navegador (bom dia < 12h ≤ boa tarde < 18h ≤ boa noite).

### Estados

- RF-2.1 **Sem equipe:** saudação + convite para criar/entrar em equipe (fluxo DF-10) + cards de
  Ferramentas e Comunidade — o Início nunca é beco sem saída.
- RF-2.2 **Equipe sem evolução ativa** (recém-criada): módulo de bootstrap no lugar de
  passos/atividade: "designe o projeto da temporada · registre a primeira decisão · configure a
  temporada" (os três primeiros passos automáticos do DF-13).
- RF-2.3 **Trainee com trilha aberta:** o passo "concluir a trilha de integração" aparece
  primeiro para esse usuário (personalização mínima; único caso de reordenação por pessoa).
- RF-2.4 Erro do agregador: mensagem com "tentar de novo" (nunca "Carregando…" eterno —
  regra C-12/estados).

## 5. Modelo de dados e API

Nenhuma tabela nova. `GET /me/home` no módulo `identity` (ou módulo `home` fino) compondo:
fila (3), atividade (8), níveis, temporada, último snapshot do usuário, última conversa,
resultado mais recente da equipe vinculada. Resposta ≤ 20 KB.

## 6. Pontos de falha e mitigação

| ID    | Ponto de falha                                      | Mitigação                                                                                     |
| ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P-1.1 | Cold start do Aurora deixa o Início branco por 15 s | Endpoint único + skeleton imediato + timeout com "tentar de novo"                             |
| P-1.2 | Início vira mural de cobrança e afasta              | 3 passos no máximo; tom das strings é convite, não débito; atividade celebra subidas de nível |
| P-1.3 | Usuário em N equipes vê mistura                     | Início é da **equipe ativa** (DF-12 RF-2.3); seletor visível no cabeçalho                     |
| P-1.4 | Módulo sem dado renderiza vazio feio                | Omissão limpa (RF-1.4) ou estado C-16 com ação (RF-2.x)                                       |

## 7. Critérios de aceite

| #         | Critério                                                                                      |
| --------- | --------------------------------------------------------------------------------------------- |
| AC-DF16.1 | Uma chamada `GET /me/home` alimenta a página inteira; payload ≤ 20 KB no caso típico          |
| AC-DF16.2 | Os 3 passos exibidos = 3 primeiros da fila do DF-13; concluir/declarar reflete sem reload     |
| AC-DF16.3 | CTA de cada passo aterrissa no destino certo (editor com projeto da temporada; aba certa)     |
| AC-DF16.4 | Atividade mostra salvamento com contagens canônicas e mudança de nível com explicação         |
| AC-DF16.5 | Sem equipe → convite + ferramentas; equipe nova → bootstrap com os 3 primeiros passos         |
| AC-DF16.6 | Trainee vê a trilha como primeiro passo; demais membros não                                   |
| AC-DF16.7 | Falha de rede → erro com "tentar de novo"; nunca loading eterno                               |
| AC-DF16.8 | Zero hex fora de tokens; skeletons C-17; contagem regressiva bate com a temporada configurada |

## 8. Riscos e questões em aberto

1. **Assistente no "continuar"** exige ler `assistant_log` do próprio usuário — já coberto pelo
   DF-9 (RLS: próprias linhas). Anônimo não tem Início, então a quota anônima não entra aqui.
2. **Peso da atividade** — evidências são muitas; o feed filtra kinds "narráveis" (lista fixa no
   código). Ajustar a lista no piloto.
3. **Personalização além do trainee** (RF-2.3) — tentador e perigoso (vira feed opaco). Congelado:
   só o caso trainee na v1.
