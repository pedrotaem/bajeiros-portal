import type { AreaId, AuditWave, CatalogMode, Criterion, Level } from './types'

/**
 * Catálogo de critérios v2.0.0 (DF-19) — 51 critérios, 6 áreas × níveis 1–5.
 *
 * GOVERNANÇA (DF-13 §9 / DF-19 §7): isto é código e muda por PR como qualquer regra
 * do motor B6. O campo `research` amarra cada linha à pesquisa de mercado
 * (`Pesquisa de Mercado/praticas-elite.md` = "prática N";
 *  `Pesquisa de Mercado/dificuldades-por-tier.md` = "dificuldade …") — sem essa âncora
 * o critério é calibração de gabinete, que é o risco nº 1 da feature (P-1.1).
 *
 * O QUE MUDOU DO v1.0.0, e por quê a versão é MAIOR (DF-19 RF-1.5):
 *  - nenhum critério novo, nenhum removido: os mesmos 51;
 *  - cada um ganhou os quatro textos do §3 — `question`, `fulfilled`, `notValid`,
 *    `where` — mais `audit`, que diz qual dado vai confrontá-lo no DF-20;
 *  - **o tipo `oculto` deixou de existir** (RF-1.4). `EST-4.1` e `DOC-4.2` foram
 *    reescritos como afirmação sobre o MUNDO REAL (a ficha existe) em vez de sobre a
 *    ferramenta (o portal gerou a ficha), viraram `declarado` e entraram no
 *    denominador: 51 visíveis, 51 respondíveis. Como o denominador mudou e níveis
 *    existentes podem se mover, a versão é maior;
 *  - `type` não decide mais o cálculo, decide o rótulo (RF-1.2): quem decide é
 *    `CATALOG_MODE`.
 *
 * RF-4.8 — NENHUM enunciado exige ferramenta do portal. Onde o portal tem ferramenta
 * ela é o "caminho fácil", e o texto diz isso: quem projeta em CAD responde igual e
 * sobe igual. É a regra que impede a aferição do DF-20 de transformar "não usei esta
 * ferramenta" em "menti".
 */
export const CATALOG_VERSION = '2.0.0'

/**
 * DF-19 RF-1.1 — a v1 da avaliação é AUTODECLARATIVA: a equipe responde tudo, o
 * portal registra, calcula e não discute. A evidência automática continua sendo
 * produzida e mostrada ao lado da resposta (RF-1.3) — ela só não decide ainda.
 *
 * Virar `'aferido'` liga o DF-20 e NÃO exige migração (AC-DF19.10): é o mesmo dado,
 * outro caminho no motor. A API lê `EVOLUTION_MODE` do ambiente, com este valor
 * como default.
 */
export const CATALOG_MODE: CatalogMode = 'declarado'

/** Mudanças de catálogo aparecem na atividade da equipe com o delta explicado (P-1.3). */
export const CATALOG_CHANGELOG: readonly { version: string; note: string }[] = [
  { version: '1.0.0', note: 'Catálogo inicial (51 critérios), DF-13 §4, pendente do piloto.' },
  {
    version: '2.0.0',
    note:
      'Modo autodeclarativo (DF-19). Os mesmos 51 critérios ganham enunciado, régua, ' +
      'contra-exemplo e onde registrar; some o tipo oculto e o denominador passa a 51 ' +
      'visíveis (EST-4.1 e DOC-4.2 entram como declarados).',
  },
]

interface Spec {
  id: string
  area: AreaId
  level: Level
  type: Criterion['type']
  label: string
  source: string
  research: string
  question: string
  fulfilled: string
  notValid: string
  where: string
  wave: AuditWave
  audit: string
  seasonal?: boolean
  linkHint?: Criterion['linkHint']
}

const c = (s: Spec): Criterion => ({
  id: s.id,
  area: s.area,
  level: s.level,
  type: s.type,
  label: s.label,
  source: s.source,
  research: s.research,
  question: s.question,
  fulfilled: s.fulfilled,
  notValid: s.notValid,
  where: s.where,
  audit: { wave: s.wave, note: s.audit },
  seasonal: s.seasonal,
  linkHint: s.linkHint,
})

export const CATALOG: readonly Criterion[] = [
  // ---------------------------------------------------------------- estrutura
  c({
    id: 'EST-1.1',
    area: 'estrutura',
    level: 1,
    type: 'auto',
    label: 'Projeto do protótipo registrado no portal',
    source: 'validador ou ficha do protótipo',
    research: 'dificuldade iniciante: projeto vive em arquivo local de uma pessoa',
    question: 'O projeto do protótipo desta temporada está registrado no portal?',
    fulfilled:
      'Existe um projeto designado como o da temporada e ele tem conteúdo, gaiola modelada ' +
      'com ao menos uma versão salva OU ficha do protótipo com a seção de identificação e ' +
      'dimensões preenchida (DF-21). Os dois caminhos valem igual.',
    notValid:
      'Arquivo no computador de alguém, no Drive da equipe ou aberto no editor sem salvar; ' +
      'projeto criado com nome e mais nada. O ponto é tirar o projeto da máquina de uma ' +
      'pessoa, não obrigar a usar o editor 3D.',
    where: 'O próprio projeto, designado em Equipe · Projetos.',
    wave: 'V1',
    audit: 'existe `validation.summary` ou ficha com conteúdo',
  }),
  c({
    id: 'EST-2.1',
    area: 'estrutura',
    level: 2,
    type: 'auto',
    label: 'Gaiola completa, sem pendências de presença',
    source: 'validador',
    research: 'dificuldade iniciante: gaiola incompleta chega à inspeção',
    question: 'O projeto da gaiola está completo, todos os membros obrigatórios previstos?',
    fulfilled:
      'O projeto contempla todos os membros obrigatórios. Caminho fácil: a última versão ' +
      'salva no validador sem nenhuma pendência de presença. Quem projeta em CAD confere ' +
      'contra o regulamento e responde igual.',
    notValid:
      'Gaiola em que falta o arco traseiro, a proteção lateral ou a amarração, mesmo que ' +
      '"a equipe sabe que vai fazer". Presença é diferente de conformidade: aqui só se ' +
      'pergunta se a peça existe no modelo.',
    where: 'O projeto da temporada.',
    wave: 'V1',
    audit: 'contagem de pendências de presença em `validation.summary`',
  }),
  c({
    id: 'EST-2.2',
    area: 'estrutura',
    level: 2,
    type: 'declarado',
    label: 'Seções e materiais conferidos com o que será fabricado',
    source: 'capitania',
    research: 'dificuldade iniciante: tubo comprado diverge do projetado',
    question:
      'As seções e o material dos tubos do projeto conferem com o que a equipe vai comprar e soldar?',
    fulfilled:
      'Alguém confrontou a lista de tubos do projeto (diâmetro, parede, aço) com o que está ' +
      'disponível/comprado, e a divergência ou foi corrigida no projeto ou está registrada.',
    notValid:
      'Ter escolhido o material no dropdown do editor sem conferir com o fornecedor. O modo ' +
      'de falha clássico da faixa iniciante é o tubo comprado divergir do projetado e a não ' +
      'conformidade só aparecer na inspeção.',
    where: 'Decisão no diário ("tubo primário: 1020 Ø31,75×1,5 porque…"), com link.',
    wave: 'V2',
    audit: 'classe de material do projeto × equivalência B6.3.3.2, parcial',
    linkHint: 'decision',
  }),
  c({
    id: 'EST-3.1',
    area: 'estrutura',
    level: 3,
    type: 'auto',
    label: 'Zero infrações automáticas na versão salva',
    source: 'validador',
    research: 'prática 1: conformidade tratada como requisito de projeto, não de inspeção',
    question: 'O projeto do protótipo atende a todas as regras verificáveis em desenho?',
    fulfilled:
      'Nenhuma regra que se confere sobre a geometria está violada. Caminho fácil: o ' +
      'validador não aponta infração automática na última versão salva. Quem confere à mão ' +
      'contra o regulamento responde igual, e aceita o custo de conferir ~40 verificações ' +
      'a cada mudança. Itens presenciais não contam aqui: são o EST-3.2.',
    notValid:
      '"Está quase", "só falta um ângulo", ou zerar as infrações num rascunho não salvo. ' +
      'Rascunho aberto no editor não conta em nenhum critério.',
    where: 'O projeto da temporada.',
    wave: 'V1',
    audit: 'contagem de `fail` em `validation.summary`, exemplo canônico de contradição direta',
  }),
  c({
    id: 'EST-3.2',
    area: 'estrutura',
    level: 3,
    type: 'declarado',
    label: 'Itens presenciais revisados em reunião, com registro',
    source: 'capitania',
    research: 'prática 1: revisão de conformidade em rito da equipe',
    question:
      'A equipe revisou em reunião os itens do checklist que só dá para verificar presencialmente?',
    fulfilled:
      'Houve uma reunião dedicada em que os itens presenciais foram percorridos um a um, com ' +
      'o resultado registrado, inclusive os que ficaram pendentes.',
    notValid:
      'Ter lido o regulamento; ter conversado no grupo; um único membro ter conferido sozinho ' +
      'sem registro. O critério é sobre o RITO.',
    where: 'Decisão no diário com a ata da revisão (link obrigatório na prática).',
    wave: null,
    audit: 'só existe com a marcação item a item do checklist manual (v2 do DF-13), sem onda',
    linkHint: 'decision',
  }),
  c({
    id: 'EST-4.1',
    area: 'estrutura',
    level: 4,
    type: 'declarado',
    label: 'Ficha da gaiola (Anexo B) preenchida e conferida',
    source: 'capitania',
    research: 'prática 4: documentação como entregável',
    question:
      'A ficha técnica da gaiola exigida pela inspeção está preenchida e confere com o projeto?',
    fulfilled:
      'A ficha existe, está preenchida com as medidas e materiais do protótipo desta ' +
      'temporada, e alguém a conferiu contra o projeto salvo.',
    notValid: 'Ficha do ano passado; ficha preenchida "de cabeça" sem confrontar com o modelo.',
    where: 'Link para o documento onde a ficha vive.',
    wave: 'V3',
    audit:
      'era `oculto` no v1.0.0; vira `auto` quando a ferramenta "Ficha da gaiola" nascer, e o ' +
      'enunciado estreita para "gerada a partir do projeto validado"',
    linkHint: 'url',
  }),
  c({
    id: 'EST-4.2',
    area: 'estrutura',
    level: 4,
    type: 'declarado',
    label: 'Revisão do projeto por outro membro, registrada',
    source: 'capitania',
    research: 'prática 3: revisão por pares',
    question:
      'O projeto da gaiola foi revisado por alguém que não o desenhou, com o resultado registrado?',
    fulfilled:
      'Um segundo membro percorreu o projeto e registrou o que encontrou, inclusive "nada a ' +
      'apontar", desde que fique claro quem revisou e quando.',
    notValid: 'O próprio autor revisando; aprovação verbal na oficina; "o capitão viu".',
    where: 'Decisão no diário, com o nome do revisor.',
    wave: 'V2',
    audit: 'autoria por versão em `snapshots` × revisor declarado, indício',
    linkHint: 'decision',
  }),
  c({
    id: 'EST-4.3',
    area: 'estrutura',
    level: 4,
    type: 'declarado',
    label: 'Análise estrutural (FEA) realizada e arquivada',
    source: 'capitania',
    research: 'prática 2: simulação antes da fabricação',
    question: 'A equipe fez análise estrutural do chassi nesta temporada e guardou o resultado?',
    fulfilled:
      'Existe uma simulação estrutural do chassi desta temporada, com os casos de carga ' +
      'usados anotados, e o arquivo/relatório está acessível para a próxima geração.',
    notValid:
      'FEA de um chassi de temporada anterior; imagem colorida sem casos de carga declarados; ' +
      'simulação que ninguém consegue mais abrir ou encontrar.',
    where: 'Link externo (Drive, repositório). O portal não hospeda o arquivo.',
    wave: null,
    audit: 'acontece fora do portal, segue só declarado, e a tela diz isso',
    linkHint: 'url',
  }),
  c({
    id: 'EST-5.1',
    area: 'estrutura',
    level: 5,
    type: 'declarado',
    label: 'Gaiola fabricada conferida contra o projeto (as-built)',
    source: 'capitania',
    research: 'prática 6: controle entre projeto e peça fabricada',
    question: 'Depois de soldada, a gaiola foi medida e comparada com o projeto?',
    fulfilled:
      'Houve medição do quadro real (pontos denominados, vãos críticos, altura do arco) ' +
      'comparada com o projeto, e os desvios foram registrados, corrigidos ou aceitos.',
    notValid: 'Conferência visual; "encaixou, então está certo"; medir só o que era fácil.',
    where: 'Decisão no diário com a tabela de desvios, ou link para a planilha.',
    wave: null,
    audit: 'exigiria entrada de medidas as-built no portal, sem onda na v2',
    linkHint: 'url',
  }),
  c({
    id: 'EST-5.2',
    area: 'estrutura',
    level: 5,
    type: 'declarado',
    label: 'Lições da inspeção técnica registradas',
    source: 'capitania',
    research: 'prática 10: ciclo de lições aprendidas',
    question: 'O que a inspeção técnica apontou na última competição está registrado no diário?',
    fulfilled:
      'Existe registro do que a inspeção pediu, do que foi ajustado no local e do que precisa ' +
      'mudar no projeto do ano seguinte.',
    notValid:
      '"Passamos de primeira" sem registro; lembrança na cabeça do capitão que se forma. É ' +
      'exatamente o conhecimento que a rotatividade apaga.',
    where: 'Decisão no diário, marcada como pós-competição.',
    wave: 'V2',
    audit: 'decisão em janela pós-competição do calendário do DF-15, indício fraco',
    seasonal: true,
    linkHint: 'decision',
  }),

  // ----------------------------------------------------------------- dinamica
  c({
    id: 'DIN-1.1',
    area: 'dinamica',
    level: 1,
    type: 'declarado',
    label: 'Responsáveis de dinâmica e trem de força definidos no organograma',
    source: 'capitania',
    research: 'dificuldade iniciante: subsistema sem dono',
    question: 'Existe alguém nomeado como responsável por suspensão/direção e por trem de força?',
    fulfilled: 'Os dois papéis têm ocupante no organograma da equipe.',
    notValid: '"Todo mundo mexe em tudo"; um nome que a pessoa não sabe que é dela.',
    where: 'Organograma, em Equipe · Pessoas.',
    wave: 'V1',
    audit: '`org.summary` traz os nós de liderança ocupados',
  }),
  c({
    id: 'DIN-2.1',
    area: 'dinamica',
    level: 2,
    type: 'auto',
    label: 'Ancoragens de suspensão apoiadas em tubo',
    source: 'validador',
    research: 'dificuldade iniciante: ancoragem no ar reprovada na inspeção',
    question: 'Todos os pontos de ancoragem da suspensão do projeto estão apoiados em tubo?',
    fulfilled:
      'As 20 ancoragens (bandejas superior/inferior e amortecedor, dianteira e traseira, dos ' +
      'dois lados) estão posicionadas sobre membros do quadro. Caminho fácil: a verificação ' +
      'SUSP.1 do validador, que aplica a tolerância. Quem projeta em CAD confere lá.',
    notValid: 'Ancoragem "flutuando" perto do tubo; ancoragem que a equipe pretende reposicionar.',
    where: 'O projeto da temporada.',
    wave: 'V1',
    audit: 'verificação SUSP.1 em `validation.summary`',
  }),
  c({
    id: 'DIN-2.2',
    area: 'dinamica',
    level: 2,
    type: 'auto',
    label: 'Ancoragem da direção apoiada',
    source: 'validador',
    research: 'dificuldade iniciante: fixação do volante fora de tubo',
    question: 'O ponto de fixação da caixa/coluna de direção está apoiado em tubo no projeto?',
    fulfilled:
      'O ponto de fixação da direção está definido e apoiado em tubo. Caminho fácil: a ' +
      'verificação STEER.1 do validador. Equipe que ainda não definiu a fixação responde ' +
      '"não": o critério não é dispensável por omissão.',
    notValid: 'Direção resolvida "na hora da montagem".',
    where: 'O projeto da temporada.',
    wave: 'V1',
    audit: 'verificação STEER.1 em `validation.summary`',
  }),
  c({
    id: 'DIN-3.1',
    area: 'dinamica',
    level: 3,
    type: 'declarado',
    label: 'Geometria de suspensão documentada',
    source: 'capitania',
    research: 'prática 2: decisão de projeto com memória de cálculo',
    question: 'A geometria de suspensão do protótipo tem memória de cálculo arquivada?',
    fulfilled:
      'Existe documento com os parâmetros escolhidos (curso, cambagem, cáster, convergência, ' +
      'centro de rolagem, relação de instalação) E o porquê de cada um, mesmo que o cálculo ' +
      'seja simples.',
    notValid:
      'Planilha com números sem justificativa; geometria copiada de outra equipe sem ' +
      'adaptação registrada; "está no CAD".',
    where: 'Link para a memória de cálculo + decisão no diário resumindo a escolha.',
    wave: 'V2',
    audit:
      'massa do protótipo × mediana da comunidade, indício quantitativo. Massa muito acima ' +
      'da mediana torna implausível que a geometria tenha sido calculada com a massa real',
    linkHint: 'url',
  }),
  c({
    id: 'DIN-3.2',
    area: 'dinamica',
    level: 3,
    type: 'declarado',
    label: 'Setup de transmissão registrado por condição de uso',
    source: 'capitania',
    research: 'dificuldade intermediária: setup empírico não registrado',
    question: 'O ajuste do CVT/transmissão está registrado, com a condição de uso de cada ajuste?',
    fulfilled:
      'Existe registro de qual configuração é usada em que prova (aceleração, tração, enduro) ' +
      'e o que muda entre elas.',
    notValid: 'Um único ajuste "que funciona"; ajuste na memória do responsável.',
    where: 'Guia da equipe (o formato certo, porque é procedimento repetível), com link.',
    wave: 'V2',
    audit: 'mesmo indício de massa do DIN-3.1',
    linkHint: 'guide',
  }),
  c({
    id: 'DIN-4.1',
    area: 'dinamica',
    level: 4,
    type: 'declarado',
    label: 'Teste de bancada com resultado registrado',
    source: 'capitania',
    research: 'prática 5: testar antes de competir',
    question: 'Ao menos um subsistema foi testado em bancada, com o resultado anotado?',
    fulfilled:
      'Houve um ensaio controlado (amortecedor, freio, transmissão, o que for) com ' +
      'procedimento e resultado registrados, incluindo o que não deu certo.',
    notValid: '"Rodamos o carro e pareceu bom"; teste sem número anotado.',
    where: 'Decisão ou guia com o procedimento e o resultado.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'url',
  }),
  c({
    id: 'DIN-4.2',
    area: 'dinamica',
    level: 4,
    type: 'declarado',
    label: 'Coleta de dados em pista realizada',
    source: 'capitania',
    research: 'prática 8: decisão por dado medido',
    question: 'A equipe já coletou dados instrumentados do carro em pista nesta temporada?',
    fulfilled:
      'Houve ao menos uma sessão com aquisição, mesmo simples (acelerômetro, GPS, célula de ' +
      'carga), com os dados guardados.',
    notValid: 'Cronometrar com celular; impressão do piloto sem dado.',
    where: 'Link para o conjunto de dados + decisão descrevendo a sessão.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'url',
  }),
  c({
    id: 'DIN-5.1',
    area: 'dinamica',
    level: 5,
    type: 'declarado',
    label: 'Aquisição recorrente com análise pós-teste',
    source: 'capitania',
    research: 'prática 8: aquisição como rotina, não evento',
    question: 'A coleta de dados virou rotina, com análise registrada depois de cada sessão?',
    fulfilled:
      'Há mais de uma sessão na temporada E cada uma tem análise registrada que levou a ' +
      'alguma decisão de projeto ou de setup.',
    notValid: 'Coletar sempre e nunca analisar; analisar sem que nada mude.',
    where: 'Decisões no diário, uma por sessão analisada.',
    wave: 'V2',
    audit: 'contagem de decisões da área `dinamica` na temporada, indício',
    linkHint: 'decision',
  }),
  c({
    id: 'DIN-5.2',
    area: 'dinamica',
    level: 5,
    type: 'declarado',
    label: 'Validação cruzada simulação × ensaio',
    source: 'capitania',
    research: 'prática 2 + 5: simulação calibrada por ensaio',
    question: 'Para ao menos um sistema, o resultado simulado foi comparado com o medido?',
    fulfilled:
      'Existe comparação explícita entre o que a simulação previu e o que o ensaio mediu, com ' +
      'a divergência discutida, inclusive quando a simulação errou.',
    notValid: 'Simular e testar sem comparar; comparar e só registrar quando bate.',
    where: 'Link para o relatório de correlação + decisão.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'url',
  }),

  // ------------------------------------------------------------- documentacao
  c({
    id: 'DOC-1.1',
    area: 'documentacao',
    level: 1,
    type: 'declarado',
    label: 'Modelo dos relatórios definido',
    source: 'capitania',
    research: 'dificuldade iniciante: relatório começa do zero todo ano',
    question: 'A equipe já definiu qual modelo vai usar nos relatórios desta temporada?',
    fulfilled:
      'Existe um template escolhido, o oficial da competição ou um próprio, e todo mundo ' +
      'sabe qual é.',
    notValid: '"Vamos usar o do ano passado" sem que alguém saiba onde ele está.',
    where: 'Decisão no diário com link para o template.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'DOC-2.1',
    area: 'documentacao',
    level: 2,
    type: 'declarado',
    label: 'Relatório em escrita, com responsável por seção',
    source: 'capitania',
    research: 'prática 4: documentação com dono',
    question: 'O relatório de projeto está sendo escrito, com um responsável nomeado por seção?',
    fulfilled:
      'O documento existe, está dividido em seções e cada seção tem um nome ao lado. Não ' +
      'precisa estar pronto, precisa ter dono.',
    notValid: 'Documento em branco com títulos; "o capitão escreve tudo no fim".',
    where: 'Link para o documento + decisão com a divisão de seções.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'url',
  }),
  c({
    id: 'DOC-3.1',
    area: 'documentacao',
    level: 3,
    type: 'declarado',
    label: 'Relatório enviado no prazo',
    source: 'capitania',
    research: 'dificuldade intermediária: perda de pontos por atraso de entrega',
    question: 'O relatório foi enviado dentro do prazo da temporada?',
    fulfilled:
      'O envio ocorreu antes do prazo. Enviado com atraso aceito pela organização NÃO cumpre: ' +
      'o critério é sobre disciplina de prazo.',
    notValid: 'Enviar incompleto para bater o prazo.',
    where: 'Decisão no diário com a data de envio.',
    wave: 'V2',
    audit: 'data do marco de entrega em `team_season.milestones` × data da declaração, indício',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'DOC-3.2',
    area: 'documentacao',
    level: 3,
    type: 'declarado',
    label: 'Memórias de cálculo arquivadas por subsistema',
    source: 'capitania',
    research: 'prática 2: memória de cálculo preservada',
    question: 'Cada subsistema tem memória de cálculo arquivada e encontrável?',
    fulfilled:
      'Existe um acervo organizado por subsistema, e um membro novo consegue achar a memória ' +
      'de um sistema sem perguntar a ninguém.',
    notValid: 'Arquivos espalhados em conversas; pasta que só uma pessoa sabe navegar.',
    where: 'Link para o acervo + guia da equipe explicando a organização.',
    wave: 'V2',
    audit: 'existência de guia com etiqueta de acervo, indício fraco',
    linkHint: 'url',
  }),
  c({
    id: 'DOC-4.1',
    area: 'documentacao',
    level: 4,
    type: 'declarado',
    label: 'Revisão por pares de todas as seções',
    source: 'capitania',
    research: 'prática 3: revisão por pares',
    question: 'Todas as seções do relatório foram revisadas por alguém que não as escreveu?',
    fulfilled: 'Cada seção teve um revisor distinto do autor, antes do envio.',
    notValid: 'Revisão só das seções "importantes"; revisão de português sem leitura técnica.',
    where: 'Decisão com a matriz autor × revisor.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'DOC-4.2',
    area: 'documentacao',
    level: 4,
    type: 'declarado',
    label: 'Ficha da gaiola anexada ao pacote de documentos',
    source: 'capitania',
    research: 'prática 4: pacote de documentos completo',
    question: 'A ficha técnica da gaiola foi anexada ao pacote entregue?',
    fulfilled: 'A ficha do EST-4.1 acompanhou a entrega documental da temporada.',
    notValid: 'Ficha levada impressa só para a inspeção, sem constar do pacote.',
    where: 'Decisão no diário com a lista do que foi entregue.',
    wave: 'V3',
    audit: 'era `oculto` no v1.0.0; vira `auto` junto com o EST-4.1',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'DOC-5.1',
    area: 'documentacao',
    level: 5,
    type: 'declarado',
    label: 'Acervo de temporadas anteriores acessível e indexado',
    source: 'capitania',
    research: 'prática 9: acervo geracional acessível',
    question: 'Os relatórios e memórias das temporadas anteriores estão acessíveis e indexados?',
    fulfilled:
      'Existe índice, por ano e por subsistema, e um membro novo abre o material de duas ' +
      'temporadas atrás sem pedir ajuda.',
    notValid:
      'Ter os arquivos em algum lugar; acervo que depende de um veterano para navegar. É o ' +
      'critério que separa "a equipe guarda" de "a equipe consegue usar o que guardou".',
    where: 'Guia da equipe com o índice + link para o acervo.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'url',
  }),

  // ---------------------------------------------------------------- fabricacao
  c({
    id: 'FAB-1.1',
    area: 'fabricacao',
    level: 1,
    type: 'declarado',
    label: 'Acesso a oficina e processo de solda definidos',
    source: 'capitania',
    research: 'dificuldade iniciante: fabricação terceirizada sem controle',
    question: 'A equipe sabe onde vai fabricar e quem vai soldar?',
    fulfilled:
      'O local está garantido para a temporada e o soldador (membro treinado ou terceiro) ' +
      'está definido, com o processo escolhido (TIG, MIG).',
    notValid: '"A gente dá um jeito"; oficina disponível "provavelmente".',
    where: 'Decisão no diário.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'decision',
  }),
  c({
    id: 'FAB-2.1',
    area: 'fabricacao',
    level: 2,
    type: 'auto',
    label: 'Gabaritos de boca de lobo gerados',
    source: 'validador',
    research: 'dificuldade iniciante: corte de tubo por tentativa e erro',
    question: 'A equipe tem gabaritos de corte 1:1 das juntas deste protótipo?',
    fulfilled:
      'Existem gabaritos 1:1 das juntas, prontos para levar à bancada. Caminho fácil: gerar e ' +
      'baixar pelo validador. Gabarito saído do CAD da equipe vale igual.',
    notValid: 'Cortar "no olho" e ajustar na bancada; gabarito de outro projeto.',
    where: 'O validador gera; gabarito externo entra como link na declaração.',
    wave: 'V1',
    audit:
      'existência de `template.generated`, e só dispara contraprova quando existe (RF-4.8): ' +
      'quem gerou por fora não é contradito pela ausência',
    linkHint: 'url',
  }),
  c({
    id: 'FAB-2.2',
    area: 'fabricacao',
    level: 2,
    type: 'declarado',
    label: 'Plano de solda definido',
    source: 'capitania',
    research: 'prática 6: processo de fabricação planejado',
    question: 'Existe uma sequência de solda e um plano de fixação no gabarito?',
    fulfilled:
      'Está escrito em que ordem as peças serão soldadas e como o conjunto fica fixado, a ' +
      'ordem que controla distorção térmica.',
    notValid: '"Solda de baixo para cima"; plano na cabeça do soldador.',
    where: 'Guia da equipe (procedimento repetível). Vira o FAB-3.1 quando publicado.',
    // §5.4 diz "ver FAB-3.1 — V1"; §6 conta 2 aferições em Fabricação (FAB-2.1 e
    // FAB-3.1). A aferição acontece LÁ, não aqui: este critério não tem contraprova
    // própria, e é a tabela do §6 que fecha o denominador de 19.
    wave: null,
    audit: 'a aferição acontece no FAB-3.1 (o plano publicado), sem contraprova própria',
    linkHint: 'guide',
  }),
  c({
    id: 'FAB-3.1',
    area: 'fabricacao',
    level: 3,
    type: 'auto',
    label: 'Sequência de solda publicada como guia',
    source: 'conhecimento (guia com etiqueta "solda")',
    research: 'prática 6 + prática 4: processo virou documento vivo',
    question: 'A sequência de solda está publicada como guia da equipe, e não só combinada?',
    fulfilled:
      'Existe guia publicado, com dono, descrevendo a sequência, de forma que a próxima ' +
      'geração consiga repetir sem o autor.',
    notValid: 'Foto do quadro branco; mensagem no grupo; documento sem dono.',
    where: 'Guia em Equipe · Conhecimento, com a etiqueta de solda.',
    wave: 'V1',
    audit: 'existência do guia com a etiqueta em `knowledge.summary`',
  }),
  c({
    id: 'FAB-3.2',
    area: 'fabricacao',
    level: 3,
    type: 'declarado',
    label: 'Controle dimensional pós-solda registrado',
    source: 'capitania',
    research: 'prática 6: verificação dimensional após fabricação',
    question: 'As medidas do quadro foram conferidas depois da solda, com registro?',
    fulfilled:
      'Houve medição das cotas críticas pós-solda com os valores anotados, ' +
      'independentemente de terem ficado dentro ou fora do previsto.',
    notValid: 'Conferência visual; medir só depois de perceber que algo ficou torto.',
    where: 'Decisão com a tabela de medidas.',
    wave: null,
    audit: 'ver EST-5.1, sem onda na v2',
    linkHint: 'url',
  }),
  c({
    id: 'FAB-4.1',
    area: 'fabricacao',
    level: 4,
    type: 'declarado',
    label: 'Protocolo de testes pré-competição executado',
    source: 'capitania',
    research: 'prática 5: shakedown e teste de freio antes da competição',
    question: 'Existe um protocolo de testes pré-competição e ele foi executado nesta temporada?',
    fulfilled:
      'Há uma lista de verificações (freio, direção, cintos, extintor, shakedown de duração) e ' +
      'o registro de que foi percorrida com o carro montado, com o que reprovou anotado.',
    notValid: 'Dar uma volta no estacionamento; testar só o que deu tempo.',
    where: 'Guia com o protocolo + decisão com o resultado da execução.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'guide',
  }),
  c({
    id: 'FAB-5.1',
    area: 'fabricacao',
    level: 5,
    type: 'declarado',
    label: 'Mula de testes ou bancada própria em operação',
    source: 'capitania',
    research: 'prática 7: frota de testes',
    question: 'A equipe tem um carro anterior rodando como mula de testes, ou bancada própria?',
    fulfilled:
      'Existe um segundo veículo ou uma bancada em condição de uso, sendo usado para testar ' +
      'antes de o carro novo estar pronto, a prática que separa a alta performance.',
    notValid: 'Carro antigo parado no galpão; bancada emprestada uma vez.',
    where: 'Decisão descrevendo o ativo e como está sendo usado.',
    wave: 'V2',
    audit: 'múltiplos projetos ativos da equipe, indício fraco',
    linkHint: 'url',
  }),

  // -------------------------------------------------------------------- gestao
  c({
    id: 'GES-1.1',
    area: 'gestao',
    level: 1,
    type: 'auto',
    label: 'Capitania regular e organograma criado',
    source: 'organograma',
    research: 'dificuldade iniciante: liderança informal e difusa',
    question: 'A equipe tem capitania definida e organograma criado no portal?',
    fulfilled:
      'Existe um capitão (e no máximo dois co-capitães) e o organograma foi montado, mesmo ' +
      'com vagas abertas.',
    notValid: 'Capitania informal; organograma desenhado fora do portal.',
    where: 'Equipe · Pessoas.',
    wave: 'V1',
    audit: '`org.summary`, terceiro exemplo canônico do DF-20 (piso de atividade)',
  }),
  c({
    id: 'GES-2.1',
    area: 'gestao',
    level: 2,
    type: 'auto',
    label: 'Todos os cargos de liderança com ocupante',
    source: 'organograma',
    research: 'dificuldade iniciante: subsistema órfão',
    question: 'Todos os cargos de liderança do organograma têm alguém?',
    fulfilled: 'Nenhum nó marcado como liderança está vago.',
    notValid:
      'Apagar o cargo vago do organograma para "fechar" o critério. O que a área mede é ' +
      'cobertura, e um organograma que esconde a vaga mente para a própria equipe.',
    where: 'Equipe · Pessoas.',
    wave: 'V1',
    audit: 'contagem de vagas de liderança em `org.summary`',
  }),
  c({
    id: 'GES-2.2',
    area: 'gestao',
    level: 2,
    type: 'declarado',
    label: 'Rotina de reunião definida',
    source: 'capitania',
    research: 'prática 3: cadência de reunião',
    question: 'A equipe tem uma rotina de reunião definida, frequência e formato?',
    fulfilled:
      'Existe combinação explícita (quando, onde, quanto tempo, o que se decide ali) e ela ' +
      'está sendo seguida.',
    notValid: '"A gente se fala todo dia"; reunião que acontece quando dá.',
    where: 'Decisão no diário com a rotina.',
    wave: 'V1',
    audit: 'piso de atividade da equipe no portal, indício',
    linkHint: 'decision',
  }),
  c({
    id: 'GES-3.1',
    area: 'gestao',
    level: 3,
    type: 'auto',
    label: 'Temporada configurada com marcos datados',
    source: 'temporada',
    research: 'prática 3: planejamento com marcos e prazo',
    question: 'A temporada está configurada no portal, com os marcos e suas datas?',
    fulfilled:
      'Existe temporada com rótulo, protótipo designado e ao menos os marcos de entrega de ' +
      'documentos e de competição, com data.',
    notValid: 'Datas na cabeça de alguém; calendário em outra ferramenta que a equipe não abre.',
    where: 'Equipe · Evolução, configuração da temporada.',
    wave: 'V1',
    audit: '`season.configured`',
  }),
  c({
    id: 'GES-3.2',
    area: 'gestao',
    level: 3,
    type: 'declarado',
    label: 'Orçamento da temporada elaborado',
    source: 'capitania',
    research: 'dificuldade intermediária: caixa sem previsão',
    question: 'Existe orçamento da temporada, com previsto e realizado acompanhados?',
    fulfilled:
      'Há uma planilha (ou equivalente) com as linhas de custo previstas e algum ' +
      'acompanhamento do que já foi gasto.',
    notValid: 'Lista de desejos sem valores; controle só das notas fiscais.',
    where: 'Link para a planilha + decisão com o total previsto.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'url',
  }),
  c({
    id: 'GES-4.1',
    area: 'gestao',
    level: 4,
    type: 'declarado',
    label: 'Trainees avaliados antes da efetivação',
    source: 'capitania',
    research: 'prática 9: formação de novatos com critério',
    question: 'Os trainees passam por avaliação formal antes de virarem membros efetivos?',
    fulfilled:
      'Existe um critério escrito de efetivação e ele foi aplicado ao último grupo, com ' +
      'resultado registrado.',
    notValid: 'Efetivar quem "apareceu bastante"; avaliação combinada verbalmente.',
    where: 'Guia com o critério + decisão com o resultado da última rodada.',
    wave: 'V2',
    audit: 'trainees promovidos em `org.summary` × existência de guia, indício',
    linkHint: 'guide',
  }),
  c({
    id: 'GES-4.2',
    area: 'gestao',
    level: 4,
    type: 'declarado',
    label: 'Carteira de apoiadores ativa',
    source: 'capitania',
    research: 'dificuldade intermediária: patrocínio pontual, sem carteira',
    question: 'A equipe tem ao menos duas parcerias ativas registradas nesta temporada?',
    fulfilled:
      'Existem duas ou mais parcerias vigentes (dinheiro, material ou serviço) com ' +
      'contrapartida acordada e registrada.',
    notValid: 'Patrocinador de temporadas passadas; contato que "demonstrou interesse".',
    where: 'Decisão com a lista e a contrapartida de cada um.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'GES-5.1',
    area: 'gestao',
    level: 5,
    type: 'declarado',
    label: 'Processo seletivo estruturado praticado',
    source: 'capitania',
    research: 'prática 9: recrutamento como processo da equipe',
    question: 'A entrada de novos membros passa por um processo seletivo estruturado?',
    fulfilled:
      'Existe edital ou funil documentado (divulgação → inscrição → avaliação → resultado) e ' +
      'ele foi praticado na última entrada.',
    notValid: 'Convidar conhecidos; processo escrito mas não aplicado.',
    where: 'Guia com o processo + decisão com o resultado da última seleção.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    linkHint: 'guide',
  }),
  c({
    id: 'GES-5.2',
    area: 'gestao',
    level: 5,
    type: 'declarado',
    label: 'Prestação de contas apresentada à equipe',
    source: 'capitania',
    research: 'prática 3: gestão como pequena empresa',
    question: 'A capitania apresentou a prestação de contas da temporada à equipe?',
    fulfilled:
      'Houve apresentação do previsto × realizado para o time inteiro, com registro de que ' +
      'aconteceu.',
    notValid: 'Planilha compartilhada sem apresentação; prestação só para a capitania.',
    where: 'Decisão no diário com a data e o material apresentado.',
    wave: null,
    audit: 'fora do portal, segue declarado',
    seasonal: true,
    linkHint: 'decision',
  }),

  // -------------------------------------------------------------- conhecimento
  c({
    id: 'CON-1.1',
    area: 'conhecimento',
    level: 1,
    type: 'auto',
    label: 'Ao menos uma decisão registrada no diário',
    source: 'conhecimento',
    research: 'dificuldade nº 1 (rotatividade): a decisão morre no WhatsApp',
    question: 'A equipe já registrou ao menos uma decisão no diário?',
    fulfilled: 'Existe uma decisão registrada, com o contexto e a alternativa descartada.',
    notValid:
      'Anotação sem o porquê. Uma decisão sem alternativa descartada é um comunicado, não uma ' +
      'decisão, e é o registro do porquê que serve à geração seguinte.',
    where: 'Equipe · Conhecimento.',
    wave: 'V1',
    audit: '`decision.created`',
  }),
  c({
    id: 'CON-2.1',
    area: 'conhecimento',
    level: 2,
    type: 'auto',
    label: 'Ao menos 10 decisões e 2 guias publicados',
    source: 'conhecimento',
    research: 'prática 4: registro é hábito, não evento',
    question: 'O diário já tem 10 decisões e a equipe publicou 2 guias?',
    fulfilled:
      'Os dois contadores foram atingidos. São PISOS DE EXISTÊNCIA, não metas: o número ' +
      'existe para marcar que o hábito começou, não para ser perseguido.',
    notValid:
      'Dez decisões registradas na mesma tarde para fechar o critério. O ganho de fazê-lo é ' +
      'zero, porque quem lê o diário vazio depois é a própria equipe.',
    where: 'Equipe · Conhecimento.',
    wave: 'V1',
    audit: 'contadores em `knowledge.summary`',
  }),
  c({
    id: 'CON-2.2',
    area: 'conhecimento',
    level: 2,
    type: 'auto',
    label: 'Trilha de integração de novatos publicada',
    source: 'conhecimento',
    research: 'prática 9: integração estruturada de novatos',
    question: 'Existe uma trilha publicada que um novato percorre para se integrar?',
    fulfilled:
      'Existe guia do tipo trilha, com a sequência do que o novato precisa ler, fazer e com ' +
      'quem falar nas primeiras semanas.',
    notValid: '"O veterano explica"; lista de links sem ordem nem responsável.',
    where: 'Guia do tipo trilha, em Equipe · Conhecimento.',
    wave: 'V1',
    audit: 'existência de guia `kind: trilha`',
  }),
  c({
    id: 'CON-3.1',
    area: 'conhecimento',
    level: 3,
    type: 'auto',
    label: 'Último novato aprovado concluiu a trilha',
    source: 'conhecimento',
    research: 'prática 9: a trilha existe E é percorrida',
    question: 'O novato mais recente concluiu a trilha de integração?',
    fulfilled: 'A conclusão está marcada para a última pessoa que entrou.',
    notValid:
      'Marcar como concluído para fechar o critério; trilha "concluída" por quem já era ' +
      'veterano. O critério mede se a trilha funciona, não se ela existe.',
    where: 'Equipe · Conhecimento, conclusão da trilha.',
    wave: 'V1',
    audit: '`trail.completed` cruzado com a entrada mais recente em `org.summary`',
  }),
  c({
    id: 'CON-3.2',
    area: 'conhecimento',
    level: 3,
    type: 'auto',
    label: 'Decisões em ao menos 3 áreas distintas nos últimos 6 meses',
    source: 'conhecimento',
    research: 'prática 4: registro cobre a equipe inteira, não um subsistema',
    question: 'O diário tem decisões de pelo menos três áreas diferentes nos últimos seis meses?',
    fulfilled:
      'As decisões da janela cobrem três das seis áreas, sinal de que o registro é hábito da ' +
      'equipe, e não de uma pessoa que documenta o próprio subsistema.',
    notValid: 'Vinte decisões, todas de chassi.',
    where: 'Equipe · Conhecimento, com a área marcada em cada decisão.',
    wave: 'V1',
    audit: 'janela temporal em `knowledge.summary`, este critério expira sozinho com o tempo',
  }),
  c({
    id: 'CON-4.1',
    area: 'conhecimento',
    level: 4,
    type: 'auto',
    label: 'Um kit de passagem concluído, nenhum vencido',
    source: 'conhecimento',
    research: 'dificuldade nº 1 (rotatividade): saída sem passagem de bastão',
    question:
      'Já houve uma passagem de cargo concluída com kit, e nenhum kit aberto está com data de ' +
      'saída vencida?',
    fulfilled:
      'Ao menos um kit foi concluído E nenhum kit em aberto passou da data de saída anunciada ' +
      'de quem está saindo.',
    notValid: 'Kit aberto e abandonado; passagem feita "de boca" no último dia.',
    where: 'Equipe · Conhecimento, kits de passagem.',
    wave: 'V1',
    audit: '`kit.opened {dueDate}` e `kit.completed`',
  }),
  c({
    id: 'CON-4.2',
    area: 'conhecimento',
    level: 4,
    type: 'auto',
    label: 'Nenhum guia órfão',
    source: 'conhecimento',
    research: 'prática 4: documento vivo tem dono',
    question: 'Todos os guias publicados têm dono e foram atualizados nos últimos seis meses?',
    fulfilled: 'Não existe guia sem responsável nem guia parado há mais de seis meses.',
    notValid:
      'Atribuir todos os guias a uma pessoa só para zerar os órfãos; "atualizar" mudando uma ' +
      'vírgula.',
    where: 'Equipe · Conhecimento.',
    wave: 'V1',
    audit: 'dono e data em `knowledge.summary`',
  }),
  c({
    id: 'CON-5.1',
    area: 'conhecimento',
    level: 5,
    type: 'declarado',
    label: 'Ritual de lições aprendidas pós-competição',
    source: 'capitania',
    research: 'prática 10: retrospectiva de temporada',
    question:
      'A equipe fez uma reunião de lições aprendidas depois da última competição, com registro?',
    fulfilled:
      'Houve um encontro dedicado, com o time presente, e o resultado virou registro, ' +
      'inclusive o que deu errado.',
    notValid: 'Conversa na viagem de volta; retrospectiva só entre a capitania.',
    where: 'Decisão no diário com as lições e os responsáveis por cada ação.',
    wave: 'V2',
    audit: 'decisão em janela pós-competição do calendário do DF-15, indício',
    seasonal: true,
    linkHint: 'decision',
  }),
  c({
    id: 'CON-5.2',
    area: 'conhecimento',
    level: 5,
    type: 'declarado',
    label: 'Memória de gerações mantida',
    source: 'capitania',
    research: 'prática 9: continuidade entre gerações',
    question: 'A equipe mantém o histórico de quem ocupou cada função ao longo dos anos?',
    fulfilled:
      'Existe registro de gerações, quem foi capitão, quem cuidou de cada subsistema, e como ' +
      'encontrar essas pessoas depois de formadas.',
    notValid: 'Lista de nomes sem função nem ano; grupo de mensagens como "acervo".',
    where: 'Guia da equipe com o histórico (o organograma histórico é DF-10 v2).',
    wave: null,
    audit: 'organograma histórico, quando existir, sem onda na v2',
    linkHint: 'guide',
  }),
]

const BY_ID = new Map(CATALOG.map((cr) => [cr.id, cr]))

export function criterionById(id: string): Criterion | undefined {
  return BY_ID.get(id)
}

/**
 * Critérios da área. Na v2.0.0 são TODOS: o tipo `oculto` morreu (RF-1.4) e o
 * denominador é 51. O nome sobrevive porque é o vocabulário do DF-13 §3.3 e porque
 * uma v3 pode voltar a esconder critério de ferramenta que ainda não existe.
 */
export function visibleCriteria(area: AreaId): Criterion[] {
  return CATALOG.filter((cr) => cr.area === area)
}

/** DF-19 RF-4.4 — os que vencem com a virada da temporada. */
export const SEASONAL_IDS: readonly string[] = CATALOG.filter((cr) => cr.seasonal).map(
  (cr) => cr.id,
)
