# ADR-011: Patentes do protótipo — gamificação derivada, opt-in e autodeclarativa na v1

**Status:** proposto (2026-08-30 — direção fixada pelo product owner no canvas
["Patentes da Estrada"](https://claude.ai/code/artifact/aca0d047-5859-43fd-9b58-5e07d3a7d921);
vira "aceito" com o merge das specs DF-18…DF-20)

**Emenda o [ADR-010](010-evolucao-maturidade.md)** — decisão 1 (que rejeitava gamificação em uma
linha) e decisão 2 (que ordenava evidência antes de declaração). As decisões 3 e 4 do ADR-010
permanecem inteiras.

**Documentos de apoio:** [`specs/drafts/df18-patentes-prototipo.md`](../../specs/drafts/df18-patentes-prototipo.md)
(a escada, as travas, o opt-in), [`df19-catalogo-maturidade.md`](../../specs/drafts/df19-catalogo-maturidade.md)
(o catálogo detalhado em modo autodeclarativo),
[`df20-afericao-declaracoes.md`](../../specs/drafts/df20-afericao-declaracoes.md) (a saída do
autodeclarativo).

## Contexto

O ADR-010 escolheu o nível por área como espinha do produto e rejeitou gamificação numa linha:

> **Pontos/badges/gamificação:** engajamento barato; rejeitada porque o incentivo degenera em
> farmar métrica, e badge público constrange exatamente o público-alvo (46 das 91 equipes na faixa
> iniciante).

O lote DF-12…DF-16 foi implementado sobre essa decisão e entregou um modelo correto e frio.
"2,2 / 5" é preciso e ninguém conta para ninguém. A pesquisa de mercado mostra que a motivação
destas equipes é concreta e comparativa: elas se descrevem pelo carro que conseguiram construir.

Duas coisas mudaram desde então:

1. **O product owner trouxe uma escada nomeada** — oito veículos de _Mad Max: Fury Road_, do
   improvisado ao refinado — em que a ordem já carrega a leitura de maturidade sem legenda.
2. **O acervo do DF-15 está no portal.** Resultados públicos de 18 competições permitem uma
   validação externa que o modelo do DF-13 não tinha: o portal pode parar de julgar sozinho a
   partir de certo ponto.

Ao mesmo tempo, uma decisão de escopo apertou o problema: **na v1 a avaliação será
autodeclarativa** (o catálogo v1.0.0 é misto, e a assimetria entre áreas instrumentadas e não
instrumentadas atrapalha mais do que ajuda no começo). Isso enfraquece exatamente a defesa que o
ADR-010 tinha contra o _gaming_.

## Decisão

Quatro decisões acopladas.

### 1. Gamificação é aceita numa forma estreita: representação nomeada, derivada e sem métrica própria

A patente 1–8 é **função dos níveis que o DF-13 já calcula**, mais uma trava de competição. Não
existe número próprio, não existe pontuação, não existe moeda.

Continuam **rejeitados**, e a rejeição do ADR-010 vale integralmente para eles: pontos, moedas,
sequências de dias (_streaks_), níveis de usuário individual e qualquer listagem pública ordenada
de equipes por maturidade.

O que responde às duas objeções originais do ADR-010:

- _"o incentivo degenera em farmar métrica"_ — não há moeda para farmar. A patente é derivada; se
  o modelo de maturidade sumir, ela some junto. Subir de patente **é** fazer o trabalho. E das
  patentes 4 a 1, farmar exigiria falsificar um resultado público.
- _"badge público constrange quem mais precisa"_ — a patente é **privada por padrão**, com vitrine
  opcional que a capitania liga. A dec. 4 do ADR-010 (maturidade nunca é ranking público) sobrevive
  inteira: nenhuma listagem ordenada existe, e não é pendência.

_Alternativas:_ manter a rejeição integral — descartada porque deixa o produto sem nenhuma
superfície que a equipe queira mostrar, e a adesão é o problema real desta fase; gamificação plena
com pontos e ranking — descartada pelos motivos originais, que continuam válidos.

**Melhor argumento contra:** um emblema é intrinsecamente mais desejável que uma barra, e desejo
distorce resposta. Com a v1 autodeclarativa (decisão 3), a distorção tem caminho livre por pelo
menos uma temporada. Aceito com três amortecedores — piso por área, privacidade por padrão e o
compromisso de que a aferição do DF-20 entra na temporada seguinte — e monitorado no piloto pela
proporção de critérios declarados que a evidência contradiz.

### 2. A unidade avaliada é o protótipo, e a avaliação é opt-in da capitania

A patente pertence ao **protótipo da temporada**, não à equipe em abstrato e nunca a uma pessoa.
Usuário sem equipe não tem protótipo avaliado nem patente.

E nada disso existe até a capitania **ativar**. Antes da ativação a aba Evolução mostra um painel
que explica o que será lido e pede autorização; o ato fica em `audit_events`, é reversível e não
apaga nada ao ser desligado.

_Por quê:_ medir sem pedir transforma ferramenta em auditoria — o risco nº 1 que o próprio ADR-010
registrou ("o portal ganha a cara de auditoria que afasta em vez de atrair"). Pedindo, a equipe que
entra quis ser medida, e **a taxa de ativação vira o primeiro sinal honesto** de que o modelo serve
para alguém. Um modelo que ninguém liga é um modelo respondido.

_Alternativas:_ avaliação ligada para todos — descartada pelo motivo acima; opt-in por membro —
descartada porque a unidade avaliada é o protótipo da equipe, e uma avaliação que existe para
metade do time não é comparável nem conversável.

**Melhor argumento contra:** opt-in pode simplesmente não ser ligado, e aí não há dado nenhum para
calibrar o catálogo — que já era o risco nº 1 do ADR-010. Mitigação: a ativação é **retroativa**,
lendo o que a equipe já produziu e devolvendo nível e patente na hora, para que a primeira tela
nunca seja um formulário em branco.

### 3. A v1 é autodeclarativa, com a saída desenhada — não é o estado final

Todos os 51 critérios são respondidos pela capitania (`CATALOG_MODE = 'declarado'`, catálogo
v2.0.0). A evidência automática continua sendo produzida e gravada; ela apenas não decide ainda, e
aparece **ao lado da resposta** como valor medido (o pré-preenchimento do DF-19 RF-1.3).

Isto **emenda a decisão 2 do ADR-010** ("evidência primeiro; declaração onde a ferramenta não
alcança"): na v1 a ordem se inverte, por escolha de escopo. O compromisso que torna a inversão
aceitável está no DF-20: a onda V1 da aferição usa **apenas evidência que o portal já produz hoje**
e cobre 19 dos 51 critérios, sem nenhuma ferramenta nova.

_Alternativas:_ manter o catálogo misto do v1.0.0 — descartada porque a assimetria entre áreas
instrumentadas e não instrumentadas confunde justamente quem está aprendendo a ler a tela;
esperar todas as ferramentas para lançar — descartada porque adia indefinidamente e não gera o
dado de calibração que só vem do uso.

**Melhor argumento contra:** a autoavaliação é o método que a literatura de maturidade mais
critica, e o portal está adotando exatamente ele na versão que forma a primeira impressão. Aceito
por escopo, com dois amortecedores concretos: o pré-preenchimento acumula, de graça, o conjunto de
divergências entre declaração e medida — que é o material de calibração do DF-20 —, e a mudança
de modo não exige migração de dados, só troca o cálculo.

### 4. Validação externa por competição; subida imediata, queda com carência

As quatro patentes superiores exigem resultado no acervo público do DF-15: participação, enduro
concluído, acima da mediana da coorte, pódio. Sem vínculo aprovado da equipe ao registro canônico,
o teto é a patente 5.

E a patente **sobe na hora, mas cai com 30 dias de carência**. O nível da área continua caindo
imediatamente (ADR-010 dec. 3 permanece); só o emblema tem amortecedor. A maior patente alcançada
fica no histórico com a temporada e não cai nunca.

_Por quê:_ o ADR-010 dec. 3 já registrava o risco de a queda ensinar o comportamento errado ("não
salve a versão com problema"). Com barra e emblema caindo juntos e na hora, o incentivo perverso
dobra. A carência dá a janela para consertar sem perder o rosto — e mantém a honestidade, porque
o nível da área, que é o dado, não é amortecido.

Isto **não contradiz** a dec. 4 do ADR-010 ("maturidade ≠ resultado"): o **nível** continua sem ser
afetado por resultado de competição. A patente é outra coisa — a leitura combinada das duas —, e a
diferença é dita na tela.

_Alternativas:_ patente só por maturidade — descartada porque perde a única validação externa
disponível e desperdiça o acervo do DF-15; patente-catraca que nunca cai — descartada pelo mesmo
motivo do ADR-010 dec. 3: mente sobre o estado e vira troféu morto.

**Melhor argumento contra:** a trava de competição pune quem não tem verba para viajar, por algo
que não é falta de maturidade. Aceito e assumido: a janela de duas temporadas perdoa um ano
parado, o texto diz "ainda não competiu" e nunca "é fraca", e a patente 5 é um teto alto. O portal
é para equipes que competem.

## Consequências

- Nasce a migração `0008` (opt-in, estado com carência, histórico append-only, duas colunas de
  vitrine), `computeRank()` no `packages/evolution` e o contrato ODCS `team-rank`. Nenhuma coluna
  nova em `projects` ou `evolution_levels`: a patente lê, não escreve.
- O catálogo sobe para **v2.0.0** — denominador muda (os dois critérios `oculto` viram visíveis) e
  níveis existentes podem se mover. A publicação recalcula tudo e explica o delta, como o DF-13
  P-1.3 já prevê.
- **Passar da patente 5 exige o _claim_ do DF-15**, que até aqui não tinha como ser estimulado.
  Efeito colateral desejado, e que a curadoria de vínculos precisa suportar em volume.
- **Arte de terceiro entra no produto pela primeira vez.** Nove GIFs de Evgeniy Yudin (Mazok
  Pixels) e Misha Petrick, em CC BY-NC 4.0, com crédito **na tela** (diferente dos ícones do
  Lucide) e em `/THIRD-PARTY-NOTICES.md`. **A cláusula NC tem prazo:** o marco M3 do
  `plano-producao-v2` prevê assinaturas, e antes de qualquer cobrança é preciso permissão direta
  dos autores ou arte original. A escada de nomes livres de marca fica no catálogo desde já.
- O canvas de design "Patentes da Estrada" passa a ser o desenho de referência do módulo, como o
  canvas "Experiência de Evolução" é do lote DF-12…DF-16.
- Riscos aceitos, monitorados no piloto: adoção fria do opt-in (DF-18 P-1.1), autoavaliação
  generosa durante a v1 (decisão 3), exclusão de quem não compete (DF-18 P-2.1), calibração dos
  oito limiares (DF-18 P-3.2), e o prazo da licença (acima).
