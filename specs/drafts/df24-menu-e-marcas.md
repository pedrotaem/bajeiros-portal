# DF-24 — Menu recolhível, recursos da página no menu e marcas das ferramentas

- **Status:** ✅ **IMPLEMENTADA** (2026-08-31). Estende o rail do
  [DF-12](df12-shell-navegacao.md); não vai para `spec.md`, que é do validador.
  - Rail recolhe a só-ícone (variante `rail-compact` do design-system C-02, que estava
    desenhada e **bloqueada** desde a fase 0 — ver §4.3).
  - Selecionar um destino abre embaixo os recursos dele (variante `sub` do C-02).
  - Duas **marcas de ferramenta** novas, categoria à parte do inventário de ícones, com
    exceção escrita no design-system §8.6.1.
- **Dependências:** DF-12 (o rail e o hub de Ferramentas)
- **Documentos:** [índice de drafts](../draft-features.md) · [DF-12](df12-shell-navegacao.md) ·
  [design-system §8.6.1 e C-02](../../docs/design-system.md)

## 1. Contexto e motivação

O rail nasceu fixo em 224px. No editor isso é caro: com os dois painéis do validador abertos, os
224px do menu saem direto da largura do 3D — e o editor é onde as pessoas passam a sessão inteira.
O design-system já previa o `rail-compact` e o marcou como **bloqueado** por falta de um glifo.

E o menu para no primeiro nível. Quem entra em "Ferramentas" não vê no menu que existem duas
ferramentas: descobre no meio da página, e depois de abrir o validador perde o caminho de volta ao
assistente. O que a página oferece é justamente o que o menu esconde.

Junto veio o pedido de identidade: o Validador usava a **mesma chave inglesa** do destino
"Ferramentas" (signo repetido, que o design-system proíbe: um significado, um glifo), e o Assistente
usava um **balão de conversa** — mas a ferramenta não é um chat, é leitura assistida do regulamento.

## 2. Objetivos e não-objetivos

**Objetivos**

- Recolher e expandir o menu principal, com a escolha guardada entre sessões.
- Mostrar no menu os recursos/páginas do destino selecionado.
- Dar marca própria às duas ferramentas.

**Não-objetivos**

- Router / URL por destino. Continua valendo o ADR-009 dec. 4: o editor nunca desmonta.
- Menu de segundo nível **navegável no rail compacto** — no compacto o glifo é o único
  identificador (C-02), e não existe glifo para "aba de página" nem se inventa um (§8.4).
- Reabrir a camada de glifos de domínio do design-system (§8.6 continua fechada — ver §4.3).

## 3. Histórias de usuário

- **US-DF24.a** Como projetista no editor, quero recolher o menu para ganhar largura no 3D sem
  perder o acesso às seções.
- **US-DF24.b** Como pessoa da equipe, quero ver no menu quais recursos a página aberta tem, e
  pular direto de um para o outro.
- **US-DF24.c** Como visitante, quero reconhecer cada ferramenta pela marca dela, e não pela chave
  inglesa genérica que também é o ícone da seção.

## 4. Requisitos funcionais

### 4.1 Menu recolhível

- **FR-DF24.1** Botão no cabeçalho do rail alterna `rail` ↔ `rail-compact`; recolhido, a coluna do
  grid passa de `--bj-rail-w` (224px) para `--bj-rail-w-compact` (56px). **Só a coluna muda** — o
  rail não envolve nem remonta nada (ADR-009 dec. 4 / DF-12 P-1.1).
- **FR-DF24.2** A escolha vive no store de sessão e persiste em `localStorage`
  (`bajeiros:rail-compacto`), no mesmo contrato da equipe ativa: storage bloqueado custa só a
  memória entre sessões.
- **FR-DF24.3** No compacto, todo rótulo **continua no DOM** (escondido só do olho) e cada alvo
  ganha dica em **hover e em foco** (C-02). A dica é CSS local, não o C-15 completo — é o mínimo que
  o item precisa quando o rótulo sai da tela, e está registrado como tal.
- **FR-DF24.4** Um glifo só para o botão, girado 180° (§8.8 permite): aberto aponta para dentro
  (recolher), recolhido aponta para fora (expandir). `aria-expanded` no botão, `aria-controls` na
  lista.

### 4.2 Recursos da página no menu

- **FR-DF24.5** Cada destino declara seus sub-itens numa **tabela declarativa** (`DESTINOS` em
  `Shell.tsx`), com o tipo do que a navegação troca: `page` (destino próprio) ou `teamTab` /
  `communityTab` (aba da página do pai).
- **FR-DF24.6** Os sub-itens abrem **por seleção**, não por um segundo clique: entrar na página é o
  que revela os recursos dela. Fecham ao sair.
- **FR-DF24.7** Mapa atual: **Ferramentas** → Validador de gaiola · Assistente do regulamento
  (páginas); **Equipe** → Evolução · Pessoas · Conhecimento · Projetos (abas); **Comunidade** →
  Resultados · Equipes do Brasil (abas); **Início** → nenhum.
- **FR-DF24.8** Sub-item que não faz sentido sem sessão não aparece para quem não tem conta (Equipe
  e Comunidade). As duas ferramentas aparecem sempre — as duas funcionam sem conta.
- **FR-DF24.9** `aria-current="page"` no recurso ativo, com a mesma régua ocre do nível 1. Aba só
  acende **na página dela**: `teamTab = pessoas` não acende nada fora de Equipe.
- **FR-DF24.10** No rail compacto os sub-itens **não são renderizados** (§4.3).
- **FR-DF24.11** Nome de ferramenta quebra em duas linhas em vez de virar reticências — cortar o
  nome do produto é pior que gastar uma linha do rail.

### 4.3 Marcas das ferramentas

- **FR-DF24.12** `MarkCage` — três pontos denominados, os dois tubos que os ligam e o **arco do
  ângulo no vértice**: o zoom num nó da gaiola, que é o que a ferramenta mede.
- **FR-DF24.13** `MarkAssistant` — a folha do regulamento com o **brilho de IA** sobreposto. O balão
  de conversa saiu de propósito.
- **FR-DF24.14** As duas vivem em `icons/marks.tsx`, **fora do inventário de ícones**: categoria
  própria, teto próprio de 4, produto nomeado obrigatório no registro, e a mesma geometria do
  primitivo (traço 1.6, `currentColor`, sem `fill`, sem cor literal). `check-icons.mjs` passou a
  cobrir tudo isso — a exceção é guardada, não confiada à boa vontade.
- **FR-DF24.15** Marca **nunca aparece sem rótulo ao lado** e **nunca carrega status**. Aparecem em:
  sub-item do rail, card do hub de Ferramentas e card da home pública.
- **FR-DF24.16** `IconMessage` (balão) saiu do inventário: seu único significado era "assistente".
  Inventário 24 → **23 formas**.

## 5. Conflito com o design-system, e como foi resolvido

O §8.6 do design-system fecha a porta para desenho à mão ("ou existe glifo pronto que passe no teste
a 16px, ou o conceito vira texto"), e registra que um `IconCage` desenhado à mão já tinha sido
**removido** por isso. O pedido desta feature contraria esse texto de frente, e a decisão é do dono
do produto — então ela virou **emenda escrita** (§8.6.1), não exceção silenciosa. O que sustenta a
emenda:

1. **Marca não é vocabulário.** O inventário é gramática genérica de interface, com doador único e
   teto de 24. Marca identifica **produto nomeado**, como um logo. Categorias separadas, contagens
   separadas, guardas separadas.
2. **O motivo pelo qual a "gaiola" morreu em §8.6 joga a favor:** _o conceito literal retorna zero em
   220 conjuntos abertos_. Não existe o que copiar. As alternativas reais eram repetir a chave
   inglesa do destino Ferramentas (proibido: um significado, um glifo) ou manter o balão num
   assistente que não é chat.
3. **O bloqueio do `rail-compact` caiu por outro caminho.** A vaga 1 de §8.5 existia porque o Editor
   seria destino do rail e, no compacto, precisaria de glifo como único identificador. Ele não é mais
   destino: é sub-item, e sub-item some no compacto. A vaga continua **aberta e livre**; a regra volta
   inteira se o Editor voltar ao primeiro nível.

## 6. Módulos afetados

| Módulo                            | Mudança                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `icons/marks.tsx`                 | **novo**: `MarkCage`, `MarkAssistant`                                                                       |
| `icons/registry.ts`               | `MARKS` + `MARK_CEILING`; saída do `IconMessage`; contagem 23/24                                            |
| `icons/glyphs.tsx`                | remoção do `IconMessage`                                                                                    |
| `scripts/check-icons.mjs`         | passa a validar as marcas: paridade, teto, produto nomeado, geometria, e que as duas listas não se misturam |
| `session.ts`                      | `railCompact` + `setRailCompact` com persistência                                                           |
| `components/Shell.tsx`            | tabela `DESTINOS` com `subs`, botão de recolher, `destinoAtivo`/`subAtivo`                                  |
| `shell.css`                       | `rail-compact`, variante `sub`, fio do nível 2, `.bj-sr-only`, dica                                         |
| `ToolsHub.tsx` · `PublicHome.tsx` | cards das duas ferramentas com as marcas                                                                    |
| `styles.css`                      | barra do viewport quebra em duas linhas e `.viewport-wrap` recorta (§8)                                     |

## 7. Critérios de aceite

| #         | Critério                                                                                                                           | Verificação      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-DF24.1 | Recolher guarda a escolha para a próxima sessão e não muda página nem aba                                                          | vitest ✔         |
| AC-DF24.2 | Ferramentas abre as duas ferramentas, e só recurso que é produto tem marca                                                         | vitest ✔         |
| AC-DF24.3 | O destino acende com a página dele e com as que ele abre (editor e assistente acendem Ferramentas)                                 | vitest ✔         |
| AC-DF24.4 | Aba só acende na página dela; página própria acende por `page`                                                                     | vitest ✔         |
| AC-DF24.5 | A guarda de ícones cobre as marcas: teto, paridade com o registro, produto nomeado e contrato de geometria                         | `check-icons` ✔  |
| AC-DF24.6 | No navegador: recolher dá 168px ao 3D, a dica aparece em hover, o submenu abre ao entrar em Ferramentas e o item aberto fica aceso | manual/browser ✔ |

## 8. Riscos e o que apareceu ao rodar

- **A barra do viewport transbordava para o painel direito.** Com os 8 botões do DF-23, recolher o
  rail alargou o canvas e a barra passou a cobrir o cabeçalho "Editar". Não era defeito do menu — o
  menu só revelou. A barra passou a quebrar em duas linhas e `.viewport-wrap` a recortar o que é
  absoluto (isso também prende rótulo 3D do drei, que vazava pelo mesmo buraco).
- **A dica não aparecia**, porque `overflow-y: auto` do rail cortava tudo que sai da coluna. No
  compacto o rail tem 6 alvos e não precisa rolar: virou `overflow: visible`. Em janela muito baixa
  (< ~300px de altura) o compacto corta em vez de rolar — trade-off registrado.
- **`rail-compact` em telas estreitas** (`nb`, 1200–1439px) era previsto pelo design-system como
  automático por breakpoint; aqui ele é **manual**. Automatizar depois é trocar o default inicial,
  não refazer a variante.
- **Dois níveis é o limite.** Se um dia um recurso tiver sub-recurso, isto vira árvore — e árvore no
  rail pede o C-15 de verdade e revisão de teclado.
