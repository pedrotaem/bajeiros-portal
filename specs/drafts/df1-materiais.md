# DF-1 — Material dos tubos (aços) para primários e secundários

- **Status:** ✅ **IMPLEMENTADA** (2026-08-16) — promovida a US-6/FR-6.x em [spec.md](../spec.md); regras B6.3.3.2 e MAT.1 em [rules.md](../rules.md) §6. Testes: `src/model/materials.test.ts`, `src/rules/b6-materials.test.ts` (vitest).
  - Desvios da proposta: funções de seção ficaram todas em `model/materials.ts` (não em `rules/geometry.ts`); migração de import preserva %C antigo como material customizado quando não casa o catálogo (mais fiel que default seco); validação de plausibilidade virou regra `MAT.1` no checklist.
- **Ordem de desenvolvimento:** 1ª (fundação de DF-2 e DF-7)
- **Dependências:** nenhuma · **Desbloqueia:** DF-2 (densidade → massa), DF-7 (seção por classe já existe; material completa a junta)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

Hoje `TubeSection` guarda Ø externo, parede e %C digitado à mão, por classe
(primário/secundário). O regulamento não exige um aço específico: exige **%C mínimo**
e, para seções fora do padrão, **equivalência de rigidez e resistência à flexão**
(B6.3.3.2, hoje coberto por `warn` + item manual). Sem o material o sistema não
conhece E (módulo), Sy (escoamento) nem densidade — o que impede automatizar a
equivalência e calcular massa (DF-2).

## 2. Objetivos e não-objetivos

**Objetivos**

- Selecionar um aço por classe (primário e secundário separadamente) de um catálogo.
- Derivar %C do aço selecionado (fim do campo manual solto).
- Promover a verificação de equivalência B6.3.3.2 de `manual/warn` para cálculo automático.
- Expor densidade e propriedades para consumo do DF-2.

**Não-objetivos**

- Material por membro individual (fica registrado como possível evolução; ver §9).
- Tubos não circulares ou materiais não ferrosos.
- Análise estrutural (FEA) — o motor continua puramente geométrico/normativo.

## 3. Histórias de usuário

- **US-DF1.a** Como projetista, quero escolher o aço dos tubos primários e o dos
  secundários para que as regras de seção considerem as propriedades reais.
- **US-DF1.b** Como projetista usando seção fora do padrão, quero que o sistema calcule
  a equivalência de rigidez/resistência à flexão automaticamente em vez de me mandar
  fazer a conta.
- **US-DF1.c** Como capitão, quero ver no resumo qual material foi assumido, para
  conferir com o certificado de matéria-prima exigido na inspeção.

## 4. Requisitos funcionais

- **FR-DF1.1** Catálogo embutido de aços com, no mínimo: SAE 1010, 1018, 1020, 1026, 4130. Cada entrada: `id`, nome comercial, %C nominal, E [GPa], Sy [MPa],
  densidade [kg/m³]. Valores em tabela própria (não copiar texto do regulamento).
- **FR-DF1.2** Entrada "customizado": usuário informa as propriedades manualmente
  (caso de aço com certificado próprio). Validação de faixas plausíveis (ex.: E entre
  180–220 GPa) com `warn` fora delas.
- **FR-DF1.3** Seleção independente para classe primária e secundária no painel de
  configuração global (mesmo lugar de FR-2.6 hoje).
- **FR-DF1.4** O %C exibido/validado passa a derivar do material; a regra de %C mínimo
  existente consome o valor do catálogo.
- **FR-DF1.5** Regra de equivalência (B6.3.3.2) automática: rigidez à flexão `E·I` e
  resistência à flexão `Sy·I/c` da combinação material+seção comparadas às do tubo de
  referência do regulamento; `I = π/64·(od⁴ − id⁴)`, `c = od/2`. Status `pass`/`fail`
  com `measured`/`limit` preenchidos; substitui o `warn` genérico atual.
- **FR-DF1.6** Export/import JSON (FR-2.7) carrega o material por id; projetos antigos
  sem o campo importam com um default documentado (migração silenciosa, sem quebrar).

## 5. Modelo de dados (proposta)

```ts
// model/materials.ts (novo)
interface SteelMaterial {
  id: string // '1018', '4130', 'custom'
  label: string // "SAE 1018"
  carbon: number // %C nominal
  youngGPa: number // E
  yieldMPa: number // Sy
  densityKgM3: number
}
export const STEELS: SteelMaterial[]

// model/types.ts (alterações)
interface TubeSection {
  od: number
  wall: number
  materialId: string // NOVO — substitui `carbon` (deriva do material)
  custom?: SteelMaterial // presente quando materialId === 'custom'
}
```

Funções puras novas em `rules/geometry.ts` ou `model/materials.ts`:
`sectionI(s)`, `sectionArea(s)`, `bendingStiffness(s)`, `bendingStrength(s)`,
`materialOf(s): SteelMaterial`.

## 6. Módulos afetados

| Módulo                             | Mudança                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `model/types.ts`                   | `TubeSection.materialId`; remoção do campo `carbon` (com migração no import) |
| `model/materials.ts`               | novo: catálogo + funções de seção                                            |
| `rules/b6.ts`                      | regra %C consome catálogo; nova regra automática de equivalência B6.3.3.2    |
| `store.ts`                         | `setMaterial(cls, id)`, `setCustomMaterial(cls, props)`                      |
| `components/Inspector.tsx`         | seletor de material por classe + tabela de propriedades somente leitura      |
| `model/template.ts` / `builder.ts` | defaults ganham `materialId` (sugerido: '1018')                              |

## 7. UI/UX

- No bloco "Seção dos tubos" do Inspector: dropdown de material acima dos campos Ø/parede,
  um por classe. Ao lado, chip com `E`, `Sy`, `ρ` do aço escolhido.
- Selecionar "customizado" expande os três campos numéricos.
- O checklist mostra a regra de equivalência como as demais (ID, medido, limite).

## 8. Critérios de aceite

| #        | Critério                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| AC-DF1.1 | Trocar o aço primário de 1018 para 4130 mantém geometria e recalcula a equivalência sem recarregar           |
| AC-DF1.2 | Seção fora do padrão que atende E·I e Sy·I/c com 4130 vira `pass`; com 1010 vira `fail` com valores exibidos |
| AC-DF1.3 | JSON exportado antes da feature importa sem erro e assume o default documentado                              |
| AC-DF1.4 | %C do checklist reflete o material selecionado (sem campo manual)                                            |

## 9. Riscos e questões em aberto

- **Tubo de referência exato** da equivalência na Emenda 7 (dimensões e aço de referência
  do B6.3.3.2) precisa ser conferido no PDF antes de codificar limites.
- Material por membro individual (reforços em outro aço): adiar até haver demanda; o
  modelo por classe cobre o uso corrente das equipes.
- Paráfrase: a tabela de propriedades deve citar fonte metalúrgica genérica, não o texto
  do regulamento.

## 10. Plano de implementação (quando aprovada)

1. `model/materials.ts` + funções de seção (com testes de unidade do motor puro).
2. Migração de `TubeSection` (types, template, builder, import JSON).
3. Regra de equivalência no motor + ajuste da regra de %C.
4. UI do Inspector.
5. Atualizar `spec.md` (promover a FR) e `rules.md` (nova regra).
