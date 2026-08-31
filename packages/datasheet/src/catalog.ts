import type { Field, FieldOption, Section, SectionId } from './types'

// Catálogo da ficha do protótipo — DF-21 §5, versão v1.
//
// Regras que o catálogo tem de sustentar sozinho:
//  - RF-1.2: rótulo, ajuda e unidade são canônicos AQUI; nenhuma tela reescreve.
//  - RF-1.4: nenhum campo pode ser marcado como não editável (não existe atributo
//    para isso — a guarda está em catalog.test.ts, AC-DF21.2).
//  - RF-1.5: adicionar campo é mudança menor; remover ou trocar unidade é maior,
//    e a migração dos valores é explícita no PR que fizer isso.
//
// ⚠️ FAIXAS TÍPICAS SÃO DE GABINETE (questão aberta §12.3). Elas nunca bloqueiam
// (RF-4.1/4.3) — servem só de aviso de possível erro de unidade. A alternativa
// honesta registrada na spec é derivá-las do acervo depois do piso de 8 projetos;
// até lá, mudar um par aqui é mudança de texto, não de dado.
export const DATASHEET_VERSION = '1.0.0'

export const SECTIONS: readonly Section[] = [
  {
    id: 'identificacao',
    label: 'Identificação',
    purpose:
      'Quem é este carro. A classe (ocupantes + tração) é o que torna a comparação com a comunidade honesta: sem ela, comparar massa entre carros incomparáveis é ruído.',
  },
  {
    id: 'dimensoes',
    label: 'Dimensões e massa',
    purpose:
      'Os números que a inspeção e o relatório pedem primeiro, e os que mais divergem entre o projetado e o construído.',
  },
  {
    id: 'chassi',
    label: 'Chassi e materiais',
    purpose:
      'O que a gaiola é feita e de onde veio o material — inclusive a rastreabilidade que a inspeção pergunta.',
  },
  {
    id: 'suspensao',
    label: 'Suspensão',
    purpose:
      'Os parâmetros que explicam o comportamento do carro. É a seção que a próxima geração mais procura e menos encontra.',
  },
  {
    id: 'direcao',
    label: 'Direção',
    purpose: 'Relação, curso e geometria — o que define esterçamento e esforço no volante.',
  },
  {
    id: 'freios',
    label: 'Freios',
    purpose:
      'A configuração e o ensaio de travamento das quatro rodas, que é o item cobrado na inspeção.',
  },
  {
    id: 'trem-forca',
    label: 'Trem de força',
    purpose:
      'Motor, CVT e redução: a calibração que costuma viver num grupo de mensagens e se perde na virada de temporada.',
  },
  {
    id: 'eletrica',
    label: 'Elétrica e segurança',
    purpose:
      'Itens de segurança com data de validade. É a seção que evita a surpresa na véspera da competição.',
  },
  {
    id: 'ergonomia',
    label: 'Ergonomia e testes',
    purpose:
      'O piloto de referência e a evidência de que o carro rodou antes da competição — lastro dos critérios de fabricação e dinâmica.',
  },
]

// ---------- opções de enum ----------

const OCUPANTES: FieldOption[] = [
  { id: 'monoposto', label: 'monoposto' },
  { id: 'biposto', label: 'biposto' },
]

const TRACAO: FieldOption[] = [
  { id: 'traseira', label: 'traseira' },
  { id: 'integral', label: 'integral' },
]

const ESTAGIO: FieldOption[] = [
  { id: 'conceito', label: 'conceito' },
  { id: 'projeto', label: 'projeto' },
  { id: 'fabricacao', label: 'fabricação' },
  { id: 'testes', label: 'em testes' },
  { id: 'competiu', label: 'competiu' },
  { id: 'aposentado', label: 'aposentado' },
]

const TRATAMENTO: FieldOption[] = [
  { id: 'nenhum', label: 'nenhum' },
  { id: 'pintura', label: 'pintura' },
  { id: 'zincagem', label: 'zincagem' },
  { id: 'outro', label: 'outro' },
]

const SUSP_DIANT: FieldOption[] = [
  { id: 'duplo-a', label: 'duplo A' },
  { id: 'mcpherson', label: 'McPherson' },
  { id: 'outro', label: 'outro' },
]

const SUSP_TRAS: FieldOption[] = [
  { id: 'duplo-a', label: 'duplo A' },
  { id: 'semi-trailing', label: 'semi-trailing' },
  { id: 'trailing', label: 'trailing' },
  { id: 'outro', label: 'outro' },
]

const DIRECAO_TIPO: FieldOption[] = [
  { id: 'pinhao-cremalheira', label: 'pinhão-cremalheira' },
  { id: 'caixa', label: 'caixa' },
  { id: 'outro', label: 'outro' },
]

const FREIO_CONFIG: FieldOption[] = [
  { id: '4-discos', label: '4 discos' },
  { id: '2-discos-inboard', label: '2 discos + inboard' },
  { id: 'outro', label: 'outro' },
]

const REDUCAO_TIPO: FieldOption[] = [
  { id: 'caixa', label: 'caixa' },
  { id: 'corrente', label: 'corrente' },
  { id: 'correia', label: 'correia' },
  { id: 'combinada', label: 'combinada' },
]

const CINTO_PONTOS: FieldOption[] = [
  { id: '5', label: '5 pontos' },
  { id: '6', label: '6 pontos' },
]

// Percentis do manequim do DF-4 (packages/core/model/manikin.ts): o manequim sugere,
// a equipe escolhe — o campo continua sendo escolha de projeto, não leitura de ferramenta.
const PERCENTIL: FieldOption[] = [
  { id: 'F-P5', label: 'Mulher P5' },
  { id: 'F-P50', label: 'Mulher P50' },
  { id: 'M-P50', label: 'Homem P50' },
  { id: 'M-P95', label: 'Homem P95' },
]

// ---------- campos ----------

export const FIELDS: readonly Field[] = [
  // 5.1 Identificação
  {
    id: 'id.nome',
    section: 'identificacao',
    label: 'Nome do protótipo',
    type: 'text',
    help: 'Como a equipe chama o carro — o apelido que aparece na oficina, não o nome do projeto no portal.',
  },
  {
    id: 'id.temporada',
    section: 'identificacao',
    label: 'Temporada',
    type: 'text',
    maxLength: 20,
    help: 'Ano ou rótulo da temporada deste protótipo. Vem da temporada da equipe quando houver.',
  },
  {
    id: 'id.numero',
    section: 'identificacao',
    label: 'Número do carro',
    type: 'text',
    maxLength: 12,
    help: 'Quando já atribuído pela organização da competição.',
  },
  {
    id: 'id.ocupantes',
    section: 'identificacao',
    label: 'Ocupantes',
    type: 'enum',
    options: OCUPANTES,
    comparable: true,
    help: 'Metade da classe do projeto. Junto com a tração, é o que permite comparar massa com carros comparáveis.',
  },
  {
    id: 'id.tracao',
    section: 'identificacao',
    label: 'Tração',
    type: 'enum',
    options: TRACAO,
    comparable: true,
    help: 'A outra metade da classe. Carro de tração integral carrega mais massa por projeto, não por descuido.',
  },
  {
    id: 'id.estagio',
    section: 'identificacao',
    label: 'Estágio',
    type: 'enum',
    options: ESTAGIO,
    help: 'Em que ponto o protótipo está. Um carro em conceito com ficha vazia é normal; um que competiu com ficha vazia é informação perdida.',
  },

  // 5.2 Dimensões e massa
  {
    id: 'dim.entre-eixos',
    section: 'dimensoes',
    label: 'Entre-eixos',
    type: 'number',
    unit: 'mm',
    absolute: { min: 500, max: 3000 },
    typical: { min: 1300, max: 1700 },
    dual: true,
    comparable: true,
    help: 'Distância entre os centros das rodas dianteira e traseira do mesmo lado.',
  },
  {
    id: 'dim.bitola-dianteira',
    section: 'dimensoes',
    label: 'Bitola dianteira',
    type: 'number',
    unit: 'mm',
    absolute: { min: 400, max: 2500 },
    typical: { min: 1100, max: 1500 },
    dual: true,
    comparable: true,
    help: 'Distância entre os planos médios das rodas dianteiras.',
  },
  {
    id: 'dim.bitola-traseira',
    section: 'dimensoes',
    label: 'Bitola traseira',
    type: 'number',
    unit: 'mm',
    absolute: { min: 400, max: 2500 },
    typical: { min: 1050, max: 1450 },
    dual: true,
    comparable: true,
    help: 'Distância entre os planos médios das rodas traseiras.',
  },
  {
    id: 'dim.altura-livre',
    section: 'dimensoes',
    label: 'Altura livre do solo',
    type: 'number',
    unit: 'mm',
    absolute: { min: 10, max: 800 },
    typical: { min: 200, max: 400 },
    dual: true,
    help: 'Menor distância entre o solo e o ponto mais baixo do carro, com o piloto a bordo.',
  },
  {
    id: 'dim.massa-gaiola',
    section: 'dimensoes',
    label: 'Massa da gaiola',
    type: 'number',
    unit: 'kg',
    absolute: { min: 5, max: 200 },
    typical: { min: 25, max: 60 },
    dual: true,
    suggest: 'cageMassKg',
    help: 'Só a estrutura tubular, sem componentes. O portal sugere a partir do modelo 3D; a coluna medida é o que a balança disse.',
  },
  {
    id: 'dim.massa-seco',
    section: 'dimensoes',
    label: 'Massa do veículo seco',
    type: 'number',
    unit: 'kg',
    absolute: { min: 30, max: 600 },
    typical: { min: 150, max: 300 },
    dual: true,
    comparable: true,
    help: 'Carro completo, sem piloto e sem combustível.',
  },
  {
    id: 'dim.massa-piloto',
    section: 'dimensoes',
    label: 'Massa com piloto',
    type: 'number',
    unit: 'kg',
    absolute: { min: 60, max: 800 },
    typical: { min: 220, max: 400 },
    dual: true,
    help: 'Carro em ordem de marcha com o piloto de referência a bordo.',
  },
  {
    id: 'dim.distribuicao-dianteira',
    section: 'dimensoes',
    label: 'Distribuição dianteira',
    type: 'number',
    unit: '%',
    absolute: { min: 0, max: 100 },
    typical: { min: 30, max: 50 },
    dual: true,
    help: 'Percentual da massa sobre o eixo dianteiro. A traseira é o complemento — não é campo separado de propósito.',
  },
  {
    id: 'dim.comprimento-tubo',
    section: 'dimensoes',
    label: 'Comprimento total de tubo',
    type: 'number',
    unit: 'mm',
    absolute: { min: 1000, max: 200000 },
    suggest: 'tubeLengthMm',
    help: 'Soma do comprimento de todos os membros. Útil na hora da compra — e o sugerido não inclui sobra de corte.',
  },
  {
    id: 'dim.tubos-cortados',
    section: 'dimensoes',
    label: 'Número de tubos cortados',
    type: 'number',
    absolute: { min: 0, max: 500 },
    suggest: 'tubeCount',
    help: 'Quantas peças de tubo o carro tem. O modelo sugere pelo número de membros; a equipe corrige na oficina, onde uma peça curvada vira uma só.',
  },

  // 5.3 Chassi e materiais
  {
    id: 'chassi.secao-primaria',
    section: 'chassi',
    label: 'Material e seção primária',
    type: 'text',
    suggest: 'primarySection',
    help: 'Aço, diâmetro externo e parede dos membros primários. O modelo 3D sugere a partir da seção configurada no editor.',
  },
  {
    id: 'chassi.secao-secundaria',
    section: 'chassi',
    label: 'Material e seção secundária',
    type: 'text',
    suggest: 'secondarySection',
    help: 'Mesma coisa para os membros secundários.',
  },
  {
    id: 'chassi.fornecedor',
    section: 'chassi',
    label: 'Fornecedor do tubo',
    type: 'text',
    help: 'Quem vendeu o tubo. É o dado que a geração seguinte procura primeiro e nunca acha.',
  },
  {
    id: 'chassi.certificado',
    section: 'chassi',
    label: 'Lote / certificado do material',
    type: 'link',
    help: 'Link para o certificado ou a nota fiscal — a rastreabilidade que a inspeção pergunta.',
  },
  {
    id: 'chassi.tratamento',
    section: 'chassi',
    label: 'Tratamento térmico ou superficial',
    type: 'enum',
    options: TRATAMENTO,
    help: 'O que foi feito na estrutura depois de soldada.',
  },
  {
    id: 'chassi.observacoes',
    section: 'chassi',
    label: 'Observações do chassi',
    type: 'longtext',
    help: 'O que não cabe em campo: um reforço improvisado, uma emenda, uma decisão de última hora.',
  },

  // 5.4 Suspensão
  {
    id: 'susp.tipo-dianteiro',
    section: 'suspensao',
    label: 'Tipo dianteiro',
    type: 'enum',
    options: SUSP_DIANT,
    help: 'Arquitetura da suspensão dianteira.',
  },
  {
    id: 'susp.tipo-traseiro',
    section: 'suspensao',
    label: 'Tipo traseiro',
    type: 'enum',
    options: SUSP_TRAS,
    help: 'Arquitetura da suspensão traseira.',
  },
  {
    id: 'susp.curso-dianteiro',
    section: 'suspensao',
    label: 'Curso dianteiro',
    type: 'number',
    unit: 'mm',
    absolute: { min: 0, max: 900 },
    typical: { min: 150, max: 350 },
    dual: true,
    help: 'Curso total da roda dianteira, do batente ao batente.',
  },
  {
    id: 'susp.curso-traseiro',
    section: 'suspensao',
    label: 'Curso traseiro',
    type: 'number',
    unit: 'mm',
    absolute: { min: 0, max: 900 },
    typical: { min: 150, max: 400 },
    dual: true,
    help: 'Curso total da roda traseira, do batente ao batente.',
  },
  {
    id: 'susp.cambagem-dianteira',
    section: 'suspensao',
    label: 'Cambagem estática dianteira',
    type: 'number',
    unit: '°',
    absolute: { min: -30, max: 30 },
    typical: { min: -3, max: 1 },
    dual: true,
    help: 'Negativa = topo da roda para dentro. Com o carro em ordem de marcha.',
  },
  {
    id: 'susp.cambagem-traseira',
    section: 'suspensao',
    label: 'Cambagem estática traseira',
    type: 'number',
    unit: '°',
    absolute: { min: -30, max: 30 },
    typical: { min: -3, max: 1 },
    dual: true,
    help: 'Mesma convenção da dianteira.',
  },
  {
    id: 'susp.caster',
    section: 'suspensao',
    label: 'Cáster',
    type: 'number',
    unit: '°',
    absolute: { min: -30, max: 45 },
    typical: { min: 2, max: 12 },
    dual: true,
    help: 'Inclinação do eixo de esterçamento vista de lado. É o que dá retorno de volante.',
  },
  {
    id: 'susp.convergencia-dianteira',
    section: 'suspensao',
    label: 'Convergência dianteira',
    type: 'number',
    unit: 'mm',
    absolute: { min: -100, max: 100 },
    typical: { min: -5, max: 5 },
    dual: true,
    help: 'Positiva = rodas convergindo à frente. Medida na roda, não em graus.',
  },
  {
    id: 'susp.convergencia-traseira',
    section: 'suspensao',
    label: 'Convergência traseira',
    type: 'number',
    unit: 'mm',
    absolute: { min: -100, max: 100 },
    typical: { min: -5, max: 5 },
    dual: true,
    help: 'Mesma convenção da dianteira.',
  },
  {
    id: 'susp.relacao-instalacao-dianteira',
    section: 'suspensao',
    label: 'Relação de instalação dianteira',
    type: 'number',
    absolute: { min: 0.05, max: 5 },
    typical: { min: 0.3, max: 1.2 },
    help: 'Motion ratio: curso do amortecedor dividido pelo curso da roda.',
  },
  {
    id: 'susp.relacao-instalacao-traseira',
    section: 'suspensao',
    label: 'Relação de instalação traseira',
    type: 'number',
    absolute: { min: 0.05, max: 5 },
    typical: { min: 0.3, max: 1.2 },
    help: 'Mesma definição da dianteira.',
  },
  {
    id: 'susp.mola-dianteira',
    section: 'suspensao',
    label: 'Rigidez de mola dianteira',
    type: 'number',
    unit: 'N/mm',
    absolute: { min: 0.5, max: 500 },
    typical: { min: 8, max: 60 },
    help: 'Constante da mola instalada. Se for progressiva, registre a faixa nas observações do chassi.',
  },
  {
    id: 'susp.mola-traseira',
    section: 'suspensao',
    label: 'Rigidez de mola traseira',
    type: 'number',
    unit: 'N/mm',
    absolute: { min: 0.5, max: 500 },
    typical: { min: 8, max: 70 },
    help: 'Mesma definição da dianteira.',
  },
  {
    id: 'susp.amortecedor',
    section: 'suspensao',
    label: 'Amortecedor — modelo',
    type: 'text',
    help: 'Fabricante e modelo. Sem isso, a regulagem da temporada passada não é reproduzível.',
  },
  {
    id: 'susp.memoria-calculo',
    section: 'suspensao',
    label: 'Memória de cálculo',
    type: 'link',
    help: 'Link para a planilha ou o relatório do dimensionamento — o mesmo lastro que o critério DIN-3.1 pede.',
  },

  // 5.5 Direção
  {
    id: 'dir.tipo',
    section: 'direcao',
    label: 'Tipo',
    type: 'enum',
    options: DIRECAO_TIPO,
    help: 'Mecanismo de direção.',
  },
  {
    id: 'dir.relacao',
    section: 'direcao',
    label: 'Relação de direção',
    type: 'number',
    absolute: { min: 0.5, max: 60 },
    typical: { min: 2, max: 12 },
    help: 'Graus de volante por grau de roda.',
  },
  {
    id: 'dir.voltas',
    section: 'direcao',
    label: 'Voltas batente a batente',
    type: 'number',
    absolute: { min: 0.1, max: 10 },
    typical: { min: 0.5, max: 2 },
    help: 'Quantas voltas de volante do batente esquerdo ao direito.',
  },
  {
    id: 'dir.raio-giro',
    section: 'direcao',
    label: 'Raio de giro',
    type: 'number',
    unit: 'm',
    absolute: { min: 0.5, max: 30 },
    typical: { min: 2, max: 5 },
    dual: true,
    help: 'Projetado pela geometria × medido em pista. A diferença costuma surpreender.',
  },
  {
    id: 'dir.ackermann',
    section: 'direcao',
    label: 'Geometria de Ackermann',
    type: 'number',
    unit: '%',
    absolute: { min: -200, max: 300 },
    typical: { min: 0, max: 120 },
    help: 'Percentual de Ackermann adotado. Negativo é escolha de projeto, não erro.',
  },

  // 5.6 Freios
  {
    id: 'freio.configuracao',
    section: 'freios',
    label: 'Configuração',
    type: 'enum',
    options: FREIO_CONFIG,
    help: 'Como os discos estão distribuídos no carro.',
  },
  {
    id: 'freio.disco-dianteiro',
    section: 'freios',
    label: 'Diâmetro do disco dianteiro',
    type: 'number',
    unit: 'mm',
    absolute: { min: 50, max: 600 },
    typical: { min: 160, max: 280 },
    help: 'Diâmetro externo do disco dianteiro.',
  },
  {
    id: 'freio.disco-traseiro',
    section: 'freios',
    label: 'Diâmetro do disco traseiro',
    type: 'number',
    unit: 'mm',
    absolute: { min: 50, max: 600 },
    typical: { min: 160, max: 280 },
    help: 'Diâmetro externo do disco traseiro.',
  },
  {
    id: 'freio.cilindro-mestre',
    section: 'freios',
    label: 'Cilindro mestre — diâmetro',
    type: 'number',
    unit: 'mm',
    absolute: { min: 5, max: 80 },
    typical: { min: 12, max: 25 },
    help: 'Diâmetro do êmbolo. Componente que costuma vir em polegada — converta antes de registrar (a v1 guarda só em SI).',
  },
  {
    id: 'freio.relacao-pedal',
    section: 'freios',
    label: 'Relação do pedal',
    type: 'number',
    absolute: { min: 1, max: 20 },
    typical: { min: 3, max: 8 },
    help: 'Braço de alavanca do pedal sobre o braço do cilindro.',
  },
  {
    id: 'freio.travamento',
    section: 'freios',
    label: 'Travamento simultâneo das quatro rodas',
    type: 'boolean',
    help: 'O ensaio que a inspeção cobra. Marque só depois de fazer, não depois de calcular.',
  },
  {
    id: 'freio.data-ensaio',
    section: 'freios',
    label: 'Data do ensaio de travamento',
    type: 'date',
    help: 'Quando o travamento foi demonstrado.',
  },
  {
    id: 'freio.registro-ensaio',
    section: 'freios',
    label: 'Registro do ensaio',
    type: 'link',
    help: 'Vídeo, foto ou relatório do ensaio.',
  },

  // 5.7 Trem de força
  {
    id: 'tf.motor',
    section: 'trem-forca',
    label: 'Motor — modelo',
    type: 'text',
    help: 'Modelo do motor entregue pela organização ou adotado pela equipe.',
  },
  {
    id: 'tf.cvt',
    section: 'trem-forca',
    label: 'CVT — modelo',
    type: 'text',
    help: 'Fabricante e modelo do variador.',
  },
  {
    id: 'tf.mola-primaria',
    section: 'trem-forca',
    label: 'Mola primária',
    type: 'text',
    help: 'Identificação do fabricante — cor, código, o que estiver escrito na peça.',
  },
  {
    id: 'tf.pesos',
    section: 'trem-forca',
    label: 'Pesos / roletes',
    type: 'text',
    help: 'Massa e posição dos pesos da primária. É a calibração que mais se perde entre temporadas.',
  },
  {
    id: 'tf.rampa-secundaria',
    section: 'trem-forca',
    label: 'Rampa secundária',
    type: 'text',
    help: 'Ângulo ou código da rampa em uso.',
  },
  {
    id: 'tf.mola-secundaria',
    section: 'trem-forca',
    label: 'Mola secundária',
    type: 'text',
    help: 'Identificação e pré-carga (furo) em uso.',
  },
  {
    id: 'tf.reducao-tipo',
    section: 'trem-forca',
    label: 'Redução — tipo',
    type: 'enum',
    options: REDUCAO_TIPO,
    help: 'Como a redução depois do CVT é feita.',
  },
  {
    id: 'tf.reducao-relacao',
    section: 'trem-forca',
    label: 'Relação de redução',
    type: 'number',
    absolute: { min: 0.5, max: 60 },
    typical: { min: 4, max: 12 },
    help: 'Relação da caixa ou do conjunto de redução, sem o CVT.',
  },
  {
    id: 'tf.relacao-final',
    section: 'trem-forca',
    label: 'Relação final total',
    type: 'number',
    absolute: { min: 0.5, max: 200 },
    typical: { min: 6, max: 40 },
    dual: true,
    help: 'Do virabrequim à roda, com o CVT na condição de referência.',
  },
  {
    id: 'tf.pneu',
    section: 'trem-forca',
    label: 'Pneu — medida',
    type: 'text',
    comparable: true,
    maxLength: 60,
    help: 'Medida como está escrita no flanco (ex.: 22×7-10). É o campo que permite comparar velocidade entre equipes.',
  },
  {
    id: 'tf.velocidade-maxima',
    section: 'trem-forca',
    label: 'Velocidade máxima',
    type: 'number',
    unit: 'km/h',
    absolute: { min: 5, max: 200 },
    typical: { min: 40, max: 80 },
    dual: true,
    help: 'Calculada pela relação × medida em pista. A diferença é o rendimento real do conjunto.',
  },
  {
    id: 'tf.setup',
    section: 'trem-forca',
    label: 'Registro de setup por condição',
    type: 'link',
    help: 'Onde a equipe anota a calibração por tipo de prova — o mesmo lastro que o critério DIN-3.2 pede.',
  },

  // 5.8 Elétrica e segurança
  {
    id: 'ele.interruptores',
    section: 'eletrica',
    label: 'Interruptores de corte — quantidade',
    type: 'number',
    absolute: { min: 0, max: 10 },
    typical: { min: 2, max: 3 },
    help: 'Contando o interno e o externo.',
  },
  {
    id: 'ele.posicao-interruptores',
    section: 'eletrica',
    label: 'Posição dos interruptores',
    type: 'text',
    help: 'Onde estão, na linguagem de quem vai procurar no carro parado.',
  },
  {
    id: 'ele.bateria',
    section: 'eletrica',
    label: 'Bateria — tipo e fixação',
    type: 'text',
    help: 'Tipo, capacidade e como está presa. A fixação é o que a inspeção olha.',
  },
  {
    id: 'ele.luz-freio',
    section: 'eletrica',
    label: 'Luz de freio',
    type: 'boolean',
    help: 'Instalada e funcionando.',
  },
  {
    id: 'ele.cinto-pontos',
    section: 'eletrica',
    label: 'Cinto — pontos',
    type: 'enum',
    options: CINTO_PONTOS,
    help: 'Quantos pontos de ancoragem o cinto tem.',
  },
  {
    id: 'ele.cinto-validade',
    section: 'eletrica',
    label: 'Cinto — validade',
    type: 'date',
    help: 'A data que a inspeção confere. Registrar aqui é o que evita descobrir o vencimento na fila da vistoria.',
  },
  {
    id: 'ele.banco',
    section: 'eletrica',
    label: 'Banco e apoio de cabeça',
    type: 'text',
    help: 'Modelo ou descrição do conjunto do assento.',
  },
  {
    id: 'ele.extintor-validade',
    section: 'eletrica',
    label: 'Extintor — validade',
    type: 'date',
    help: 'Mesma lógica do cinto.',
  },
  {
    id: 'ele.protecao-lateral',
    section: 'eletrica',
    label: 'Proteção lateral / rede',
    type: 'boolean',
    help: 'Instalada nos dois lados.',
  },

  // 5.9 Ergonomia e testes
  {
    id: 'erg.percentil',
    section: 'ergonomia',
    label: 'Percentil do piloto de referência',
    type: 'enum',
    options: PERCENTIL,
    help: 'Para quem o habitáculo foi projetado. O manequim do editor sugere na tela; a escolha é da equipe.',
  },
  {
    id: 'erg.folga-capacete',
    section: 'ergonomia',
    label: 'Folga de capacete',
    type: 'number',
    unit: 'mm',
    absolute: { min: 0, max: 1000 },
    typical: { min: 152, max: 400 },
    dual: true,
    suggest: 'helmetClearanceMm',
    help: 'Distância do capacete até a estrutura do habitáculo. O modelo sugere pelo manequim; a medida vale é a do carro pronto com o piloto dentro.',
  },
  {
    id: 'erg.protocolo-testes',
    section: 'ergonomia',
    label: 'Protocolo de testes pré-competição',
    type: 'link',
    help: 'O roteiro que a equipe cumpre antes de viajar — lastro do critério FAB-4.1.',
  },
  {
    id: 'erg.horas-shakedown',
    section: 'ergonomia',
    label: 'Horas de shakedown',
    type: 'number',
    unit: 'h',
    absolute: { min: 0, max: 1000 },
    typical: { min: 5, max: 100 },
    help: 'Horas de carro rodando antes da competição, somadas.',
  },
  {
    id: 'erg.sessoes-aquisicao',
    section: 'ergonomia',
    label: 'Sessões de aquisição de dados',
    type: 'number',
    absolute: { min: 0, max: 500 },
    help: 'Quantas sessões com instrumentação — lastro dos critérios DIN-4.2 e DIN-5.1.',
  },
  {
    id: 'erg.ultima-sessao',
    section: 'ergonomia',
    label: 'Última sessão de testes',
    type: 'date',
    help: 'Quando o carro rodou pela última vez.',
  },
  {
    id: 'erg.controle-dimensional',
    section: 'ergonomia',
    label: 'Controle dimensional pós-solda',
    type: 'link',
    help: 'Onde está o registro da conferência das medidas depois de soldar — lastro do critério FAB-3.2.',
  },
]

// ---------- índices e utilidades puras ----------

const BY_ID = new Map<string, Field>(FIELDS.map((f) => [f.id, f]))

export function fieldById(id: string): Field | undefined {
  return BY_ID.get(id)
}

export function fieldsOf(section: SectionId): Field[] {
  return FIELDS.filter((f) => f.section === section)
}

export function isSectionId(v: unknown): v is SectionId {
  return SECTIONS.some((s) => s.id === v)
}

/** Tetos de texto por tipo (RF-2.2) — `maxLength` do campo tem precedência. */
export const MAX_LENGTH: Record<'text' | 'longtext' | 'link', number> = {
  text: 120,
  longtext: 1000,
  link: 500,
}

export function maxLengthOf(field: Field): number | undefined {
  if (field.maxLength != null) return field.maxLength
  if (field.type === 'text' || field.type === 'longtext' || field.type === 'link') {
    return MAX_LENGTH[field.type]
  }
  return undefined
}

/** Campos que alimentam as medianas por classe da comunidade (RF-6.4). */
export const COMPARABLE_FIELDS: readonly string[] = FIELDS.filter((f) => f.comparable).map(
  (f) => f.id,
)
