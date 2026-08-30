# DF-12 — Shell de navegação: rail, destinos e arquitetura de informação da evolução

> Rascunho de feature (2026-08-29). Deriva do canvas
> ["Bajeiros — Experiência de Evolução"](https://claude.ai/code/artifact/0a10a019-dfc6-46bb-9b28-3f7ca7cf6f8b)
> (prancheta "Mapa da experiência" + os cinco mockups). Evolui o mapa proposto no
> [`docs/estudo-design.md`](../../docs/estudo-design.md) §9.2: o rail deixa de ser
> ferramenta-cêntrico (Editor no topo) e passa a ser **evolução-cêntrico** — Início, Equipe,
> Ferramentas, Comunidade.

- **Direção de produto (2026-08-29):** a evolução das equipes é o core; a gaiola é uma ferramenta.
- **Normativo visual:** [`docs/design-system.md`](../../docs/design-system.md) — C-01 (shell),
  C-02 (item de navegação), C-11 (abas), §8 (iconografia), §10 (acessibilidade), §11 (voz).
- **Restrição arquitetural intocada (ADR-009, decisão 4):** sem router; o editor permanece
  **sempre montado** com `display: none` quando outra página está ativa. Nenhum requisito deste
  DF altera a montagem de `.main`/`<Viewport>`.
- **Dependências:** plano de design fases 0 (tokens) e 6 (rail) — este DF **é** o conteúdo de
  produto da fase 6; DF-13/14/15/16 fornecem as páginas que os destinos abrem.

## 1. Contexto e motivação

Hoje a navegação tem três eixos ortogonais em memória (`landing`, `page`, `panel`), toggles
ambíguos na topbar e três mecanismos de "voltar" com destinos divergentes (estudo §2.4). O rail do
estudo §9.2 resolve isso, mas ainda listava **Editor** como primeiro destino — herança do produto
piloto. Com a direção "portal > validador", o primeiro destino passa a ser o dia da equipe
(Início) e o segundo, a própria equipe; ferramentas viram uma biblioteca de meios.

## 2. Objetivos

| #   | Objetivo                                                                            |
| --- | ----------------------------------------------------------------------------------- |
| O1  | Rail persistente com 4 destinos: Início · Equipe · Ferramentas · Comunidade         |
| O2  | Espaço da equipe com 4 abas: Evolução · Pessoas · Conhecimento · Projetos           |
| O3  | Hub de Ferramentas: cada ferramenta declara o que alimenta e mostra estado real     |
| O4  | Um único vocabulário de rótulos (correções do estudo §9.4 aplicadas de vez)         |
| O5  | Editor/assistente preservados por inteiro — mudam de endereço, não de comportamento |

### Não-objetivos

- Router/URLs (ADR-009 dec. 4; meio-termo `popstate` de ~20 linhas do estudo §11.3 fica como
  Could, fora deste DF).
- Paleta de comandos Ctrl+K (cortada no estudo §11.4; reavaliar com > 8 destinos).
- Redesenho interno do editor/Inspector (fases 2–5 do plano de design).
- Barra inferior mobile (< 1024px) além do que a fase 6 do plano de design já cobre.

## 3. Conceito — o mapa

### 3.1 Destinos do rail

| Destino     | Ícone (Lucide, §8.9)    | Conteúdo                                                     | Origem       |
| ----------- | ----------------------- | ------------------------------------------------------------ | ------------ |
| Início      | `house` → `IconHouse`   | O dia da equipe (DF-16)                                      | novo         |
| Equipe      | `IconUsers` (existe)    | Evolução · Pessoas · Conhecimento · Projetos                 | evolui DF-10 |
| Ferramentas | `wrench` → `IconWrench` | Hub: Validador, Assistente, futuras                          | novo         |
| Comunidade  | `trophy` → `IconTrophy` | Resultados · Equipes do Brasil (DF-15); Galeria/Fórum futuro | novo         |

Rodapé do rail: **Admin** (`IconSliders`, só `isAdmin`) · bloco do usuário (avatar + nome +
papel na equipe; abre o menu de conta: Perfil · Meus projetos · **Sobre o portal** · Sair).
"Sobre" **não** é item do rail: o glifo `info` é um dos cinco de status (exclusivos de status,
DS §8.7/CT-3) e o teto do inventário fica exatamente preenchido — nos mockups do canvas ele
ainda aparece como item com ícone; a spec corrige.

**Iconografia:** os três glifos novos (nomeados pelo que são, convenção do DS §8.8) consomem
exatamente as 3 vagas do inventário (DS §8.5, teto 24 — fica cheio) pelo processo §8.9 (doador
único Lucide 1.34.0). A vaga aberta do Editor **dissolve**: Editor deixa de ser destino de rail
e o item do hub usa texto + glifo utilitário existente. A implementação **emenda no mesmo PR**
as passagens do DS que este DF torna obsoletas: a vaga do glifo do Editor (§8.5) e o bloqueio de
`rail-compact` em C-02.

### 3.2 Mapa de estados (`session.ts`)

`PageId` passa de `'editor' | 'assistant' | 'admin' | 'team'` para:

```
'inicio' | 'equipe' | 'ferramentas' | 'comunidade' | 'editor' | 'assistant' | 'admin' | 'sobre'
```

- `editor` e `assistant` continuam páginas próprias (abertas pelo hub ou por atalhos); no rail, o
  item **Ferramentas** fica `aria-current="page"` quando `page ∈ {ferramentas, editor, assistant}`.
- Sub-estado da equipe: `teamTab: 'evolucao' | 'pessoas' | 'conhecimento' | 'projetos'`
  (default `evolucao`). Sub-estado de comunidade: `communityTab: 'resultados' | 'equipes'`.
- `landing` (boolean) morre como overlay: deslogado vê a landing como página (fase 9 do plano de
  design); logado entra em `inicio`. `panel` (modais login/perfil/projetos) permanece.
- Defaults: pós-login → `inicio`; logout → landing; convite pendente → `equipe` (comportamento do
  DF-10 preservado); F5 continua perdendo o estado (limitação aceita, igual hoje).
- `track()` registra os PageIds novos (contrato de pageview inalterado).

### 3.3 De-para das telas de equipe (DF-10 → DF-12)

| Hoje (DF-10, 5 abas) | Novo (4 abas)                                                        |
| -------------------- | -------------------------------------------------------------------- |
| Visão geral          | morre — a leitura de lacunas vira evidência da **Evolução** (DF-13)  |
| Membros              | **Pessoas** (lista)                                                  |
| Organograma          | **Pessoas** (alternador lista ⇄ organograma — estudo §9.4)           |
| Estrutura            | **Pessoas** (edição da árvore, mesma superfície do organograma)      |
| Entradas             | **Pessoas › Convites e pedidos** (rótulo novo)                       |
| —                    | **Conhecimento** (DF-14)                                             |
| —                    | **Projetos** (projetos da equipe + versões + "projeto da temporada") |

Nada de capacidade do DF-10 é removido — só reorganizado. A fusão Organograma/Estrutura mantém a
permissão: visualizar é de todos, editar é `position.manage`.

## 4. Requisitos funcionais

### E1 — Rail e shell

- RF-1.1 Shell C-01: rail 224px (compacto 56px abaixo de 1440px **no editor**; nas páginas de
  conteúdo o rail fica expandido até 1200px), topbar 48px, área em `--bj-bg-canvas`.
- RF-1.2 Itens C-02 completos: ícone 20px obrigatório, `aria-current="page"`, régua ocre 3px,
  altura ≥ 40px; em rail compacto, rótulo em `.bj-sr-only` + tooltip.
- RF-1.3 `<nav aria-label="Seções">`, skip link, `<main id="conteudo">`, um `<h1>` por página na
  topbar (hoje só a landing tem `<h1>`).
- RF-1.4 Topbar: `<h1>` da página (display serif 22) à esquerda; **disclaimer permanente** à
  direita ("Apoio ao projeto — não substitui a inspeção oficial", `--bj-text-sm`
  `--bj-fg-secondary`) — obrigação de interface do spec.md §1, agora com posição fixa em todas
  as páginas.
- RF-1.5 Busca do rail: v1 **não entra** (C-01 permite); o slot fica reservado e a busca chega
  com o DF-14 (decisões + guias + regras B6). Registrado como decisão, não esquecimento.

### E2 — Página Equipe (contêiner)

- RF-2.1 Topbar da página mostra o nome da equipe + chip neutro de contexto (região; coorte só
  para a própria equipe — DF-15) + contagem de membros.
- RF-2.2 Abas C-11 (`underline`, ARIA completo, setas/Home/End) para as 4 seções; estado
  `teamTab` sobrevive à troca de página dentro da sessão.
- RF-2.3 Usuário em múltiplas equipes: seletor de equipe no cabeçalho da página (lista existente
  do DF-10); a última equipe ativa fica em `localStorage` (não sensível).
- RF-2.4 Usuário sem equipe: a página Equipe mostra criar/entrar (fluxo DF-10) — nunca vazio.

### E3 — Hub de Ferramentas

- RF-3.1 Cards das ferramentas disponíveis com: nome, frase do que resolve, linha
  **"Alimenta · <áreas>"** (mapa estático em código), estado real (Validador: projeto da
  temporada, última versão, contagens canônicas, massa; Assistente: quota do dia, última
  pergunta) e ações (Continuar/Novo · Abrir).
- RF-3.2 "Continuar a vN" abre `page: 'editor'` com o projeto carregado; "Abrir o assistente"
  abre `page: 'assistant'` — sem mudar nenhum comportamento interno das duas.
- RF-3.3 Seção "No radar": cards de futuras (Ficha Anexo B, Importação de CAD, Planejador de
  testes, Biblioteca técnica) com chip tracejado FUTURO, sem CTA ativo; curadoria em código.
- RF-3.4 Rodapé "Sugerir ferramenta" sem link até o fórum existir (texto explica a priorização).

### E4 — Vocabulário (estudo §9.4, agora normativo)

- RF-4.1 "Papel de acesso" → **Permissões**; "Função" → **Cargo**; "Entradas" → **Convites e
  pedidos**; zero códigos internos `(DF-n)` na UI.
- RF-4.2 Strings canônicas de status vêm **exclusivamente** do módulo do design-system §11.3 —
  hoje: CONFORME · INFRAÇÃO · VERIFICAR · PRESENCIAL · NOTA. **Divergência registrada:** o
  estudo §9.4 e os mockups do canvas usam "NÃO CONFORME" / "VERIFICAÇÃO PRESENCIAL", e a fase
  2.6 do plano de design marca a escolha como decisão do product owner. Resolver **antes da
  primeira superfície nova** (um cânone só); mudar depois é editar um módulo, nunca telas.
- RF-4.3 Rótulo do gabarito: "gabarito de habitáculo (Geraldão)" ao menos uma vez na legenda.

### E5 — Sobre o portal

- RF-5.1 `page: 'sobre'` renderiza o conteúdo da landing (propósito, aviso legal, contato) como
  página do shell, aberto pelo menu de conta (rodapé do rail) e pelo rodapé da landing; a
  landing deslogada continua sendo a home pública.

## 5. Modelo de dados e API

Nenhuma tabela nova. Mudanças de estado só em `apps/web/src/session.ts` (PageId + teamTab +
communityTab) e componentes. O hub consome endpoints existentes (`GET /projects`,
`GET /assistant/status`) + `GET /teams/:id/season` (DF-13).

## 6. Pontos de falha e mitigação

| ID    | Ponto de falha                                                             | Mitigação                                                                                                                                               |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1.1 | Reestruturar o shell desmonta o `<Viewport>` e perde câmera/WebGL          | Regra dura do C-01/ADR-009: o rail troca coluna do grid; `.main` intocado; teste manual do roteiro de captura da fase 6                                 |
| P-1.2 | Rail consome largura e agrava o reflow do editor a 200%                    | Rail compacto por padrão no editor < 1440px (tokens §4.3/4.4); gate da fase 6 (200% sem perda) vale aqui                                                |
| P-1.3 | Usuário perdido na mudança (Equipes sumiu? Editor sumiu?)                  | Item Ferramentas aceso quando editor/assistente abertos; primeira visita pós-migração mostra um toast de uma linha ("Editor agora vive em Ferramentas") |
| P-1.4 | `teamTab`/`communityTab` criam mais estados-navegação órfãos (estudo §9.1) | Todos os sub-estados declarados no store central (`session.ts`), nunca `useState` local; documentados em `specs/design.md` §7                           |
| P-1.5 | Landing como página quebra fluxo de convite (`#convite=` pulava a landing) | Fluxo preservado: convite → login → `equipe` (teste existente do DF-10 cobre; estender p/ PageId novo)                                                  |

## 7. Critérios de aceite

| #         | Critério                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AC-DF12.1 | Logado cai em Início; deslogado na landing; logout volta à landing; convite aterrissa em Equipe                                   |
| AC-DF12.2 | Rail navega pelos 4 destinos + Admin (isAdmin) com `aria-current` correto; Sobre alcançável pelo menu de conta; Tab percorre tudo |
| AC-DF12.3 | Abrir Validador pelo hub, ir a Equipe e voltar: câmera e cena 3D preservadas (sem remontagem)                                     |
| AC-DF12.4 | Item Ferramentas aceso com editor ou assistente abertos                                                                           |
| AC-DF12.5 | Página Equipe com 4 abas ARIA; toda capacidade do DF-10 alcançável (paridade funcional)                                           |
| AC-DF12.6 | Hub mostra estado real (versão/contagens do projeto da temporada; quota do assistente)                                            |
| AC-DF12.7 | Rótulos novos aplicados; zero `(DF-n)` na UI; disclaimer visível em todas as páginas                                              |
| AC-DF12.8 | Zero hex fora de tokens nas superfícies novas (`check-tokens` sem exceções novas)                                                 |
| AC-DF12.9 | 1366×768, 1024×768 e 1366×768\@200% verificados (roteiro da fase 6 do plano de design)                                            |

## 8. Riscos e questões em aberto

1. **Ordem dos destinos** — Início antes de Equipe segue o canvas; se o piloto mostrar que todo
   mundo vive na Equipe, inverter é troca de 2 linhas.
2. **Rail compacto em páginas de conteúdo** — v1 mantém expandido ≥ 1200px; medir em notebook
   1366 se rouba largura demais da tabela de resultados.
3. **`popstate` mínimo** (Voltar do navegador sem router) — Could; entra num PR próprio se a
   perda do botão Voltar incomodar no piloto.
4. **Multi-equipe** — o seletor v1 é simples (lista); persistência da "equipe ativa" por
   localStorage pode confundir em máquina compartilhada de oficina. Observar.
5. **Vocabulário fail/manual** — INFRAÇÃO/PRESENCIAL (§11.3 vigente) × NÃO CONFORME/VERIFICAÇÃO
   PRESENCIAL (estudo §9.4 + canvas). Decisão do product owner (fase 2.6 do plano de design),
   bloqueante para a primeira superfície nova — ver RF-4.2.
