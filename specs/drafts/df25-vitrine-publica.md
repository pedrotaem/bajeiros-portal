# DF-25 — Vitrine pública: marca, panorama do Brasil e o porquê do portal

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31). Substitui o corpo do `PublicHome` do
  [DF-12](df12-shell-navegacao.md); não vai para `spec.md`, que é do validador.
  - O Início de quem não tem conta vira **vitrine**: marca grande, números, e um
    **mapa do Brasil interativo** com o panorama das equipes por região.
  - Uma **marca de portal** (`MarkPortal`) entra na categoria de marcas do DF-24 — a
    terceira das quatro vagas.
  - Os números vêm de um **instantâneo datado e versionado no front**, nunca de
    consulta ao banco (§5.2 explica por que essa é a decisão, não um atalho).
- **Dependências:** DF-12 (shell e `PublicHome`), DF-24 (categoria de marcas e o guard
  que a cobre)
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-12](df12-shell-navegacao.md) ·
  [DF-15](df15-comunidade-resultados.md) · [DF-24](df24-menu-e-marcas.md) ·
  [design-system §8.6.1](../../docs/design-system.md) ·
  fontes em `Pesquisa de Mercado/` (fora do repo)

## 1. Contexto e motivação

O `PublicHome` do DF-12 resolveu um problema real: a landing antiga era um _overlay_ fora do
shell, e quem chegava pela raiz via a apresentação e mais nada — nunca o produto. Trazer a
apresentação para dentro do shell foi a decisão certa e **continua valendo**.

O que ficou faltando é a outra metade. O que existe hoje é um parágrafo e quatro cartões de
recurso: diz **o que o portal tem**, não **por que ele existe** nem **para quem**. Três
consequências:

1. **Sem prova.** A pesquisa de mercado tem 91 equipes mapeadas, 17 competições e cinco
   regiões com desequilíbrio gritante — e nada disso aparece para quem chega. O visitante
   não tem como saber se este portal conhece o meio dele.
2. **Sem marca.** O portal se apresenta com uma palavra em serifa. Não há signo, e o rail
   já gasta as três vagas de destino do inventário de ícones (§8.5 fechou em 23/24).
3. **Texto demais para o trabalho que faz.** Cartão de recurso com parágrafo é a forma
   errada numa página que se lê em pé, rolando. Número grande com uma linha embaixo entrega
   o mesmo em um quinto do espaço.

O pedido do dono do produto foi direto: **mais visual, marca mais presente, menos texto, e um
mapa dinâmico do Brasil com dados por região.**

## 2. Objetivos e não-objetivos

**Objetivos**

- Dar ao Início público a função de vitrine: propósito, prova e um caminho só para entrar.
- Publicar o panorama regional das equipes de forma **explorável**, não como tabela.
- Dar marca ao portal, dentro das regras que o DF-24 escreveu.
- Reduzir prosa: parágrafo vira número + uma linha.

**Não-objetivos**

- **Não** reintroduzir a landing como página fora do shell. A decisão do DF-12 é explícita e
  esta spec não a reabre: a vitrine é o conteúdo do destino `inicio` para quem não tem sessão,
  com rail e topbar visíveis.
- **Não** consultar a API. A vitrine é a primeira pintura de um visitante anônimo (§5.2).
- **Não** virar instrumento cartográfico. A fronteira é real, mas simplificada e em projeção
  que não preserva área: o mapa serve para achar a sua região, não para medir (§5.3, §8.3).
- **Não** tocar no Início de quem tem conta (`HomePage`, DF-16), no `PrecisaDeConta`, nem em
  qualquer coisa do editor.
- **Não** substituir a Comunidade (DF-15). A vitrine mostra o agregado; o acervo por equipe e
  por prova continua sendo destino com conta.

## 3. Histórias de usuário

- **US-DF25.a** Como membro de equipe que nunca ouviu falar do portal, quero entender em dez
  segundos por que ele existe e se ele conhece o meio em que eu compito.
- **US-DF25.b** Como visitante, quero achar a minha região no mapa e ver quantas equipes há
  nela, quantas são de alta performance e quantas estão começando.
- **US-DF25.c** Como capitão avaliando adotar o portal, quero ver que as práticas cobradas
  saem de equipes reais e não de opinião.
- **US-DF25.d** Como pessoa que chegou pelo link, quero um caminho só e óbvio para começar,
  e outro para experimentar sem criar conta.

## 4. Requisitos funcionais

### 4.1 Vitrine

- **FR-DF25.1** A vitrine é o corpo do `PublicHome` — renderizada em `page === 'inicio'`
  quando **não** há sessão. Com sessão, a `HomePage` do DF-16 continua intacta.
- **FR-DF25.2** Ela ocupa a largura inteira do `bj-content` (faixas sangradas), com o
  conteúdo de cada faixa preso a `--bj-page-w`. O rail e a topbar continuam visíveis: quem
  chega vê o produto, que é o ponto do DF-12.
- **FR-DF25.3** **Uma ação primária, repetida:** "Criar conta" (abre o painel de login) no
  hero e no fecho. A secundária é sempre "Abrir o validador sem conta" (vai para `editor`).
  Nenhum terceiro botão concorrente.
- **FR-DF25.4** Ordem das faixas: hero → panorama → por que existe → o que a elite faz →
  as quatro partes → atrito com a organização → fecho + aviso legal.
- **FR-DF25.5** O aviso legal do spec.md §1 continua na vitrine **além** do disclaimer fixo
  da topbar. Ele é obrigação de interface: some da página só quando sair do produto.
- **FR-DF25.6** Nenhum cartão da vitrine tem parágrafo de mais de duas linhas em 1440px.
  A forma canônica é **número grande em serifa + uma frase + fonte em 12px**.

### 4.2 Panorama do Brasil

- **FR-DF25.7** Mapa do Brasil com as **fronteiras reais dos 27 estados**. Clicar num estado
  seleciona a região dele e troca o painel ao lado; abaixo, uma fileira de botões (Brasil + as
  cinco regiões) faz a mesma troca.
- **FR-DF25.7.1** O desenho carrega **duas leituras sobrepostas**: o **estado** é a forma e o
  tom (pintado pelas equipes dele); a **região** é o recorte que acende. Selecionar acende
  pela **borda**, nunca pelo preenchimento — mudar o tom destruiria o dado que o tom carrega.
- **FR-DF25.7.2** Cada UF tem `<title>` com nome e contagem ("São Paulo — 21 equipes",
  "Roraima — nenhuma equipe mapeada"): dica nativa do navegador, sem JS, que serve a ponteiro
  e a leitor de tela de uma vez.
- **FR-DF25.8** A intensidade do preenchimento é **derivada**, não escolhida à mão:
  `opacidade = 0,22 + 0,58 × (equipes da UF ÷ maior)`. Cor única (`var(--bj-brand)`) com
  opacidade variável — assim o mapa nunca introduz cor nova e a rampa se corrige sozinha
  quando o dado mudar.
- **FR-DF25.8.1** Estado **sem equipe fica fora da rampa** e recebe um neutro próprio
  (`--bj-bg-raised`). "Nenhuma" e "uma" são categorias diferentes, não pontos vizinhos de uma
  escala — e a ausência é justamente o que a nota do Norte e do Centro-Oeste conta.
- **FR-DF25.9** O painel mostra, para a seleção: total, **alta performance**,
  **intermediária**, **iniciante** (com barra proporcional ao total da seleção), número de
  estados, número de equipes no Nacional 2026, e uma nota de uma frase.
- **FR-DF25.10** As coortes aparecem **pelo nome**, nunca por número. Os dois documentos da
  pesquisa numeram "Tier" em ordens opostas (`equipes-brasil.md` tem Tier 1 = alta
  performance; `dificuldades-por-tier.md` tem Tier 1 = iniciante). O DF-15 já resolveu isso
  assim; a vitrine herda a decisão em vez de reabri-la.
- **FR-DF25.11** A seleção inicial é **Brasil**. Selecionar a mesma região de novo não
  alterna nem limpa — a vitrine nunca fica sem painel.
- **FR-DF25.12** Acessibilidade: os botões da fileira são o controle acessível, com
  `aria-pressed`; o `<svg>` é `role="img"` com `aria-label` que resume o que ele mostra, e as
  regiões são atalho de ponteiro, não a única porta. O painel é `aria-live="polite"`, então a
  troca é anunciada. Ver o risco em §8.2.
- **FR-DF25.13** A data do levantamento e a origem aparecem **na própria faixa do mapa**, não
  só no rodapé. Número sem data é afirmação sobre hoje, e este não é.

### 4.3 Marca do portal

- **FR-DF25.14** `MarkPortal` — o perfil octogonal do corta-fogo com o X das diagonais e os
  nós nos vértices. Não é ilustração de carro: é a geometria que o validador mede, que é o
  que o portal faz de mais próprio.
- **FR-DF25.15** Ela entra em `icons/marks.tsx` sob as **mesmas regras** que o DF-24
  escreveu: `currentColor`, sem `fill`, sem cor literal, sem `<g>`, traço no primitivo,
  produto nomeado obrigatório no registro. `check-icons` já cobre tudo isso — a única
  mudança no guard é nenhuma.
- **FR-DF25.16** Contagem: **3 de 4 marcas**. O inventário de ícones continua **23/24**,
  intocado. A categoria de marcas passa a se chamar "marcas de produto" (era "de
  ferramenta") — o portal é produto nomeado, e o teto continua o mesmo.
- **FR-DF25.17** Vale para ela a regra do DF-24 FR-DF24.15: **nunca sem rótulo ao lado** e
  **nunca carregando status**. Na vitrine ela aparece sempre acima ou ao lado da palavra
  "Bajeiros".

### 4.4 Dado do panorama

- **FR-DF25.18** Um módulo puro (`data/panorama.ts`) guarda o instantâneo: as cinco regiões,
  o agregado Brasil, a data do levantamento e a lista de fontes. Sem import de React, sem
  fetch, sem hex.
- **FR-DF25.19** O agregado **Brasil não é escrito à mão**: ele é somado das regiões em
  tempo de módulo. Um total que diverge da soma é impossível por construção, não por
  disciplina.
- **FR-DF25.20** O módulo expõe `MOSTRAR_ATRITOS` (§5.4) e as três coortes com os nomes
  canônicos, para que tela e teste leiam a mesma fonte.

## 5. Decisões que valem para quem mexer nisso

### 5.1 A vitrine mora dentro do shell

O DF-12 removeu a landing-overlay com um motivo escrito, e o pedido de "landing page" podia
ser lido como pedido para trazê-la de volta. Não foi assim que se resolveu: **a vitrine é o
conteúdo, o shell é a moldura**. O ganho visual pedido está todo em faixas sangradas dentro do
`bj-content`; o rail continua ali, e a distância entre "gostei" e "abrir o validador" continua
sendo um clique no menu que já está na tela.

Consequência prática: a vitrine **não desenha topbar própria**, não desenha wordmark no canto
superior esquerdo e não tem botão "Entrar" no topo — o rail já tem os três. Duplicar seria
dizer duas coisas diferentes sobre onde se clica.

### 5.2 O número não vem do banco, e isso é a decisão

A tentação era ligar a vitrine ao acervo do DF-15. Três razões para não:

1. **Aurora escala a zero.** Um retorno de 0 ACU leva ~15 s. A vitrine é a primeira pintura
   de quem chega pelo link; 15 s de esqueleto é a pior primeira impressão possível, e é a que
   aconteceria com mais frequência justamente quando o portal está pouco usado.
2. **Não há sessão.** Servir agregado público exigiria rota anônima nova, com quota e cache
   próprios — superfície de ataque por um número que muda uma vez por ano.
3. **O dado é datado, não vivo.** A compilação é de 23/08/2026 e mistura fonte oficial com
   leitura de site de equipe. Servi-la de um banco a faria **parecer** viva. A honestidade
   aqui é técnica: instantâneo versionado, com a data na tela.

Quando o acervo do DF-15 for ingerido, o caminho é **gerar** este módulo a partir do banco num
script de build e continuar servindo estático — não trocar por fetch.

### 5.3 A malha é real, e vem de um gerador com procedência escrita

A primeira versão desenhava cinco polígonos à mão. Foi recusada com razão: um mapa do Brasil
que não é o Brasil não convida ninguém a procurar a própria região, e o Sudeste — a região com
metade das equipes — virava uma faixa fina onde o rótulo não cabia.

A malha agora é **Natural Earth admin-1 1:50 milhões**, filtrada em `adm0_a3 = BRA`, e o
`scripts/build-mapa-uf.mjs` registra o processo inteiro: descarta ilha oceânica (Fernando de
Noronha, Trindade, Rocas, São Pedro e São Paulo esticariam o enquadramento em ~10% para pintar
quatro pixels), projeta em equiretangular com correção de cosseno na latitude média e
simplifica por Douglas-Peucker **em pixel de saída, não em grau** — assim a tolerância
significa "o que se vê" e não muda de efeito conforme a latitude. Resultado: 5 600 → 2 034
pontos, **24,7 KB** de `path`, viewBox 640×657 que sai da proporção real do país.

Três decisões dentro dessa:

- **Natural Earth e não IBGE.** A malha do IBGE é mais precisa e é a fonte oficial — e foi a
  primeira tentativa. O serviço recusou as requisições deste ambiente, e Natural Earth resolve
  o problema com **domínio público explícito**, que é o que este repo exige de qualquer
  material copiado para dentro (`THIRD-PARTY-NOTICES.md`). Se um dia a precisão importar mais
  que o tamanho, o caminho é o IBGE e só o gerador muda.
- **O gerador NÃO roda no CI.** Ele busca a malha na rede; a saída é commitada. Ele existe para
  registrar a procedência e permitir refazer com outra tolerância, não para ser gate de build.
- **O arquivo gerado não se edita à mão**, como `tokens.css`. O cabeçalho diz isso e diz o
  comando que o refaz.

### 5.3.1 O mapa tem teto de largura

Sem teto, o mapa ocupa a faixa inteira quando a seção empilha (o conteúdo chega a ~1 050 px) e
vira cartaz. Ele é **localizador**: 480 px nas duas larguras — coluna e empilhado —, o mesmo
desenho no mesmo tamanho. E o corte entre uma e duas colunas é o `nb` do design-system (§4.4,
1200 px), o mesmo que o rail já usa, não um número novo.

### 5.4 A faixa sobre a organização é decisão de produto, com interruptor

A faixa "Acompanhar a competição também é trabalho" cita quatro fatos, todos de **documento
público da própria organização** (RATBSB A4.14.5, A4.4.1/A4.12.3, Informativos 15 e 35). Ela
é relato de fonte primária, não opinião, e vem com dois enquadramentos obrigatórios que **não
podem ser removidos sem remover a faixa inteira**:

- que boa parte desses atritos é o verso de um comitê pequeno e voluntário;
- que o portal **não substitui esses canais e não fala pela organização**.

Ainda assim é escolha editorial do dono do produto, não do código. Por isso ela sai por uma
constante (`MOSTRAR_ATRITOS`) e não por edição de JSX: desligar é uma linha, e volta igual.

### 5.5 Rampa derivada em vez de tons escolhidos

Tom na mão vira decisão que envelhece: quando o Nordeste passar o Sul, alguém tem de lembrar de
trocar. `opacidade = 0,22 + 0,58 × (equipes ÷ maior)` resolve sozinho e usa **uma** cor do
sistema. O piso subiu de 0,10 para 0,22 ao passar de região para estado, porque um estado
precisa se separar do vizinho vazio já na primeira equipe; o teto de 0,80 é o limite que ainda
deixa o rótulo claro legível, e os rótulos ganharam **halo** (`paint-order: stroke fill`) por
cruzarem fronteira e tom.

O mesmo raciocínio derivou as **âncoras dos rótulos de região**: são a média dos centroides das
UFs da região, calculada no componente. Trocar a malha não deixa cinco coordenadas para alguém
lembrar de mexer.

## 6. Módulos afetados

| Módulo                      | Mudança                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `data/panorama.ts`          | **novo**: regiões + Brasil somado, contagem por UF, coortes, fontes, data               |
| `data/brasil-uf.ts`         | **novo, GERADO**: os 27 contornos estaduais, com região e centroide de cada UF          |
| `scripts/build-mapa-uf.mjs` | **novo**: baixa Natural Earth, projeta, simplifica e escreve o módulo acima. Fora do CI |
| `THIRD-PARTY-NOTICES.md`    | bloco do Natural Earth (domínio público), com os termos na íntegra                      |
| `components/BrazilMap.tsx`  | **novo**: mapa clicável + fileira de botões + painel da seleção                         |
| `components/PublicHome.tsx` | corpo trocado pela vitrine; `PrecisaDeConta` **intocado**                               |
| `icons/marks.tsx`           | `MarkPortal`                                                                            |
| `icons/registry.ts`         | entrada `MarkPortal` em `MARKS` (3/4); categoria renomeada para "marcas de produto"     |
| `shell.css`                 | faixas da vitrine, hero, grade de números, mapa, painel, listas de uma linha            |
| `panorama.test.ts`          | **novo**: invariantes do dado e da rampa                                                |
| `vitrine.test.ts`           | **novo**: seleção do panorama e regra da ação primária                                  |

Nada em `packages/`, nada em `apps/api`, nenhuma migração, nenhum contrato.

## 7. Critérios de aceite

| #          | Critério                                                                                                                         | Verificação      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-DF25.1  | O total do Brasil é a soma das regiões em todas as quatro medidas (total, coortes, estados, Nacional) — não literal              | vitest ✔         |
| AC-DF25.2  | Em toda região, `alta + intermediária + iniciante === total`                                                                     | vitest ✔         |
| AC-DF25.3  | A rampa é derivada: o estado de maior total tem opacidade 0,80, nenhum com equipe cai abaixo de 0,22 e o vazio fica fora dela    | vitest ✔         |
| AC-DF25.9  | A soma das UFs de cada região bate com o total dela, e as 27 UFs aparecem uma vez só no agrupamento                              | vitest ✔         |
| AC-DF25.10 | A malha traz 27 UFs, toda com região coerente com o dado, todo contorno fechado e dentro do viewBox, sob 40 KB de `path`         | vitest ✔         |
| AC-DF25.4  | Selecionar região troca a seleção; selecionar a mesma de novo mantém painel (nunca some)                                         | vitest ✔         |
| AC-DF25.5  | O panorama não faz requisição: o módulo de dado não importa `session` nem chama `fetch`                                          | vitest ✔         |
| AC-DF25.6  | 3/4 marcas, inventário intocado em 23/24, e a marca nova passa o contrato de geometria                                           | `check-icons` ✔  |
| AC-DF25.7  | Zero hex novo em `apps/web/src` — a catraca não sobe                                                                             | `check-tokens` ✔ |
| AC-DF25.8  | No navegador: sem conta o Início é a vitrine, com conta é a `HomePage`; clicar região troca o painel; "Criar conta" abre o login | manual/browser   |

## 8. Riscos e o que fica em aberto

### 8.1 O dado envelhece em silêncio

O instantâneo é de 23/08/2026 e a temporada seguinte muda os cinco números. Mitigação hoje:
a data está na tela, ao lado dos números, e não escondida no rodapé. Mitigação de verdade:
gerar o módulo do acervo do DF-15 quando ele for ingerido (§5.2). **Enquanto isso, quem
atualizar a pesquisa tem de lembrar deste arquivo** — é a dívida mais provável desta feature.

### 8.2 O mapa é ponteiro; os botões é que são o controle

Region-como-`<path>` não é foco de teclado nem alvo de toque confiável em telas pequenas. A
fileira de botões cobre teclado, leitor de tela e toque, e o painel anuncia a troca. O que
**não** foi feito: `tabIndex` nas regiões com `Enter`/`Espaço`. Seria caminho duplicado para a
mesma ação, com ordem de foco de 5 alvos sem rótulo visível. Se um dia o mapa ganhar dado que
os botões não expõem, essa decisão precisa ser revista.

### 8.3 A malha é real, mas continua sem ser instrumento de medida

Agora a fronteira é de verdade, e isso muda o risco em vez de eliminá-lo: um desenho fiel
convida a **medir** nele. Ele não serve para isso — é 1:50 milhões, simplificado a 0,7px de
saída, em equiretangular (que não preserva área), e sem ilha oceânica. O rodapé do mapa nomeia
a fonte e a escala, e o mapa continua sem cidade, sem norte e sem barra de escala, de propósito.

Uma consequência prática de escala: **Distrito Federal e Sergipe são minúsculos** no desenho, e
os dois têm equipe (2 e 1). O `<title>` cobre a leitura exata; o alvo de clique é pequeno, e é o
motivo de a fileira de botões existir como controle de verdade (§8.2).

### 8.4 A faixa da organização pode envelhecer diferente do resto

Os quatro fatos vêm de emenda e informativos de uma temporada. Emenda 8 pode revogar qualquer
um deles — e uma crítica a uma regra que já mudou é pior que nenhuma. Cada linha cita o artigo
exato justamente para que a conferência seja barata na virada de emenda.

### 8.5 Rodar o app pegou 4 defeitos que os testes não pegariam

Todos de **apresentação de layout** — a classe que teste de unidade não vê, porque nenhum dado
está errado:

1. **O rótulo do Sudeste vazava da região.** O Sudeste era uma faixa fina e diagonal, e é
   justamente a região com o maior número. O `45` caía por cima do Sul. As cinco strings de
   `contorno` foram redesenhadas: o Sudeste virou cunha com área, e as âncoras de rótulo
   ficaram dentro do polígono em todas. É a primeira vez que **a leitura do dado ditou a
   geometria** do desenho, e não o contrário.
2. **Os seis chips quebravam com "Sul" sozinho na segunda linha.** Órfão lê como bug. O recuo
   lateral caiu para `--bj-space-2` — que é o do chip de status (C-07), valor do sistema e não
   número inventado — e os seis passaram a caber em 426 de 472px.
3. **"Quatro partes" mostrava 3 + 1.** O `auto-fill` de `.bj-cards` dá 3 colunas nessa largura.
   Numa seção cujo título é o número de itens, a contagem é conteúdo: entrou `.bj-cards-4` com
   4 colunas fixas.
4. **O panorama em duas colunas espremia entre 1024 e 1279px de janela.** O conteúdo é a janela
   menos o rail de 224px, então o breakpoint de 1023px do resto do arquivo chegava tarde demais
   e as colunas caíam abaixo de 400px — onde o defeito 2 voltaria. O panorama empilha a partir
   de 1279px. Container query resolveria melhor, mas o alvo de build inclui firefox104, que não
   as tem.

Conferido no navegador com o app rodando: hero, mapa, troca de região por clique e por chip,
as quatro faixas, o fecho e o aviso legal. **Zero erro e zero aviso no console**, nenhuma barra
horizontal em nenhum nível, e o editor continua montando pelo CTA secundário sem desmontar ao
voltar para o Início.

**Na troca para a malha real, mais dois:**

5. **O mapa virou cartaz.** Com fronteira de verdade e a seção empilhada, o SVG esticava para
   os ~1 050 px do conteúdo e engolia a faixa. Teto de 480 px, igual nas duas larguras (§5.3.1).
6. **O corte entre uma e duas colunas era um número meu.** Estava em 1279 px, escolhido para o
   desenho antigo. Passou para 1199 px, que é o `nb` do design-system (§4.4) e o mesmo corte que
   o rail já usava no arquivo — um breakpoint a menos para alguém descobrir depois.

Reconferido com a malha real: 27 UFs desenhadas, todas com `<title>`, nenhuma fora do viewBox,
duas colunas acima de 1200 px e uma abaixo, os seis chips numa linha nas duas, e clicar em São
Paulo acende os quatro estados do Sudeste pela borda sem mexer no tom de nenhum.

### 8.6 Duas faixas competem pelo mesmo trabalho

"Por que existe" e "O que a elite faz" são as duas de prova. Se numa leitura futura a página
parecer longa, a que sai é "O que a elite faz" — ela é a que a Evolução repete depois do
login, e a única que o visitante anônimo não precisa para decidir criar conta.
