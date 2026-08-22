# DF-3 — Geraldão no cockpit (toggle de visualização)

- **Status:** ✅ **IMPLEMENTADA** (2026-08-16) — promovida a US-8/FR-8.x em [spec.md](../spec.md).
  - Cotas extraídas da Emenda 7 (§9 resolvido): o regulamento define o gabarito pelas medidas que ele verifica — R102 tangente assento/encosto, 737 mm @ 686 mm (B6.2.4.3), ≥ 1041 mm e ≥ 305 mm p/ pontos C (B6.2.7.4/7.5). Orientação: posição única derivada do ponto (hipótese confirmada; sem inclinação configurável no texto).
  - Modelo geométrico adotado: assento horizontal em y do ponto, encosto vertical 102 mm atrás; malha própria (mastro + travessas de medição), não cópia da figura.
  - Toggle na barra do viewport (novo componente `viewport-toolbar`), junto do toggle de redundância (movido para lá também). AC-DF3.1/3.2 garantidos por construção (nenhuma regra lê o flag; `raycast` nulo). Validação visual em browser pendente de sessão manual.
- **Ordem de desenvolvimento:** 3ª (independente, baixo risco, alto valor visual)
- **Dependências:** nenhuma (usa `cage.geraldao` e `seatBottomY` já existentes) · **Desbloqueia:** padrão de "manequim visual" reutilizado por DF-4
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

O regulamento define o gabarito "Geraldão" para verificação do habitáculo; hoje o modelo
guarda apenas o **ponto** de referência (interseção do círculo R102 tangente ao assento e
encosto, B6.2.4.3) como `cage.geraldao: Vec3`, usado por regras de distância. O usuário
não vê o volume que o gabarito ocupa — e várias decisões de geometria (altura do RHO,
avanço dos membros C, posição do SHC) são guiadas por ele. Exibir o Geraldão posicionado
dentro da gaiola transforma verificações abstratas em percepção visual imediata.

## 2. Objetivos e não-objetivos

**Objetivos**

- Renderizar o gabarito Geraldão em 3D, na posição correta derivada da configuração atual.
- Ligar/desligar via botão/flag sem nenhum efeito sobre regras ou seleção.

**Não-objetivos**

- Regras automáticas de interferência Geraldão × tubos (evolução prevista, ver §9).
- Substituir o manequim ergonômico (DF-4) — são objetos distintos: o Geraldão é o
  gabarito normativo; o manequim é ferramenta de projeto.

## 3. Histórias de usuário

- **US-DF3.a** Como projetista, quero ver o Geraldão dentro da gaiola para julgar folgas
  visualmente enquanto movo tubos.
- **US-DF3.b** Como capitão, quero ligar o Geraldão em uma revisão de projeto para
  discutir o habitáculo com a equipe.

## 4. Requisitos funcionais

- **FR-DF3.1** Geometria do gabarito construída conforme as dimensões do regulamento
  (levantar cotas exatas na Emenda 7 — ver §9), parametrizada a partir de:
  ponto do Geraldão (Y/Z da configuração global), base do assento (`seatBottomY`) e
  plano de simetria x = 0.
- **FR-DF3.2** Toggle "Mostrar Geraldão" na barra de ferramentas do viewport (junto do
  toggle de redundância). Estado de **UI** (não vai para o JSON do projeto).
- **FR-DF3.3** Renderização semitransparente (opacidade ~0,35), cor neutra distinta das
  cores de status; `raycast` desabilitado — o gabarito nunca captura cliques nem
  interfere na seleção (FR-2.1) ou no arrastar (FR-2.8).
- **FR-DF3.4** O gabarito acompanha em tempo real alterações do ponto do Geraldão e da
  base do assento feitas na configuração global.
- **FR-DF3.5** Nenhum `RuleResult` é alterado pela existência/visibilidade do gabarito.

## 5. Modelo de dados (proposta)

Nenhuma mudança em `Cage`. Estado de visualização no store:

```ts
// store.ts
interface UiState {
  // ...existente (toggle de redundância etc.)
  showGeraldao: boolean // default false
}
```

```ts
// components/Geraldao.tsx (novo)
// Recebe { geraldao, seatBottomY } e monta a malha do gabarito
// (perfil 2D no plano de simetria + extrusão/revolução conforme as cotas do regulamento).
```

## 6. Módulos afetados

| Módulo                    | Mudança                              |
| ------------------------- | ------------------------------------ |
| `store.ts`                | flag `showGeraldao`                  |
| `components/Geraldao.tsx` | novo: malha do gabarito              |
| `components/Viewport.tsx` | renderiza `<Geraldao/>` quando ativo |
| `App.tsx` ou toolbar      | botão de toggle                      |

## 7. UI/UX

- Botão com ícone/label "Geraldão" no mesmo grupo do toggle teal de redundância; estado
  ativo destacado.
- Tooltip: "Gabarito de habitáculo do regulamento (B6.2.4.3) — visualização apenas".
- Cor sugerida: cinza-azulado translúcido, para não competir com vermelho (infração),
  azul (destaque) e teal (redundância).

## 8. Critérios de aceite

| #        | Critério                                                                        |
| -------- | ------------------------------------------------------------------------------- |
| AC-DF3.1 | Toggle liga/desliga o gabarito sem alterar nenhum resultado do checklist        |
| AC-DF3.2 | Clicar "através" do gabarito seleciona o tubo/nó atrás dele                     |
| AC-DF3.3 | Alterar Y/Z do ponto do Geraldão na configuração move o gabarito em tempo real  |
| AC-DF3.4 | Gabarito é visível de qualquer ângulo de câmera com tubos legíveis através dele |

## 9. Riscos e questões em aberto

- **Cotas do gabarito:** as dimensões completas do Geraldão na Emenda 7 (seções B6.1.x /
  anexos, pág. 33–53 do PDF) precisam ser extraídas antes de modelar; a paráfrase se
  aplica ao desenho também (construir a malha própria, não copiar figura do regulamento).
- **Orientação:** confirmar se o gabarito tem inclinação configurável (encosto) ou
  posição única derivada do ponto R102; hipótese atual: posição única.
- Evolução prevista: regra automática `GER.1` de interferência gabarito × tubos
  (distância mínima), reaproveitando as primitivas de `rules/geometry.ts`.

## 10. Plano de implementação (quando aprovada)

1. Extrair cotas do gabarito do PDF (tarefa de leitura normativa, sem código).
2. `Geraldao.tsx` com malha paramétrica + flag no store + toggle.
3. Validação visual contra as figuras do regulamento.
4. Atualizar `spec.md` (promover a FR do grupo de visualização).
