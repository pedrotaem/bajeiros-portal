# ADR-010: Evolução da equipe — maturidade por área, dirigida por evidência

**Status:** proposto (2026-08-29 — direção de produto fixada pelo product owner no canvas
["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b);
vira "aceito" com o merge das specs DF-12…DF-16)

**Documentos de apoio:** [`specs/drafts/df13-evolucao-maturidade.md`](../../specs/drafts/df13-evolucao-maturidade.md)
(o modelo e o catálogo), [`specs/drafts/df12-shell-navegacao.md`](../../specs/drafts/df12-shell-navegacao.md),
[`specs/drafts/df14-conhecimento.md`](../../specs/drafts/df14-conhecimento.md),
[`specs/drafts/df15-comunidade-resultados.md`](../../specs/drafts/df15-comunidade-resultados.md),
[`specs/drafts/df16-inicio.md`](../../specs/drafts/df16-inicio.md),
[`docs/plano-implementacao-evolucao.md`](../plano-implementacao-evolucao.md) (fases EV) e a
pesquisa de mercado (`Pesquisa de Mercado/praticas-elite.md`, `dificuldades-por-tier.md`,
`equipes-brasil.json`, `resultados-competicoes.json`).

## Contexto

Direção de produto explícita (2026-08-29): **a gaiola não é o core do portal — a evolução das
equipes é.** Importa mais equipe usando o portal e subindo a maturidade do projeto do que
qualquer feature pontual; as ferramentas vão mudar e crescer.

O que já existe empurra na mesma direção: o validador produz 40 verificações, massa e ancoragens
por versão salva (avaliadas **no servidor**); o DF-10 entregou organograma com vagas, capitania e
trainee, e deixou como backlog o "painel de maturidade" (RF-5.7); a pesquisa de mercado mapeou 91
equipes, 18 competições de resultados públicos e um diagnóstico consistente — **rotatividade é o
problema nº 1**, iniciantes "começam do zero" a cada geração, intermediárias têm ferramenta sem
disciplina, elite opera como empresa. Falta o tecido conectivo: nada transforma as medições das
ferramentas em resposta às perguntas da capitania ("onde estamos fracos? o que fazemos agora? o
que não pode se perder na formatura?").

O canvas aprovado explorou três representações do progresso (página 2): **A** — trilha da
temporada (calendário com marcos, zera por ano); **B** — nível por área (1–5, critérios
verificáveis, acumula); **C** — fila de próximos passos (só ação, sem modelo). A decisão abaixo
registra a escolha e o que foi rejeitado.

## Decisão

Quatro decisões acopladas.

### 1. A espinha é o nível por área (opção B), com a fila (C) como superfície de ação e a temporada (A) como faixa de contexto

Seis áreas (`estrutura`, `dinamica`, `documentacao`, `fabricacao`, `gestao`, `conhecimento`) ×
níveis 1–5, cumulativos, com critérios verificáveis calibrados pela escada
iniciante → intermediária → alta performance da pesquisa. A fila de próximos passos é **derivada**
dos critérios pendentes do próximo nível (nunca um gerenciador de tarefas independente), e o
calendário aparece como faixa informativa com contagem regressiva — exatamente a composição da
tela "Equipe · Evolução" do canvas.

_Alternativas:_

- **A pura (trilha da temporada):** urgência óbvia e zero curva de aprendizado; rejeitada porque
  **zera todo ano** — o progresso de longo prazo (a resposta à rotatividade) desaparece na
  virada, e equipe fora do ciclo do calendário (recomeço no meio do ano, chassi com validade de
  2 anos) fica "atrasada" para sempre.
- **C pura (só fila):** mínimo lançável; rejeitada porque não acumula nem compara — sem noção de
  progresso não há o que celebrar, e a priorização vira caixa-preta do portal.
- **Pontos/badges/gamificação:** engajamento barato; rejeitada porque o incentivo degenera em
  farmar métrica, e badge público constrange exatamente o público-alvo (46 das 91 equipes na
  faixa iniciante).

**Melhor argumento contra a decisão:** níveis com critérios são o modelo mais caro de calibrar —
mal escritos, viram burocracia que nenhum estudante voluntário preenche, e o portal ganha a cara
de auditoria que afasta em vez de atrair. A mitigação (catálogo v1 enxuto, revisão por
temporada, piloto com 2–3 equipes reais antes de abrir) reduz mas não elimina; se o piloto
mostrar rejeição, a degradação honesta é recuar para C (a fila sobrevive sozinha) sem jogar fora
o motor.

### 2. Evidência primeiro; declaração auditável onde a ferramenta não alcança; nada crítico vem do cliente

Critério automático é satisfeito por evidência produzida **no servidor** (o `evaluate()` que já
roda ao salvar snapshot; o resumo do organograma do DF-10; os contadores do DF-14). Critério
declarado é marcado pela capitania com autor, data, nota e link, auditado em `audit_events`, e
existe porque FEA, teste de bancada e orçamento acontecem fora do portal. O modelo de confiança é
explícito: declarar mentira engana só a própria equipe — não há ranking público que pague a
trapaça.

_Alternativas:_ tudo declarado (um formulário de autoavaliação) — rejeitado: vira opinião, e
joga fora a vantagem única do portal (as ferramentas medem de verdade); tudo automático —
rejeitado: limitaria o modelo às 2 áreas instrumentadas hoje e criaria o incentivo de só medir o
que é fácil.

**Melhor argumento contra:** a assimetria auto/declarado desequilibra as áreas — Estrutura sobe
"sozinha" salvando versão, Documentação exige cerimônia de declaração; o nível deixa de ser
comparável entre áreas. Aceito e assumido: o rótulo `automático · validador` /
`declarado · fica no histórico` fica visível em cada critério, e a régua é dentro da área ao
longo do tempo, não entre áreas.

### 3. O motor é um pacote puro e versionado; recomputação honesta, quedas incluídas

`packages/evolution` no mesmo molde do motor B6: catálogo + `computeLevels()` determinístico,
testado por fixture, `catalogVersion` semântico. Critérios automáticos avaliam **a última versão
salva do projeto designado como projeto da temporada** (rascunho no editor não conta). Nível cai
quando a evidência regride — com evento explicativo na atividade. Mudança de catálogo recalcula
tudo e publica o delta por equipe; critério cuja fonte ainda não existe nasce `oculto` (fora do
denominador).

_Alternativas:_ nível-catraca (nunca cai) — rejeitado: mente sobre o estado e transforma o número
em troféu morto; avaliação sobre o estado vivo do editor — rejeitada: flutuação a cada arrasto de
nó; catálogo em banco editável por admin — rejeitado: catálogo é regra de produto, versionada e
revisada por PR como o motor B6.

**Melhor argumento contra:** queda de nível dói e pode ensinar o comportamento errado ("não salve
a versão com problema"). Mitigação parcial: a queda narra a causa e gera o passo que a reverte;
se o piloto mostrar salvamento-evitado, introduzir histerese (queda só confirmada em 2 versões) é
mudança local no motor.

### 4. Benchmark por coorte com piso; maturidade nunca é ranking público

Mediana de maturidade e de pontuação por prova calculadas por coorte de desempenho (nomes
`iniciante · intermediária · alta performance`, derivados dos resultados públicos — DF-15),
exibidas **apenas para a própria equipe** e apenas com **≥ 8 equipes ativas** na coorte. Não
existe listagem pública de maturidade, nem número de "Tier": a ambiguidade Tier-1-topo ×
Tier-1-iniciante dos dois documentos da pesquisa é resolvida abolindo o número do produto.

**Melhor argumento contra:** sem comparação pública, perde-se o efeito de emulação ("quero ser
como a FEI") que motiva. Resposta: a comparação pública que o portal oferece é a de
**resultados** (que já são públicos); maturidade é instrumento interno de gestão — misturar os
dois transformaria autoavaliação em marketing e destruiria a honestidade do dado.

## Consequências

- Nasce o módulo `evolution` (API), o pacote `packages/evolution` (motor puro), 5 tabelas novas
  (migração 0005) e três produtores de evidência plugados em `projects`, `teams` e no futuro
  módulo `knowledge`. Contratos ODCS novos com PII mínima (atores), base legal contrato.
- O shell reorganiza-se em torno da evolução (DF-12): PageIds novos, Editor sob Ferramentas —
  sem tocar a montagem do `<Viewport>` (ADR-009 dec. 4 permanece).
- Toda ferramenta futura entra com a pergunta "que critério ela alimenta?" — o mapa
  "Alimenta · <área>" do hub é contrato de produto, não decoração.
- Custo permanente: calibração do catálogo por temporada (governança DF-13 §9) e curadoria dos
  dados de comunidade (DF-15). São horas de gente, não de máquina — orçadas no plano.
- Riscos aceitos, monitorados no piloto: adoção fria do diário (DF-14 P-1.x), fila percebida
  como cobrança (DF-13 P-3.2), assimetria auto/declarado (dec. 2), queda de nível
  desincentivando salvamento (dec. 3).
