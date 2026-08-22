# DF-2 — Estimativa de peso final da gaiola

- **Status:** ✅ **v1 + v2 IMPLEMENTADAS** (2026-08-16) — promovida a US-7/FR-7.x em [spec.md](../spec.md). Testes: `src/model/mass.test.ts` (+ v2 em `continuity.test.ts` e `joints.test.ts`). v2: passagem contínua (DF-6) desconta junta; `weightParams.weldPerMmG` definido usa o cordão real do DF-7 (FR-DF2.5/AC-DF2.5 ✔).
- **Ordem de desenvolvimento:** 2ª (v1, logo após DF-1) · v2 após DF-6/DF-7
- **Dependências:** DF-1 (densidade do material — obrigatória) · DF-6 (desconta emendas contínuas — v2) · DF-7 (massa de solda por mm de cordão — v2)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

Massa é o segundo critério de projeto da gaiola depois da conformidade: a literatura de
equipes trata o conflito rigidez × massa como central. Hoje o portal valida geometria mas
não informa quanto a gaiola vai pesar. Com Ø, parede (já existentes) e densidade (DF-1),
a massa dos tubos é derivável da própria geometria. As **conexões soldadas** adicionam
massa real (metal de adição, e eventualmente luvas/gussets) — o número de juntas é
derivável do grafo de membros.

## 2. Objetivos e não-objetivos

**Objetivos**

- Massa estimada em tempo real: total, por classe (primário/secundário) e por membro.
- Contar juntas soldadas e somar o acréscimo de massa correspondente.
- Mostrar o impacto de massa na análise de redundância (US-3): "remover este tubo economiza X g".

**Não-objetivos**

- Massa de componentes não estruturais (assento, cintos, painéis, powertrain).
- Centro de gravidade / distribuição de massa (evolução natural, mas fora deste draft).
- Precisão de balança: é uma **estimativa** declarada como tal na UI.

## 3. Fases

- **v1 (após DF-1):** massa dos tubos + juntas contadas por nó compartilhado, acréscimo
  fixo parametrizável por junta.
- **v2 (após DF-6/DF-7):** nós de passagem contínua não contam como junta; massa de solda
  proporcional ao comprimento real da linha de contato (g/mm de cordão).

## 4. Requisitos funcionais

- **FR-DF2.1** Massa de cada membro: `dist(a, b) × área da seção × densidade` — seção e
  densidade da classe do membro (DF-1). Exibida no painel do membro selecionado.
- **FR-DF2.2** Junta soldada (v1): todo nó com ≥ 2 membros incidentes conta 1 junta;
  nós de grau ≥ 3 contam `grau − 1` juntas (cada tubo que chega ao nó além do primeiro
  é uma solda). Acréscimo default por junta parametrizável na configuração global
  (proposta inicial: 30 g/junta, a calibrar — ver §9).
- **FR-DF2.3** Resumo permanente: bloco "Massa estimada" no painel lateral com total [kg],
  breakdown primário/secundário/solda e nº de juntas. Atualização síncrona (FR-1.1).
- **FR-DF2.4** Análise de redundância (US-3): o veredito de cada membro passa a incluir a
  massa que a remoção economiza (tubo + juntas que deixam de existir).
- **FR-DF2.5** v2: nó marcado como passagem contínua (DF-6) não soma junta de topo; massa
  de solda de cada junta = comprimento da linha de contato (DF-7) × g/mm parametrizável.
- **FR-DF2.6** O JSON exportado inclui os parâmetros de estimativa (g/junta, g/mm) para
  reprodutibilidade.

## 5. Modelo de dados (proposta)

```ts
// model/types.ts
interface Cage {
  // ...existente
  weightParams?: {
    weldPerJointG: number   // v1 — default 30
    weldPerMmG?: number     // v2 — usado quando DF-7 disponível
  }
}

// model/mass.ts (novo, função pura como o motor de regras)
interface MassReport {
  totalKg: number
  primaryKg: number
  secondaryKg: number
  weldKg: number
  jointCount: number
  perMember: Record<string, number>  // g por membro
}
estimateMass(cage: Cage): MassReport
```

`estimateMass` segue os princípios do motor (design.md §1): pura, síncrona, tolerante a
modelo parcial. `removalImpact` ganha irmã `removalMassDelta(cage, memberId)`.

## 6. Módulos afetados

| Módulo                     | Mudança                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `model/mass.ts`            | novo: `estimateMass`, `removalMassDelta`                         |
| `model/types.ts`           | `Cage.weightParams`                                              |
| `store.ts`                 | `setWeightParams`                                                |
| `components/Inspector.tsx` | bloco "Massa estimada"; massa no painel do membro; campo g/junta |
| `App.tsx`                  | `useMemo` de `estimateMass` ao lado de `evaluate`                |

## 7. UI/UX

- Bloco "Massa estimada" logo abaixo da faixa de status: valor total em destaque
  (ex.: "23,4 kg"), breakdown em linhas menores, ícone de informação com o texto
  "estimativa geométrica — não substitui pesagem".
- No membro selecionado: "massa: 512 g · remoção economiza 574 g (tubo + 2 juntas)".
- Toggle de redundância (FR-3.3) ganha ordenação opcional por massa economizada.

## 8. Critérios de aceite

| #        | Critério                                                                         |
| -------- | -------------------------------------------------------------------------------- |
| AC-DF2.1 | Gaiola do template: massa total confere com cálculo manual de referência (±1%)   |
| AC-DF2.2 | Trocar material 1018 → 4130 (DF-1) altera a massa conforme a razão de densidades |
| AC-DF2.3 | Adicionar um membro entre dois nós existentes aumenta massa de tubo + 2 juntas   |
| AC-DF2.4 | Membro redundante selecionado exibe a economia de massa da remoção               |
| AC-DF2.5 | (v2) Marcar nó como passagem contínua reduz o nº de juntas e a massa de solda    |

## 9. Riscos e questões em aberto

- **Calibração do g/junta e g/mm:** coletar dados reais de equipes (massa pesada vs
  estimada) — candidato a conteúdo colaborativo da fase comunidade.
- Dobras: membros são retos entre `a` e `b`; cadeias com nó de dobra somam os segmentos
  naturalmente. Sem raio real de curvatura, o erro é desprezível para estimativa.
- Gussets/luvas de reforço não são modelados; declarar exclusão na UI.

## 10. Plano de implementação (quando aprovada)

1. `model/mass.ts` com testes de unidade (gaiola sintética de massa conhecida).
2. Integração no `App` + bloco de UI.
3. Extensão da análise de redundância.
4. v2 quando DF-6/DF-7 aterrissarem (interfaces já previstas em `weightParams`).
