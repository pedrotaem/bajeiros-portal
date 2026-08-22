# DF-6 — Continuidade de tubo através de ponto denominado

- **Status:** ✅ **IMPLEMENTADA** (2026-08-16) — promovida a US-9/FR-9.x em [spec.md](../spec.md); regra B6.3.1 em [rules.md](../rules.md) §6. Testes: `src/model/continuity.test.ts`.
  - §9 resolvido (norma sobre emendas): B6.3.1.1 — união < 5° = emenda que exige **luva interna** (2×Ø p/ lado, espessura ≥ tubos, ≥ 102 mm de solda, B6.3.1.2–.5); implementado como detecção automática + item `manual` condicional. Retro-inferência no import: **não aplicada** (conservador — tudo descontínuo, sem aviso de UI; documentado). Terminologia adotada: "passagem contínua" / "tubo contínuo".
  - DF-2 v2 parte 1 entregue junto: `countJoints` desconta passagens (AC-DF2.5 ✔).
- **Ordem de desenvolvimento:** 4ª (fundação do núcleo de fabricação: DF-7 e refino do DF-2)
- **Dependências:** nenhuma · **Desbloqueia:** DF-7 (quem recebe boca de lobo), DF-2 v2 (nó contínuo não é junta de topo)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

No modelo atual, um "tubo" é um membro reto entre dois nós; cadeias com dobras são
membros consecutivos ligados por nós intermediários (design.md §3.3). O modelo **não
distingue** duas situações fisicamente diferentes no mesmo grafo:

1. **Tubo contínuo:** uma única peça que passa pelo nó (reta ou dobrada) — ex.: montante
   do RRH dobrado no ponto B, feito de um tubo só.
2. **Tubos emendados:** duas peças unidas por solda de topo (com ou sem luva) no nó.

A distinção importa para: requisitos do regulamento sobre emendas; contagem de juntas
soldadas e massa (DF-2); e quem "corta boca de lobo em quem" numa junta (DF-7). Hoje o
motor já depende implicitamente de continuidade nas regras de cadeia (RRH/LFS/SIM), mas
como propriedade inferida, não declarada.

## 2. Objetivos e não-objetivos

**Objetivos**

- Permitir declarar, por nó, quais pares de membros incidentes formam um tubo físico contínuo.
- Defaults inteligentes que não exigem trabalho do usuário no fluxo comum.
- Visualizar cadeias contínuas como um tubo lógico único.
- Expor a informação para DF-2, DF-7 e para futuras regras de emenda.

**Não-objetivos**

- Validar processo de solda ou luva (item manual do checklist, se o regulamento exigir).
- Modelar o raio real da dobra (continua item manual, design.md §3.3).

## 3. Conceito e semântica

**Passagem contínua** = par ordenado de membros `(m1, m2)` incidentes ao mesmo nó `n`,
declarado como "uma peça única atravessa n". Regras de consistência:

- Cada membro participa de no máximo **uma** passagem contínua por extremidade
  (um tubo físico tem 2 pontas).
- Passagens são transitivas na visualização: `m1–m2` em `n1` e `m2–m3` em `n2` formam a
  cadeia física `m1+m2+m3` (um "tubo lógico").
- Um nó pode ter uma passagem contínua **e** outros membros soldados nele
  (ex.: travessa chegando no meio de um montante contínuo).

## 4. Requisitos funcionais

- **FR-DF6.1** Painel do nó lista os membros incidentes e permite parear dois deles como
  passagem contínua (e desfazer). Nós de grau < 2 não oferecem a opção.
- **FR-DF6.2** Defaults: "+ Nó no tubo" (FR-2.4) cria a passagem contínua automaticamente
  (dividir um tubo não o transforma em dois tubos soldados); membros de **tipos
  diferentes** unidos em nó nascem descontínuos; template e assistente declaram as
  passagens fisicamente óbvias (ex.: montantes RRH dobrados no ponto B).
- **FR-DF6.3** Badge no painel do nó: "passagem contínua (RRH_L + RRH_L2)" vs
  "emenda/junta soldada". No 3D, cadeia contínua selecionada é destacada inteira.
- **FR-DF6.4** Consistência automática: excluir um membro remove as passagens que o
  referenciam; pareamentos inválidos (membro não incidente) são impossíveis pela UI e
  saneados no import JSON.
- **FR-DF6.5** Export/import no JSON do projeto (FR-2.7), com migração silenciosa de
  projetos antigos (sem o campo ⇒ tudo descontínuo exceto inferências do FR-DF6.2 não
  aplicáveis retroativamente — documentar).
- **FR-DF6.6** API para consumidores: `isContinuousAt(cage, node, member)`,
  `physicalChains(cage): Member[][]` (tubos lógicos), usadas por DF-2/DF-7.
- **FR-DF6.7** Se o regulamento tiver requisitos sobre emendas de membros primários
  (localização/luva — levantar na Emenda 7), nova regra automática ou item manual
  condicionado à existência de emendas declaradas.

## 5. Modelo de dados (proposta)

```ts
// model/types.ts
interface Continuity {
  node: NodeId
  pair: [string, string] // ids dos 2 membros que formam a passagem
}
interface Cage {
  // ...existente
  continuity?: Continuity[]
}
```

Funções puras em `model/continuity.ts` (novo): validação de consistência, `physicalChains`,
`isContinuousAt`. Sem estado derivado armazenado (design.md §1: geometria = fonte de verdade;
continuidade é **declaração física**, não derivável — por isso vive no `Cage`).

## 6. Módulos afetados

| Módulo                             | Mudança                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `model/types.ts`                   | `Cage.continuity`                                                                                 |
| `model/continuity.ts`              | novo: consistência + consultas                                                                    |
| `store.ts`                         | `setContinuity(node, pair)`, `clearContinuity(node, pair)`; hooks em `deleteMember`/`splitMember` |
| `components/Inspector.tsx`         | pareamento no painel do nó + badges                                                               |
| `components/Viewport.tsx`          | destaque de cadeia contínua na seleção                                                            |
| `model/template.ts` / `builder.ts` | declarações default                                                                               |
| `rules/b6.ts`                      | (condicional §FR-DF6.7) regra de emenda                                                           |

## 7. UI/UX

- No painel do nó: seção "Continuidade" com os membros incidentes como chips; selecionar
  dois e clicar "marcar como tubo contínuo". Passagem existente aparece como chip duplo
  com botão de desfazer.
- Selecionar um membro de uma cadeia contínua mostra no painel "parte do tubo físico:
  3 segmentos, 1.240 mm" e destaca a cadeia inteira em tom mais claro do roxo de seleção.

## 8. Critérios de aceite

| #        | Critério                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ |
| AC-DF6.1 | "+ Nó no tubo" seguido de arrasto mantém o par como passagem contínua sem ação do usuário  |
| AC-DF6.2 | Parear dois membros num nó atualiza o badge e o destaque de cadeia                         |
| AC-DF6.3 | Tentar parear um membro que já tem passagem naquela extremidade é bloqueado com explicação |
| AC-DF6.4 | Excluir membro de uma passagem remove a declaração sem estado órfão (export limpo)         |
| AC-DF6.5 | JSON antigo importa sem erro; JSON novo round-trips a continuidade                         |

## 9. Riscos e questões em aberto

- **Norma sobre emendas:** conferir na Emenda 7 se há restrição de emenda em membro
  primário (posição, luva interna mínima, sobreposição). Define se FR-DF6.7 é regra
  automática, item manual ou inexistente.
- Retro-inferência em projetos antigos: aplicar defaults do FR-DF6.2 no import ou deixar
  tudo descontínuo? Proposta: deixar descontínuo e mostrar aviso único "revise a
  continuidade" (conservador — não inventa física que o usuário não declarou).
- Terminologia PT na UI: "tubo contínuo" vs "peça única" — decidir com usuários.

## 10. Plano de implementação (quando aprovada)

1. `model/continuity.ts` + tipos + testes de consistência.
2. Hooks no store (split/delete) + defaults no template/builder.
3. UI de pareamento e badges.
4. Levantamento normativo de emendas → FR-DF6.7 se aplicável.
5. Atualizar `spec.md` e preparar interfaces para DF-7.
