# DF-5 — Ponto de ancoragem do volante + tubos de suporte

- **Status:** ✅ **IMPLEMENTADA** (2026-08-16) — promovida a US-12/FR-12.x em [spec.md](../spec.md); regra STEER.1 em [rules.md](../rules.md) §5. Testes: `src/rules/steering.test.ts`.
  - §9 resolvido: Emenda 7 não tem item B6 sobre fixação da direção (B11.5 cobre só a geometria do volante, avaliação dos juízes) ⇒ STEER.1 permanece regra interna. Tipo `STM` não criado (tubos de suporte usam `FREE`, como inclinação da draft). Limiar 25 mm herdado de SUSP.1. Default do ponto: punho do manequim DF-4 configurado; assistente (Wizard) segue sem passo de direção.
- **Ordem de desenvolvimento:** 7ª (última; consome o punho do manequim DF-4)
- **Dependências:** padrão de ancoragens existente (US-4/SUSP.1) · DF-4 (posição recomendada — opcional, a feature funciona sem) · **Desbloqueia:** —
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

A coluna de direção precisa de ancoragem estrutural na gaiola — tipicamente uma mesa/
suporte fixado em tubos dedicados entre membros existentes. Hoje o portal modela 20
ancoragens de suspensão com verificação de suporte físico (SUSP.1, ≤ 25 mm do eixo de um
tubo); o volante segue invisível ao modelo, embora dispute espaço com o habitáculo
(Geraldão/manequim) e exija tubos que afetam massa (DF-2) e conformidade (remoção, US-3).

## 2. Objetivos e não-objetivos

**Objetivos**

- Modelar o(s) ponto(s) de ancoragem do suporte do volante, com posição livre editável.
- Verificar suporte físico em tubo (regra `STEER.1`, análoga a SUSP.1).
- Integrar à análise de remoção: tubo que sustenta o volante não é "removível".
- Sugerir zona recomendada a partir do punho do manequim (quando DF-4 presente).

**Não-objetivos**

- Modelar a coluna, cremalheira ou geometria de direção (fora do domínio da gaiola).
- Requisito normativo específico além do que o levantamento (§9) identificar.

## 3. Conceito

**Modo de fixação configurável:**

- `central` (1 ponto): suporte único no plano de simetria (x = 0 por default, x editável).
- `mesa` (2 pontos L/R): par espelhado como as ancoragens de suspensão (FR-2.2).

Cada ponto segue a filosofia de US-4: **identidade fixa, posição livre**, sem referência
direta a tubo — o vínculo físico é verificado por distância ponto-segmento.

## 4. Requisitos funcionais

- **FR-DF5.1** Entidade de ancoragem de direção com modo `central` ou `mesa` (par L/R
  espelhado); posições editáveis por clique/arrasto no 3D (alvo ampliado, como FR-4.2)
  e pelo painel numérico.
- **FR-DF5.2** Regra automática `STEER.1`: cada ponto a ≤ 25 mm do eixo de algum membro
  = apoiado; senão `fail` "sem suporte — ajuste a gaiola ou adicione tubo" com a
  distância medida (mesmo contrato de SUSP.1; mesmo limiar, revisável em §9).
- **FR-DF5.3** Tubos de suporte são membros normais (tipo `FREE` ou novo tipo `STM —
Steering Mount`, ver §9), participando das regras de seção da classe secundária.
- **FR-DF5.4** Análise de remoção (US-3): remover membro que apoia ancoragem de direção
  acusa `STEER.1` — o tubo deixa de aparecer como redundante.
- **FR-DF5.5** Com DF-4 ativo, o viewport exibe a **zona recomendada** (esfera/disco
  translúcido centrado no punho do manequim, raio parametrizável ~50 mm); ponto fora da
  zona gera aviso informativo (âmbar, não-normativo) no painel.
- **FR-DF5.6** Export/import no JSON; projetos sem o campo importam sem ancoragem de
  direção (feature opt-in — nenhuma regra cobra a existência do volante; quando os pontos
  existem, `STEER.1` os valida).
- **FR-DF5.7** Massa dos tubos de suporte entra naturalmente no DF-2 (são membros).

## 5. Modelo de dados (proposta)

```ts
// model/types.ts
interface SteeringMount {
  mode: 'central' | 'mesa'
  points: { id: 'SW' | 'SWL' | 'SWR'; pos: Vec3 }[] // 1 (central) ou 2 (mesa)
}
interface Cage {
  /* ... */ steering?: SteeringMount
}
```

Reutiliza as primitivas de suporte de `rules/b6.ts` (distância ponto-segmento de SUSP.1
extraída para helper compartilhado).

## 6. Módulos afetados

| Módulo                     | Mudança                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `model/types.ts`           | `SteeringMount`; (opcional) tipo de membro `STM`                       |
| `rules/b6.ts`              | `STEER.1` (extrair helper comum com SUSP.1)                            |
| `store.ts`                 | `setSteeringMode`, `moveSteeringPoint` (com espelhamento no modo mesa) |
| `components/Inspector.tsx` | seção "Direção": modo, posições, status de suporte                     |
| `components/Viewport.tsx`  | marcador próprio (cor distinta das âncoras de suspensão) + zona DF-5.5 |

## 7. UI/UX

- Seção "Direção" no painel: seletor de modo, botão "adicionar ancoragem do volante"
  (opt-in), lista de pontos com badge apoiado/sem suporte (idêntico ao padrão de US-4).
- Marcador 3D: octaedro **ciano** (suspensão usa laranja/rosa) com o mesmo alvo ampliado
  de clique.
- `STEER.1` aparece no checklist junto de SUSP.1, com destaque dos membros de apoio.

## 8. Critérios de aceite

| #        | Critério                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| AC-DF5.1 | Adicionar ancoragem central e posicioná-la sobre um tubo → `STEER.1` pass com distância exibida            |
| AC-DF5.2 | Afastá-la > 25 mm de qualquer tubo → `fail` com mensagem de ação                                           |
| AC-DF5.3 | Modo mesa: mover o ponto L move o R espelhado (e vice-versa)                                               |
| AC-DF5.4 | Tubo que apoia o volante não aparece no destaque teal de redundância; simulação de remoção acusa `STEER.1` |
| AC-DF5.5 | Com manequim (DF-4) ativo, a zona do punho aparece e o aviso âmbar dispara fora dela                       |
| AC-DF5.6 | Projeto sem `steering` importa e valida sem menção a `STEER.1`                                             |

## 9. Riscos e questões em aberto

- **Levantamento normativo:** conferir na Emenda 7 se há itens sobre fixação da direção
  (rigidez, posição, proteção). Se houver, `STEER.1` ganha o ID do regulamento;
  senão permanece regra interna de engenharia (como SUSP.1).
- **Tipo `STM` vs `FREE`:** tipo dedicado melhora legenda/relatórios mas adiciona 23º
  tipo; decidir na implementação (inclinação atual: começar com `FREE` + nomeação livre,
  promover a `STM` se DF-2/DF-7 precisarem distinguir).
- **Limiar de 25 mm:** herdado de SUSP.1; validar se serve para mesa de direção
  (fixações por abraçadeira podem tolerar mais).
- Uma ou duas ancoragens como default do assistente (Wizard passo futuro)?

## 10. Plano de implementação (quando aprovada)

1. Levantamento normativo (define id e severidade da regra).
2. Tipos + store + espelhamento do modo mesa.
3. `STEER.1` com helper compartilhado de SUSP.1 + integração com `removalImpact`.
4. UI (seção, marcadores, zona do punho condicionada a DF-4).
5. Atualizar `spec.md`/`rules.md`.
