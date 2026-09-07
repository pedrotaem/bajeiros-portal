# ADR-013: Regulamento embutido — modo de leitura dentro do portal

**Status:** substituído por [ADR-014](014-copia-do-regulamento.md) (2026-09-06)

A condição de promoção escrita abaixo ("autorização escrita arquivada em `docs/legal/`")
**não foi cumprida nem esperada**: o dono do produto decidiu com outro fato — a organização
distribui o PDF em download aberto — e o ADR-014 troca a autorização prévia por procedência
verificável (URL de origem, data e hora do download, sha256 conferido). O que segue é o
registro do raciocínio anterior.

## Contexto

O DF-34 entregou a página Regulamento no modo **`ponteiro`**: índice completo (1 360 itens
com número e página, título só onde ele é título de seção), navegação entre seções, versões
por competição, referências do acervo e a ponte com o assistente. Para LER, a página abre o
PDF oficial da organização em `<url>#page=N`.

O pedido do dono do produto era "ler o regulamento na íntegra dentro do portal". A metade que
falta — renderizar o PDF na própria tela (pdf.js) — não é problema técnico: é reprodução da
obra da organização a partir da origem do portal. O repositório proíbe o texto do regulamento
desde o DF-8 (citações ≤ 25 palavras, `scripts/ingest.ts` do gateway não versiona o corpus), e
o índice gerado neste PR falha o build se um título de nível ≥ 3 (que é texto do regulamento)
aparecer no artefato.

Duas limitações do `ponteiro` são reais e conhecidas: `#page=N` é ignorado pela maioria dos
visualizadores de PDF em celular (a tela avisa), e não existe busca no texto integral.

## Decisão

Não construir o modo `embutido` enquanto não houver autorização escrita para espelhar o PDF
**inalterado, com atribuição e link para o original**.

Quando (e se) ela vier, o modo entra assim:

1. `REGULATION_READER_MODE=embutido` no ambiente (mesmo padrão do `comingSoon` do DF-27 e do
   `EVOLUTION_MODE` do DF-20) — nenhuma tela muda de layout: o índice, o painel, a ponte com o
   assistente e o disclaimer são os mesmos nos dois modos.
2. PDF espelhado em bucket privado servido pelo CloudFront em `/regulamento/<edition>.pdf`,
   `Content-Disposition: inline`. O `deploy.yml` **não** baixa da organização: o arquivo entra
   por operação (runbook), com o hash conferido contra `regulation_versions.pdf_sha256`.
3. Divergiu o hash → cai para `ponteiro` sozinho e diz por quê. Sem arquivo → idem.
4. pdf.js em chunk sob demanda (~1 MB), `worker-src 'self'` na CSP; nada muda no bundle do
   modo `ponteiro`.

## Consequências

- O portal continua útil sem a autorização: o que o pedido chamou de "navegação fluida" já
  está entregue, e é a metade que o portal pode fazer sozinho.
- O risco de direito autoral fica isolado num interruptor e num ADR, não espalhado no código.
- A dependência é de terceiro: se a resposta não vier, a decisão não expira sozinha — ela
  simplesmente segue proposta, e o `ponteiro` segue sendo o produto.
- `regulation_versions.pdf_sha256` já é obrigatório desde a migração `0013`, mesmo sem o modo
  embutido: é ele que faz a curadoria conferir o arquivo antes de cadastrar a emenda.
