# ADR-012: Rota pública sem autenticação — `/api/v1/public/*`, cacheada na borda

**Status:** aceito (2026-09-06, decisão do §10.2 do [DF-33](../../specs/drafts/df33-calendario-competicoes.md))
— validado pelo merge do PR #55 (`87f1dbd`): `apps/api/src/test/calendar.test.ts` cobre a resposta
sem `Authorization`, o cabeçalho de cache e a ausência de qualquer dado de equipe no payload
público; a suíte de RLS continua verde.

## Contexto

Até aqui **toda** rota sob `/api/v1` passava pelo `requireAuth`. A única exceção que existiu — o
assistente aceitando anônimo, para a degustação — foi removida pelo DF-28 junto com o middleware
`optionalAuth`, com motivo escrito: middleware de auth frouxo sem call site é convite a montar uma
rota com ele por engano.

O DF-33 pede um calendário que abra **sem conta** (§3.3): é informação pública sobre fonte pública,
e é o que o portal promete antes do cadastro — a mesma lógica da vitrine do DF-25. Atrás do login,
quem ainda não tem conta não vê justamente a coisa mais concreta que o portal oferece: o prazo que
a equipe dele precisa cumprir.

Duas restrições apertam a escolha. O Aurora dorme a 0 ACU e acorda em ~15 s ([ADR-007](007-rds-data-api.md)),
então tráfego anônimo batendo no banco é caro em latência. E a curadoria muda o dado **sem deploy**
(a administração salva um marco novo a qualquer hora), então um instantâneo gerado no build
envelhece sem ninguém perceber.

## Decisão

Rota pública **só** sob o prefixo `/api/v1/public/*`, montada antes do `requireAuth`, com três
amarras:

1. **Leitura, sempre.** O acesso ao banco é o `withPublic` (`apps/api/src/db/index.ts`): abre a
   transação **sem** `app.user_id`, e por isso só policy `USING (true)` responde. Não existe
   `withPublic` de escrita, e não deve existir.
2. **Cache na borda.** A resposta sai com `Cache-Control: public, max-age=3600` e o CloudFront tem
   behavior próprio para o prefixo, com cache policy cuja chave é só a query `season` — nenhum
   header, nenhum cookie.
3. **RLS explícita por tabela.** Na migração `0012` apenas as três tabelas do calendário
   (`competitions`, `source_documents`, `competition_milestones`) ganharam policy de SELECT
   pública. Tabela sem essa policy devolve zero linha na rota pública: a falha é fechada, não
   aberta.

_Alternativas:_ **instantâneo estático datado** no front, no padrão do DF-25 (gerado no deploy) —
rejeitada porque a curadoria muda o dado fora do deploy, então o instantâneo mentiria até o próximo
build, ou exigiria um job que o regenerasse a cada salvar da administração (S3 + invalidação): mais
peças para o mesmo resultado. **Manter tudo atrás do `requireAuth`** — rejeitada porque transforma
em muro a informação com que o portal convida; quem não tem conta é exatamente quem mais precisa
saber o prazo.

**Melhor argumento contra:** a exceção que o DF-28 fechou volta a existir, agora com status de
convenção — e convenção não é executável. Nada impede que alguém monte amanhã uma rota de escrita
sob `/public`; a defesa é a revisão de PR. A mitigação de verdade é a RLS: sem `app.user_id`, a
escrita indevida esbarra na policy antes de chegar ao dado — mas ela protege o banco, não a
superfície.

## Consequências

- Visitante lê o calendário e baixa o `.ics` sem conta, e a Aurora não acorda a cada visita porque
  a borda responde por até 1 h.
- Em compensação, o que a curadoria salva pode levar até 1 h para aparecer ao visitante. Quando a
  diferença importa, o caminho é invalidar `/api/v1/public/*` (runbook).
- Toda tabela nova nasce **privada** por omissão; publicar exige policy explícita no mesmo PR da
  migração.
- O contrato ODCS registra a visibilidade: `calendar` 1.0.0 e `competition` 1.1.0 dizem "leitura
  pública" em `customProperties`. Resultados e registro de equipes continuam exigindo conta.
- O DF-34 (leitor do regulamento), quando for implementado, herda este prefixo em vez de abrir
  outro.
