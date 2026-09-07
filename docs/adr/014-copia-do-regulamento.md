# ADR-014: Cópia do regulamento servida pelo portal, com procedência

**Status:** aceito (2026-09-06). Substitui o [ADR-013](013-regulamento-embutido.md).

## Contexto

O ADR-013 deixou a leitura do regulamento dentro do portal travada em "autorização escrita
da organização". O dono do produto decidiu diferente, com o fato na mão: **a organização
distribui o PDF em download aberto**, sem login, sem termo de aceite e sem restrição
técnica (`https://arquivos.saebrasil.org.br/…/RATBSB_emenda_07.pdf` responde 200 a qualquer
cliente). O regulamento é o documento que a competição exige que toda equipe leia; escondê-lo
atrás de um link para fora não protege ninguém e piora a vida de quem precisa dele.

A proteção que importa não é a ausência da cópia — é o **rastro**: quem lê tem que saber
exatamente qual arquivo está vendo, de onde ele veio e quando foi baixado.

## Decisão

O portal serve uma cópia **inalterada** do PDF oficial pela própria origem, sempre
acompanhada da procedência.

1. `scripts/baixar-regulamento.mjs` baixa da URL oficial e grava dois arquivos em
   `apps/web/public/regulamento/`: `<edition>.pdf` (byte a byte o que a organização
   publicou) e `copia-<edition>.json` com **url de origem, `downloadedAt` (data e hora),
   `sha256`, tamanho e o `Last-Modified`/`ETag` declarados pelo servidor da fonte**.
2. A página mostra a procedência na faixa fixa da fonte e no rodapé do leitor: "Cópia do PDF
   oficial baixada em 06/09/2026 21:40 de <url>, conferida por hash". O link para o
   documento oficial continua em toda tela, e o disclaimer de que o portal não substitui a
   leitura na fonte não muda.
3. A leitura acontece no **visualizador de PDF do próprio navegador**, num `<iframe>` de
   mesma origem apontando para `#page=N` da seção. Sem pdf.js: busca, zoom e contagem de
   páginas já vêm do navegador, e não entra 1 MB de dependência no bundle.
4. **Quem liga o modo é o arquivo, não uma variável de ambiente.** Existindo cópia cujo
   `sha256` bate com `regulation_versions.pdf_sha256` (o mesmo hash que o manifest do
   gateway registrou), a leitura embutida aparece; faltando a cópia ou divergindo o hash, a
   página volta sozinha ao modo `ponteiro` e diz por quê (FR-DF34.11).
5. Nada é modificado no arquivo: sem marca d'água, sem recorte, sem re-tipografia, sem
   extrair texto para o repositório. O texto do regulamento continua fora do código
   (DF-8) — o que existe no repo é o PDF da organização e metadado.

## Consequências

- O pedido original do dono do produto ("ler o regulamento na íntegra dentro do portal")
  está atendido, e a citação do assistente leva à página da seção **no documento**.
- O rastro é verificável por qualquer pessoa: hash publicado, URL de origem e horário do
  download. Se a organização pedir a retirada, apagar dois arquivos devolve o modo
  `ponteiro` sem tocar em tela nenhuma.
- Reconferir a cópia é operação, não deploy automático: o script tem `--expect-sha`, e hash
  diferente na mesma URL **para o processo** — isso é emenda ou errata, não rotina.
- O repositório passa a versionar ~5 MB de PDF por emenda (uma por ano). É o preço de a
  cópia ser publicada pelo mesmo caminho que o resto do site, sem infraestrutura nova.
- Fica de fora, e sem previsão: espelhar em bucket próprio com invalidação separada
  (§5.3 da spec). Se um dia o repositório pesar, é para lá que isso vai.
