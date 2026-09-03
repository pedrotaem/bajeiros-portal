---
name: handoff
description: >
  Fecha a sessão do portal Bajeiros roteando o que ela produziu para as casas permanentes:
  consolida a sessão em histórico no docs/handoff-sessao.md, promove o que foi implementado
  nas specs, registra o que mudou de definição nos ADRs (ou propõe ADR novo) e grava os
  aprendizados no CLAUDE.md em caveman ultra. Use quando o usuário disser "fecha a sessão",
  "roda o handoff", "consolida a sessão", "registra o que foi feito", ou invocar /handoff.
---

# Handoff — rotear a sessão para as casas permanentes

O `docs/handoff-sessao.md` é acumulador, não arquivo morto: ele cresce ~130 linhas por sessão
e 29% do que entra nele nunca mais serve. Esta skill esvazia a sessão para os documentos que
já têm dono, e deixa no handoff só o histórico.

**Raiz do repo:** a pasta que contém esta skill (`.claude/skills/handoff/` mora na raiz do
`bajeiros-portal`). Todos os caminhos abaixo são relativos a ela. Se a sessão tiver sido aberta
num diretório acima, a skill aparece com prefixo (`portal:handoff`) e os caminhos continuam
valendo a partir de `portal/`.

## Antes de tudo

1. **Confira o working tree.** `git status --short`. Se houver mudança que não é da sessão
   atual, **outra sessão pode estar no mesmo working tree** — trabalhe só nos arquivos que
   você tocou e nunca faça `git add -A`.
2. **Não confie no handoff.** Ele é gitignored: sem CI, sem review, já registrou estado falso
   que sobreviveu uma sessão. **Toda afirmação que for virar ADR ou spec tem de ser conferida
   contra o repo** (`git log`, `gh pr view`, o próprio arquivo citado). Afirmação que não
   passar na conferência não é roteada — vira nota de dúvida no histórico.
3. Se o usuário indicar uma seção (`/handoff 2026-09-02`), processe só ela. Sem argumento,
   processe a seção de sessão mais recente.

## Os quatro baldes

Leia a seção da sessão e classifique cada bloco em um destes. O que não couber em nenhum é
perecível.

### 1. Definição mudou → ADR ou doc normativo

**ADR não se edita.** Os ADRs deste repo congelam `## Alternativas` e "melhor argumento contra
a decisão" no momento da decisão; reescrever destrói o registro.

| Situação                                            | Ação                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Regra, token, contrato ou requisito normativo mudou | emenda em `docs/design-system.md`, `specs/rules.md` ou `specs/spec.md` |
| Escolha de nível ADR foi substituída                | **novo** ADR em `docs/adr/`, numeração seguinte                        |
| ADR ficou obsoleto                                  | **uma linha** no antigo: `**Status:** substituído por ADR-0NN`         |
| Decisão de implementação, sem mudar definição       | não é ADR — vai para a spec                                            |

ADR novo segue o formato dos existentes: título, `**Status:** aceito (data, como foi
validado)`, `## Contexto`, `## Decisão` com `_Alternativas:_` e **melhor argumento contra**,
`## Consequências`. Se não houver alternativa considerada nem argumento contra, **não é ADR** —
é anotação, e vai para a spec ou para o histórico.

### 2. Implementação → specs

A convenção está escrita em `specs/draft-features.md` e é esta:

> "Ao ser aprovada e implementada, a spec é promovida para `spec.md` (US/FR) e o arquivo em
> `drafts/` registra o link."

Logo:

- Feature fechada → promove US/FR para `specs/spec.md`, marca `✅` na tabela de
  `specs/draft-features.md`, e o draft **fica onde está** com o link e o status.
- **Não mover nem apagar arquivo de `drafts/`.**
- Feature parcial → atualiza o status do draft (`✅v1`, pendências residuais nomeadas).
- Draft que não está na tabela de ordem de `draft-features.md` → acrescenta a linha.
- Spec que não é do validador (portal, infra, marca) **não vai** para `spec.md`; o status mora
  no próprio draft. Diga isso explicitamente no draft para o próximo não tentar promover.

### 3. Aprendizado → CLAUDE.md, em caveman ultra

Vai para a seção **"Convenções que já custaram caro"** do `CLAUDE.md` da raiz do repo.

**Regra de admissão — as três têm de valer:**

1. Se aplica a **trabalho futuro**, não à sessão que passou.
2. **Não é derivável** do código, do git, do CI ou de um doc normativo.
3. **Não cabe melhor numa guarda executável.**

Corolário: lição que virou teste, lint ou guarda **sai** do CLAUDE.md — a guarda passa a ser o
registro. Ao rotear, verifique se alguma linha já lá virou guarda nesta sessão; se virou, apague.

**Escrita:** invoque `/caveman ultra` e escreva **uma linha por lição**. Sem preâmbulo, sem
justificativa longa, sem "nesta sessão descobrimos que". Padrão: `[coisa] [comportamento]. [o
que fazer].`

- Bom: `check-tokens` **não isenta comentário**. Hex em comentário quebra o lint.
- Ruim: "Durante a implementação da marca, descobrimos que a guarda de tokens também analisa
  comentários, o que causou uma falha inesperada no lint."

**Teto duro: 150 linhas no `CLAUDE.md` inteiro.** Se estourar, não anexe — escolha. Substitua a
lição mais fraca ou funda duas numa. O arquivo carrega em toda sessão; cada linha é imposto
permanente. Relate ao usuário o que foi cortado.

### 4. Perecível → morre

Número de PR, checks verdes, contagem de suíte, working tree, "próximos passos" já feitos,
migração aplicada em dev. Nada disso direciona trabalho futuro. **Não roteie. Não preserve.**

Exceção: pendência **ainda aberta** vira item no histórico com data, ou issue, se o usuário
quiser.

## O que sobra no handoff

Depois de rotear, a seção da sessão vira um toco. Substitua o conteúdo por:

```markdown
# SESSÃO 2026-09-02 — a arte da gaiola entrou nos logos

- **Feito:** marca em dois níveis no portal (PR #44, mergeado).
- **Definições:** — (nenhuma mudou)
- **Specs:** DF-25 § marca atualizada · `drafts/df25-vitrine-publica.md`
- **Aprendizados:** `CLAUDE.md` — guarda de hex em comentário, rail com dois caminhos
- **Aberto:** `og:image` relativo; decidir se acopla domínio por ambiente.
```

Cinco linhas. Quem quiser o detalhe segue o ponteiro até o documento que manda.

Atualize também o bloco `> Ler PRIMEIRO ao retomar` do topo com o estado real de agora.

## Fecho

1. `npm run lint && npm test` — o roteamento mexe em doc, mas o `check-tokens` varre
   `apps/web/src` e uma emenda no design system pode arrastar código junto.
2. Mostre ao usuário, em lista curta: o que foi para cada destino, o que foi descartado como
   perecível, o que foi cortado do CLAUDE.md por teto, e o que não passou na conferência
   contra o repo.
3. **Não commite sem pedir.** Os quatro destinos são versionados e o handoff não, então o
   diff do git é a revisão — e ela é do usuário.
