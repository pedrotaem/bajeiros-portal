# DF-7 — Detecção de juntas entre tubos: linha de solda e boca de lobo

- **Status:** ✅ **IMPLEMENTADA** (2026-08-16) — promovida a US-10/FR-10.x em [spec.md](../spec.md); regra JOINT.X em [rules.md](../rules.md) §6. Testes: `src/model/joints.test.ts`.
  - Desvios/decisões: extremidade encostada no corpo de outro tubo (dist ao eixo ≤ r+5 mm) é tratada como junta T/Y real, não colisão (cobre LDB/USM/ASB do template); eixos com offset usam o mesmo perfil concorrente (aprox. v1); painel de juntas vive como seção do Inspector (sem componente separado); export = SVG 1:1 por extremidade (lote paginado e DXF ficam como evolução); double-cope K/N segue só com aviso.
  - AC-DF7.2 (validação física impressa) pendente de teste com tubo real; matemática validada contra caso analítico 90°.
- **Ordem de desenvolvimento:** 5ª (após DF-6; consome seções de DF-1)
- **Dependências:** DF-6 (quem é contínuo define quem recebe o corte) · DF-1 (Ø/parede por classe já existem; material completa o contexto) · **Desbloqueia:** DF-2 v2 (g/mm de cordão)
- **Documentos:** [índice de drafts](../draft-features.md) · [spec.md](../spec.md) · [design.md](../design.md)

## 1. Contexto e motivação

Na fabricação, cada extremidade de tubo que encosta em outro precisa de um corte côncavo
("boca de lobo" / fishmouth / cope) que casa com a superfície cilíndrica do tubo de
destino; a solda percorre a **curva de contato** entre os dois cilindros. Hoje o portal
conhece apenas o grafo de linhas de centro. Detectar e caracterizar as juntas permite:
(a) medir o comprimento total de cordão de solda (alimenta DF-2 v2); (b) gerar o gabarito
de corte de cada boca de lobo, imprimível em escala 1:1 — valor prático direto para a
oficina da equipe.

## 2. Objetivos e não-objetivos

**Objetivos**

- Detectar automaticamente onde tubos se conectam (nó compartilhado) ou se cruzam
  (proximidade entre eixos sem nó).
- Classificar cada junta (topo, T, Y, K/N, cruzamento) considerando continuidade (DF-6).
- Calcular a curva de interseção cilindro-cilindro e seu comprimento por junta e total.
- Gerar o desenvolvimento planificado (gabarito) da boca de lobo por extremidade.

**Não-objetivos**

- Simulação/qualidade de solda (penetração, cordão, ZTA) — fora do domínio do portal.
- Chanfros de topo (emendas DF-6 têm corte reto; só registrar o perímetro como cordão).
- Modelagem sólida completa dos tubos no viewport (a cena continua com cilindros simples).

## 3. Conceito geométrico

Para dois tubos A (raio `ra`) e B (raio `rb`, `rb ≤ ra`) com eixos concorrentes em ângulo
θ, a curva de contato é a interseção das superfícies cilíndricas (curva de sela).
Parametrizando a circunferência de B por φ ∈ [0, 2π):

- A curva 3D é obtida projetando cada geratriz de B até a superfície de A (fórmula
  clássica de cope; solução fechada para eixos concorrentes, numérica para eixos com
  offset — cruzamentos sem nó comum).
- O **desenvolvimento** planifica: abscissa = `rb·φ` (perímetro desenrolado), ordenada =
  avanço axial da geratriz até a superfície de A. Resultado: curva 2D imprimível que,
  enrolada no tubo B, marca o corte.
- Comprimento da linha de contato: integração numérica da curva 3D (soma de cordas com
  passo em φ; erro < 0,5% com 96 amostras).

Casos: **T/Y** (B morre em A: 1 boca de lobo em B); **K/N** (2 tubos morrem no mesmo
trecho de A: 2 bocas, com aviso se as curvas se sobrepõem); **topo** (emenda descontínua
DF-6: corte reto, cordão = perímetro); **cruzamento com passagem** (eixos próximos sem nó:
aviso — fisicamente os tubos colidem ou exigem recorte especial).

## 4. Requisitos funcionais

- **FR-DF7.1** Detecção por nó: para cada nó, o membro contínuo (DF-6) ou de maior Ø é o
  **tubo de destino**; os demais recebem boca de lobo contra ele. Sem continuidade
  declarada e Ø iguais, prioridade por classe (primário é destino) e desempate estável
  por id (determinístico).
- **FR-DF7.2** Detecção por proximidade: pares de membros sem nó comum cuja distância
  entre segmentos de eixo < `ra + rb` geram **aviso de colisão** (`warn` interno `JOINT.X`),
  com a distância medida — não são junta válida até o usuário criar nó ou afastar.
- **FR-DF7.3** Painel "Juntas": lista navegável (nó, tipo T/Y/K/topo, membros, ângulo θ,
  comprimento de cordão); clicar destaca os membros no 3D (mesmo mecanismo de FR-1.3).
- **FR-DF7.4** Total de cordão de solda (mm) exposto para DF-2 v2 e exibido no resumo.
- **FR-DF7.5** Gabarito de boca de lobo por extremidade: desenho 2D do desenvolvimento
  com identificação (membro, nó, Ø/parede, ângulo, direção de referência "linha de dorso"),
  exportável em **SVG em escala 1:1** (unidade mm); lote "todas as juntas" num único
  documento paginado para impressão.
- **FR-DF7.6** Avisos de fabricação: θ < 30° (boca de lobo excessivamente longa — cordão
  e recorte crescem com 1/sin θ) e nó com > 4 tubos convergentes (acesso de solda).
- **FR-DF7.7** Tolerância a modelo parcial e recomputação síncrona, como o motor de
  regras (design.md §1).

## 5. Modelo de dados (proposta)

Nenhuma mudança em `Cage` (tudo é derivado da geometria + DF-6 + seções DF-1).

```ts
// model/joints.ts (novo, puro)
interface Joint {
  node: NodeId | null            // null = cruzamento por proximidade (FR-DF7.2)
  kind: 'butt' | 'tee' | 'wye' | 'kn' | 'crossing'
  target: string                 // membro de destino
  coped: string[]                // membros que recebem boca de lobo
  angleDeg: number
  contactLenMm: number
}
detectJoints(cage: Cage): Joint[]
copeProfile(cage, memberId, node): { phi: number; axial: number }[]  // curva planificada
copeSvg(cage, memberId, node): string                                // gabarito 1:1
```

## 6. Módulos afetados

| Módulo                      | Mudança                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `model/joints.ts`           | novo: detecção, classificação, curva, desenvolvimento, SVG                 |
| `rules/geometry.ts`         | distância segmento-segmento (novo primitivo), interseção cilindro-cilindro |
| `components/JointPanel.tsx` | novo: lista de juntas + export de gabaritos                                |
| `components/Inspector.tsx`  | aba/section "Juntas"; botão de gabarito no membro selecionado              |
| `App.tsx`                   | `useMemo` de `detectJoints`; entrega do total a DF-2                       |

## 7. UI/UX

- Nova seção "Juntas & solda" no painel: contagem por tipo, total de cordão, lista.
- Membro selecionado: "extremidade em B_L: boca de lobo contra RRH_L (θ = 54°) — baixar
  gabarito SVG".
- Gabarito SVG: curva de corte, linha de dorso (φ = 0) marcada, texto de identificação e
  régua de verificação de escala (barra de 100 mm) para conferir a impressão.

## 8. Critérios de aceite

| #        | Critério                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AC-DF7.1 | Junta T a 90° entre tubos iguais: desenvolvimento reproduz a curva clássica de sela; cordão ≈ perímetro teórico da interseção (±1%) |
| AC-DF7.2 | Junta a 45°: gabarito alongado conforme 1/sin θ; imprimir e enrolar num tubo real casa o corte (validação física)                   |
| AC-DF7.3 | Nó com montante contínuo (DF-6) + travessa: a travessa recebe a boca de lobo, nunca o montante                                      |
| AC-DF7.4 | Dois membros que se cruzam sem nó a < ra+rb geram aviso com distância medida                                                        |
| AC-DF7.5 | Barra de escala do SVG mede 100 mm quando impresso em 100%                                                                          |
| AC-DF7.6 | Total de cordão bate com a soma das juntas listadas                                                                                 |

## 9. Riscos e questões em aberto

- **Eixos com offset** (não concorrentes de fato, por arredondamento a 1 mm): tratar
  concorrência com tolerância (ex.: 2 mm) e usar solução numérica além dela.
- **Dobras junto à junta:** usar o **segmento local** (direção do membro incidente ao nó),
  não a corda total da cadeia — decisão já compatível com o modelo (membros retos).
- Formato de export: SVG 1:1 primeiro; PDF paginado e DXF ficam como evolução (avaliar
  demanda — DXF interessa a quem tem corte CNC).
- Sobreposição de bocas de lobo em nós K/N muito fechados: v1 apenas avisa; recorte
  combinado (double cope) fica para v2.

## 10. Plano de implementação (quando aprovada)

1. Primitivos geométricos (segmento-segmento; interseção cilindro-cilindro com testes
   contra casos analíticos: 90°, tubos iguais, rb→0).
2. `detectJoints` + classificação com DF-6.
3. Desenvolvimento planificado + gerador SVG (com barra de escala).
4. UI (painel de juntas + export).
5. Integração com DF-2 v2 e atualização de `spec.md`/`rules.md` (JOINT.X).
