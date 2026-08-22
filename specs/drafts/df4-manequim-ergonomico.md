# DF-4 — Manequim ergonômico do piloto (monoposto)

- **Status:** ✅ **v1 IMPLEMENTADA** (2026-08-16) — promovida a US-11/FR-11.x em [spec.md](../spec.md). Testes: `src/model/manikin.test.ts`.
  - §9 resolvido: fonte adotada = modelo proporcional de Drillis & Contini (1966) com estaturas de referência de tabelas públicas (tabela própria, fonte citada na UI); faixas articulares de §3 mantidas como proposta declarada "recomendação, não norma". H-point: z = Geraldão + 90 mm (aproximação documentada). v2 (3D volumétrico, folgas automáticas B6.1.x) segue em aberto.
- **Ordem de desenvolvimento:** 6ª (maior feature do lote; depois do núcleo de fabricação)
- **Dependências:** DF-3 ✅ (padrão as-built: componente próprio em `components/`, flag de UI no store (`showGeraldao`), botão na `viewport-toolbar` do App, meshes com `raycast` nulo e material translúcido `depthWrite:false`) · **Desbloqueia:** DF-5 (zona recomendada do volante), futuras regras automáticas de folga (B6.1.x)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)
- **Literatura de apoio:** TCC "Bancada ergonômica para veículos Baja SAE" (UnB, 2021) — ver `revisao-bibliografica-gaiolas-baja.md` §I.9

## 1. Contexto e motivação

A gaiola de um monoposto é desenhada **ao redor do piloto**: altura do RHO, avanço dos
membros C, posição do SHC, comprimento do habitáculo e os pontos de pedaleira/volante
derivam do corpo acomodado com ângulos de conforto. O portal valida folgas normativas
(via Geraldão/itens manuais), mas não ajuda a **projetar** a posição de pilotagem. Um
manequim paramétrico com faixas antropométricas (ex.: mulher P5 → homem P95) e ângulos
ergonômicos recomendados permite dimensionar o habitáculo para a faixa real de pilotos
da equipe — não para um único corpo.

## 2. Objetivos e não-objetivos

**Objetivos**

- Manequim articulado 2D no plano de simetria (v1), com segmentos dimensionados por
  percentil antropométrico selecionável.
- Ângulos articulares editáveis dentro de faixas ergonômicas recomendadas, com defaults.
- Modo "faixa": exibir dois manequins simultâneos (menor e maior percentil selecionados)
  para projetar o envelope.
- Toggle de visualização independente do Geraldão (DF-3); coexistência permitida.

**Não-objetivos (v1)**

- Manequim 3D volumétrico (necessário para folgas laterais — v2).
- Regras automáticas de folga capacete×RHO etc. (v2, substituindo itens manuais atuais).
- Alcance de comandos além do volante (câmbio, painel).

## 3. Modelo ergonômico

Cadeia cinemática 2D no plano x = 0, ancorada no **H-point** (quadril), derivado de
`seatBottomY` + espessura de assento parametrizável:

```
pé — tornozelo — joelho — quadril (H-point) — tronco — ombro — cotovelo — punho
                                            └ pescoço — cabeça (com capacete)
```

Parâmetros por segmento (comprimentos) vêm da **tabela antropométrica por percentil**;
articulações têm **faixas recomendadas** (valores exatos a fixar com fonte citável — §9):

| Articulação                 | Faixa recomendada (proposta inicial) |
| --------------------------- | ------------------------------------ |
| Tronco–encosto (reclinação) | 10–25° da vertical                   |
| Tronco–coxa (quadril)       | 95–120°                              |
| Joelho                      | 100–140°                             |
| Tornozelo                   | 90–110°                              |
| Ombro (flexão do braço)     | 10–45°                               |
| Cotovelo                    | 100–140°                             |

A cabeça inclui raio adicional de capacete (parametrizável) — é a referência para folga
superior futura.

## 4. Requisitos funcionais

- **FR-DF4.1** Tabela antropométrica embutida com percentis selecionáveis (mínimo:
  F-P5, F-P50, M-P50, M-P95; extensível), com fonte citada na UI. Estatura e massa
  exibidas para conferência.
- **FR-DF4.2** Seleção de **faixa de projeto**: percentil mínimo e máximo; o viewport
  exibe os dois manequins sobrepostos (cores distintas, translúcidos).
- **FR-DF4.3** Ângulos editáveis por sliders limitados à faixa recomendada; sair da faixa
  é permitido com aviso visual (âmbar) — ergonomia é recomendação, não norma.
- **FR-DF4.4** Posicionamento: H-point a partir da base do assento; ponto do calcanhar
  calculado da cadeia (informa onde a pedaleira deveria estar); pontos notáveis expostos:
  H-point, ombro, punho, topo do capacete, calcanhar.
- **FR-DF4.5** Toggle "Mostrar piloto" independente de DF-3; manequim não captura cliques
  (mesma regra do FR-DF3.3).
- **FR-DF4.6** A configuração do manequim (percentis, ângulos, espessura de assento,
  capacete) **vai para o JSON** do projeto (diferente do toggle, que é UI) — a posição de
  pilotagem é decisão de projeto.
- **FR-DF4.7** Leituras derivadas no painel: distância H-point→calcanhar, altura do topo
  do capacete, alcance do punho (entrada do DF-5).
- **FR-DF4.8** Nenhuma regra B6 muda de resultado nesta v1 (informativo/projetual).

## 5. Modelo de dados (proposta)

```ts
// model/manikin.ts (novo)
interface AnthroProfile { id: string; label: string; statureMm: number; segments: Record<SegmentId, number> }
interface ManikinConfig {
  profileMin: string; profileMax: string
  angles: Record<JointId, number>       // defaults por perfil; override do usuário
  seatPadMm: number; helmetRadiusMm: number
}
solveManikin(cfg, profile, seatBottomY): Record<LandmarkId, Vec3>  // cadeia 2D → pontos no plano x=0

// model/types.ts
interface Cage { /* ... */ manikin?: ManikinConfig }
```

## 6. Módulos afetados

| Módulo                     | Mudança                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `model/manikin.ts`         | novo: tabela, cadeia cinemática, landmarks                  |
| `model/types.ts`           | `Cage.manikin`                                              |
| `store.ts`                 | `setManikin(...)`, flag de visualização                     |
| `components/Manikin.tsx`   | novo: renderização (cápsulas/segmentos 2D extrudados finos) |
| `components/Inspector.tsx` | seção "Piloto": percentis, sliders de ângulo, leituras      |
| `components/Viewport.tsx`  | render condicional                                          |

## 7. UI/UX

- Seção "Piloto" no painel: dois dropdowns (percentil menor/maior), sliders com a faixa
  recomendada demarcada em verde e a zona de aviso em âmbar, leituras derivadas.
- Manequins em cores neutras distintas (ex.: verde-acinzentado P-máx, ocre P-mín),
  translúcidos, sempre atrás dos tubos em prioridade de clique.
- Tooltip por articulação com o racional da faixa ("joelho 100–140°: conforto e força de
  frenagem").

## 8. Critérios de aceite

| #        | Critério                                                                                    |
| -------- | ------------------------------------------------------------------------------------------- |
| AC-DF4.1 | Selecionar M-P95 vs F-P5 muda visivelmente estatura e alcances; leituras batem com a tabela |
| AC-DF4.2 | Modo faixa exibe ambos simultaneamente sem custo perceptível de frame rate                  |
| AC-DF4.3 | Slider fora da faixa recomendada mostra aviso âmbar mas não bloqueia                        |
| AC-DF4.4 | Alterar `seatBottomY` move os manequins coerentemente                                       |
| AC-DF4.5 | JSON round-trips a configuração; projetos antigos importam sem manequim                     |
| AC-DF4.6 | Checklist B6 idêntico com manequim ligado ou desligado                                      |

## 9. Riscos e questões em aberto

- **Fonte antropométrica citável:** definir a tabela (candidatas: dados antropométricos
  públicos tipo ANSUR/DINED, literatura de ergonomia veicular, e o TCC da UnB §I.9 como
  guia de aplicação a Baja). Mesma cautela de paráfrase: construir tabela própria com
  fonte citada, não copiar tabela protegida.
- **Faixas de ângulo:** os valores de §3 são proposta inicial; fixar com fonte antes de
  implementar.
- 2D vs 3D: v1 2D resolve ângulos e comprimentos (o que a feature pede); folgas laterais
  (ombro×SIM) exigem v2 3D — decisão consciente de escopo.
- Interação com o Geraldão: são referências distintas e podem divergir; exibir ambas é
  informativo, não conflito.

## 10. Plano de implementação (quando aprovada)

1. Levantamento das fontes (antropometria + ângulos) e fechamento da tabela.
2. `model/manikin.ts` puro com testes (perfil sintético → landmarks conhecidos).
3. Render + UI de configuração.
4. Modo faixa (2 manequins) e leituras derivadas.
5. Atualizar `spec.md`; preparar interfaces para DF-5 (ponto do punho).
