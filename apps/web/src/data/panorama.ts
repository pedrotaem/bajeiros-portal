/**
 * Instantâneo do panorama das equipes brasileiras (DF-25 §4.4).
 *
 * POR QUE ESTÁTICO, E NÃO UMA ROTA (DF-25 §5.2): a vitrine é a primeira pintura de
 * quem chega pelo link, sem sessão. O Aurora escala a zero e um retorno frio leva
 * ~15 s — justamente quando o portal está pouco usado. Além disso o dado é DATADO,
 * não vivo: servi-lo de um banco o faria parecer atual. Quando o acervo do DF-15 for
 * ingerido, o caminho é GERAR este arquivo do banco num script de build e continuar
 * servindo estático.
 *
 * Módulo puro: sem React, sem fetch, sem hex (a catraca de `check-tokens` varre esta
 * pasta também).
 */

/** Coortes pelo NOME, nunca por número (DF-15; DF-25 FR-DF25.10).
 *
 * Os dois documentos da pesquisa numeram "Tier" em ordens OPOSTAS —
 * `equipes-brasil.md` chama de Tier 1 a alta performance, `dificuldades-por-tier.md`
 * chama de Tier 1 a iniciante. Número aqui seria ambiguidade importada. */
export const COORTES = ['alta', 'intermediaria', 'iniciante'] as const
export type Coorte = (typeof COORTES)[number]

export const NOME_COORTE: Record<Coorte, string> = {
  alta: 'Alta performance',
  intermediaria: 'Intermediária',
  iniciante: 'Iniciante',
}

export type RegiaoId = 'N' | 'NE' | 'CO' | 'SE' | 'S'

export interface Regiao {
  id: RegiaoId
  nome: string
  /** Equipes ativas mapeadas (participaram de ao menos uma competição 2024–2026). */
  total: number
  alta: number
  intermediaria: number
  iniciante: number
  /** Unidades da federação com ao menos uma equipe mapeada. */
  ufs: number
  /** Equipes inscritas na Etapa Nacional 2026 (Informativo 06). */
  nacional: number
  /** Uma frase. O que este número quer dizer, não o que ele é. */
  nota: string
}

/**
 * Fonte: `Pesquisa de Mercado/equipes-brasil.json` (91 equipes, agregadas por região e
 * coorte) e o Informativo 06 de 2026 para a coluna do Nacional.
 */
export const REGIOES: readonly Regiao[] = [
  {
    id: 'N',
    nome: 'Norte',
    total: 2,
    alta: 0,
    intermediaria: 0,
    iniciante: 2,
    ufs: 2,
    nacional: 2,
    nota: 'Duas equipes, dois estados. Sem etapa regional, a logística até a nacional custa múltiplos da inscrição.',
  },
  {
    id: 'NE',
    nome: 'Nordeste',
    total: 20,
    alta: 2,
    intermediaria: 7,
    iniciante: 11,
    ufs: 7,
    nacional: 14,
    nota: 'Sete estados, mais que qualquer outra região. E 14 equipes no Nacional 2026, atrás só do Sudeste.',
  },
  {
    id: 'CO',
    nome: 'Centro-Oeste',
    total: 3,
    alta: 0,
    intermediaria: 1,
    iniciante: 2,
    ufs: 2,
    nacional: 1,
    nota: 'Uma equipe no Nacional 2026. Não existe etapa regional aqui: as três acontecem no Sul, Sudeste e Nordeste.',
  },
  {
    id: 'SE',
    nome: 'Sudeste',
    total: 45,
    alta: 5,
    intermediaria: 19,
    iniciante: 21,
    ufs: 4,
    nacional: 35,
    nota: 'Quase metade do país num raio curto de São José dos Campos, onde a etapa nacional acontece desde 2022.',
  },
  {
    id: 'S',
    nome: 'Sul',
    total: 21,
    alta: 5,
    intermediaria: 6,
    iniciante: 10,
    ufs: 3,
    nacional: 10,
    nota: 'Cinco das doze equipes de alta performance do país saem daqui, a maior densidade de elite do Brasil.',
  },
]

export interface Selecao {
  id: RegiaoId | 'BR'
  rotulo: string
  nome: string
  total: number
  alta: number
  intermediaria: number
  iniciante: number
  ufs: number
  nacional: number
  nota: string
}

function somar(campo: 'total' | 'alta' | 'intermediaria' | 'iniciante' | 'ufs' | 'nacional') {
  return REGIOES.reduce((acc, r) => acc + r[campo], 0)
}

/**
 * O agregado NÃO é escrito à mão (FR-DF25.19). Um total que diverge da soma das
 * regiões passa a ser impossível por construção, em vez de depender de alguém
 * lembrar de atualizar os dois lugares.
 */
export const BRASIL: Selecao = {
  id: 'BR',
  rotulo: 'Panorama',
  nome: 'Brasil',
  total: somar('total'),
  alta: somar('alta'),
  intermediaria: somar('intermediaria'),
  iniciante: somar('iniciante'),
  ufs: somar('ufs'),
  nacional: somar('nacional'),
  nota: 'Equipes ativas mapeadas em 18 estados. 62 delas correram a etapa nacional de 2026, contra 69 na retomada de 2022.',
}

export function selecao(id: RegiaoId | 'BR'): Selecao {
  if (id === 'BR') return BRASIL
  const r = REGIOES.find((x) => x.id === id)
  if (!r) return BRASIL
  return { ...r, id: r.id, rotulo: 'Região' }
}

/**
 * Equipes mapeadas por unidade da federação. Mesmo levantamento das regiões, só que
 * sem agregar — o mapa passou a ter fronteira estadual e o estado é a unidade que ele
 * desenha. Os 9 estados sem equipe **não aparecem aqui**: ausência é o dado, e uma
 * chave com zero convidaria a pintá-los como "quase nenhuma" em vez de "nenhuma".
 *
 * Guardado por teste: a soma das UFs de cada região tem de bater com o total dela.
 */
export const EQUIPES_POR_UF: Readonly<Record<string, number>> = {
  AM: 1,
  PA: 1,
  BA: 6,
  MA: 1,
  PB: 4,
  PE: 4,
  PI: 1,
  RN: 3,
  SE: 1,
  DF: 2,
  MS: 1,
  ES: 2,
  MG: 12,
  RJ: 10,
  SP: 21,
  PR: 8,
  RS: 8,
  SC: 5,
}

/** Quais UFs compõem cada região (agrupamento oficial do IBGE, espelhado no gerador). */
export const UFS_DA_REGIAO: Readonly<Record<RegiaoId, readonly string[]>> = {
  N: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  NE: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  CO: ['DF', 'GO', 'MT', 'MS'],
  SE: ['ES', 'MG', 'RJ', 'SP'],
  S: ['PR', 'RS', 'SC'],
}

export function equipesDaUf(sigla: string): number {
  return EQUIPES_POR_UF[sigla] ?? 0
}

/**
 * Rampa DERIVADA, não escolhida à mão (FR-DF25.8). Cor única do sistema com opacidade
 * variável: o mapa nunca introduz cor nova, e quando o dado mudar a rampa se corrige
 * sozinha. Agora ela corre por ESTADO, que é a forma que o mapa desenha.
 *
 * O piso de 0,22 é maior que o da versão por região porque um estado precisa se
 * separar do vizinho vazio já na primeira equipe. O teto de 0,80 é o limite que ainda
 * deixa o rótulo claro legível — e os rótulos ganharam halo, então a margem sobra.
 *
 * Estado SEM equipe não entra na rampa: ele tem um tom neutro próprio, porque
 * "nenhuma" e "uma" são categorias diferentes, não pontos vizinhos de uma escala.
 */
export const OPACIDADE_PISO = 0.22
export const OPACIDADE_ALCANCE = 0.58

export function opacidadeDe(equipes: number): number {
  if (equipes <= 0) return 0
  const maior = Math.max(...Object.values(EQUIPES_POR_UF))
  return OPACIDADE_PISO + OPACIDADE_ALCANCE * (equipes / maior)
}

/** Números do produto que a vitrine exibe ao lado dos da pesquisa. */
export const NUMEROS = [
  { valor: '91', rotulo: 'equipes mapeadas' },
  { valor: '17', rotulo: 'competições no acervo' },
  { valor: '51', rotulo: 'critérios de maturidade' },
  { valor: '18', rotulo: 'estados com equipe' },
] as const

export const LEVANTAMENTO = '23/08/2026'

export const FONTE_PANORAMA =
  'Resultados oficiais da SAE BRASIL e Informativo 06 de 2026, compilados em ' +
  LEVANTAMENTO +
  '. Fronteiras estaduais de Natural Earth (domínio público), 1:50 milhões.'

/**
 * A faixa sobre a relação com a organização é decisão EDITORIAL do dono do produto
 * (DF-25 §5.4), não do código. Desligar é esta linha; ligar de volta é a mesma.
 * Os dois enquadramentos da faixa — que o atrito é o verso de um comitê pequeno e
 * voluntário, e que o portal não fala pela organização — não saem sem a faixa toda.
 */
export const MOSTRAR_ATRITOS = true

/** Cada linha cita o artigo exato: é o que torna barata a conferência na virada de emenda. */
export const ATRITOS = [
  { texto: 'Sem resposta no fórum nos 7 dias antes do evento.', fonte: 'A4.14.5' },
  { texto: 'Requisito de motor publicado 2 meses antes da competição.', fonte: 'Informativo 15' },
  { texto: '4x4 “opcional” vale 130 pontos e a vaga internacional.', fonte: 'Informativo 35' },
  { texto: 'Interpretação muda a qualquer momento, sem recurso.', fonte: 'A4.4.1 · A4.12.3' },
] as const

/** Práticas de elite (DF-10/DF-13 já as usam como origem dos critérios). */
export const PRATICAS = [
  {
    valor: '10',
    texto: 'departamentos e 50+ membros, com chefe por subsistema.',
    quem: 'Poli de Baja',
  },
  {
    valor: '6 meses',
    texto: 'de trainee com avaliação antes de efetivar o membro.',
    quem: 'UFPBaja',
  },
  {
    valor: '2 carros',
    texto: 'o do ano passado vira bancada de teste do próximo.',
    quem: 'Imperador · UTFPR',
  },
  {
    valor: 'Registro',
    texto: 'relatório, memória de cálculo e lições aprendidas como entregável.',
    quem: 'EESC · Cefast · UFMG',
  },
] as const
