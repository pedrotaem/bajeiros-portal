// Funções PURAS da ingestão do acervo (DF-15 RF-1.3). Sem IO e sem banco: é aqui
// que mora a garantia de que nenhum dado de pessoa física entra no portal
// (AC-DF15.8) e a de que o nome exibido não usa a identidade da organização
// (restrição de marca do spec.md §1).
//
// O script `ingest-results.mjs` é só o encanamento; a regra é esta.

/**
 * Campos de PESSOA FÍSICA. A origem hoje não os traz, mas a planilha de amanhã
 * pode — e a invariante tem que valer contra o payload futuro, não contra o atual.
 */
export const PII_FIELDS = [
  'capitao',
  'capita',
  'piloto',
  'pilotos',
  'membros_nomes',
  'contato',
  'email',
  'e_mail',
  'telefone',
  'cpf',
  'responsavel',
  'nome_responsavel',
  'integrantes',
]

const PII_HINTS = ['email', 'telefone', 'cpf', 'piloto', 'contato', 'capit', 'responsav']

export function isPiiKey(key) {
  const k = String(key).toLowerCase()
  return PII_FIELDS.includes(k) || PII_HINTS.some((h) => k.includes(h))
}

/** Remove recursivamente qualquer chave de pessoa física. */
export function stripPii(value) {
  if (Array.isArray(value)) return value.map(stripPii)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (isPiiKey(k)) continue
      out[k] = stripPii(v)
    }
    return out
  }
  return value
}

const REGION_LABEL = {
  Sudeste: 'Sudeste',
  Nordeste: 'Nordeste',
  Sul: 'Sul',
  Norte: 'Norte',
  'Centro-Oeste': 'Centro-Oeste',
}

/**
 * Nome de exibição SEM marca: "Nacional 2026" / "Regional Sudeste 2025".
 * O nome original da fonte não é copiado para o portal — nem para o payload.
 */
export function displayName(competition) {
  if (competition.tipo === 'nacional') return `Nacional ${competition.ano}`
  const region = REGION_LABEL[competition.regiao] ?? competition.regiao ?? 'Regional'
  return `Regional ${region} ${competition.ano}`
}

/** Chave natural da competição (idempotência: rodar 2× não duplica — AC-DF15.1). */
export function competitionKey(competition) {
  return `${competition.ano}|${competition.tipo}|${competition.regiao ?? ''}`
}

/**
 * Chave natural da equipe canônica: o NOME normalizado, sem a universidade.
 *
 * Os dois documentos da pesquisa escrevem a instituição de formas diferentes
 * ("CENTRO UNIVERSITÁRIO FEI" x "Centro Universitário FEI (FEI)"), então
 * nome+universidade produzia 441 equipes onde existem ~91 vivas — cada variante
 * de grafia virava uma equipe nova, e a tabela de resultados ficaria irreconhecível.
 * Nome de equipe de Baja é praticamente único no país; a universidade entra como
 * ENRIQUECIMENTO da linha, não como identidade.
 */
export function teamKey(name) {
  return norm(name)
}

/** minúsculas, sem acento, sem pontuação, espaços colapsados. */
function norm(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Normaliza os nomes de prova para pt-BR estável (§8.3). O nome original fica
 * guardado em `points._fonte` para auditoria — nunca se perde de onde veio.
 */
const EVENT_LABELS = {
  seguranca: 'Segurança',
  projeto: 'Projeto',
  dinamicas: 'Dinâmicas',
  enduro: 'Enduro',
  conforto: 'Conforto',
  apresentacao: 'Apresentação',
  relatorio: 'Relatório',
}

export function normalizeEvents(pontuacoes) {
  const points = {}
  const source = {}
  for (const [key, value] of Object.entries(pontuacoes ?? {})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const label = EVENT_LABELS[norm(key).replace(/\s/g, '')] ?? key
    points[label] = value
    source[label] = key
  }
  return { points, source }
}

/**
 * Uma linha de resultado → registro do portal. `null` quando a linha não tem
 * equipe identificável (o portal não inventa dado: campo ausente fica ausente).
 */
export function toResult(row, competition) {
  const clean = stripPii(row)
  if (!clean.equipe) return null
  const { points, source } = normalizeEvents(clean.pontuacoes_por_prova)
  return {
    teamKey: teamKey(clean.equipe),
    displayName: String(clean.equipe).trim(),
    university: clean.universidade ? String(clean.universidade).trim() : null,
    uf: clean.uf ?? null,
    carNumber: Number.isInteger(clean.numero_carro) ? clean.numero_carro : null,
    position: Number.isInteger(clean.posicao) ? clean.posicao : null,
    pointsTotal: typeof clean.pontuacao_total === 'number' ? clean.pontuacao_total : null,
    points: { ...points, _fonte: source },
    sourceUrl: (competition.fontes ?? [])[0] ?? null,
  }
}

/**
 * Equipe com DOIS carros na mesma competição sob o mesmo nome (acontece: a FEI
 * inscreve "FEI BAJA 1" e "FEI BAJA 2", mas outras repetem o nome idêntico).
 * Sem desambiguar, a chave (competição, equipe) colapsaria as duas linhas e uma
 * sumiria em silêncio — o pior erro possível num acervo cuja razão de existir é
 * a credibilidade. O número do carro é o desempate que a própria fonte fornece.
 */
function disambiguate(results) {
  const byKey = new Map()
  for (const r of results) {
    const list = byKey.get(r.teamKey) ?? []
    list.push(r)
    byKey.set(r.teamKey, list)
  }
  const ambiguous = []
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue
    rows.forEach((r, i) => {
      const suffix = r.carNumber != null ? `#${r.carNumber}` : `(${i + 1})`
      r.teamKey = `${key} ${norm(suffix)}`
      r.displayName = `${r.displayName} ${suffix}`
    })
    ambiguous.push({ key, count: rows.length })
  }
  return ambiguous
}

/** Competição da origem → registro do portal, já sem marca. */
export function toCompetition(competition) {
  const results = (competition.resultados ?? [])
    .map((r) => toResult(r, competition))
    .filter((r) => r !== null)
  const ambiguous = disambiguate(results)
  return {
    key: competitionKey(competition),
    season: competition.ano,
    kind: competition.tipo,
    region: competition.regiao ?? null,
    name: displayName(competition),
    location: competition.local ?? null,
    sourceUrl: (competition.fontes ?? [])[0] ?? null,
    results,
    ambiguous,
  }
}

/** Registro canônico de equipe (equipes-brasil.json) → linha de community_teams. */
export function toCommunityTeam(team) {
  const clean = stripPii(team)
  return {
    key: teamKey(clean.nome),
    displayName: String(clean.nome ?? '').trim(),
    university: clean.universidade ? String(clean.universidade).trim() : null,
    city: clean.cidade ?? null,
    uf: clean.estado ?? null,
    region: clean.regiao ?? null,
    // `tier` da pesquisa NÃO vem junto: os dois documentos usam o número em
    // sentidos opostos e o produto não usa números (DF-15 §3.1)
    links: clean.site ? [{ kind: 'site', url: clean.site }] : [],
  }
}

/** Plano da ingestão a partir dos dois JSONs do acervo — puro, para o dry-run. */
export function buildPlan(resultsDoc, teamsDoc) {
  const competitions = (resultsDoc.competicoes ?? []).map(toCompetition)
  const canonical = new Map()
  for (const t of Object.values(teamsDoc ?? {})) {
    const ct = toCommunityTeam(t)
    if (ct.displayName) canonical.set(ct.key, ct)
  }
  // equipes que aparecem só nos resultados também entram no registro canônico
  for (const comp of competitions) {
    for (const r of comp.results) {
      if (canonical.has(r.teamKey)) continue
      canonical.set(r.teamKey, {
        key: r.teamKey,
        displayName: r.displayName,
        university: r.university,
        city: null,
        uf: r.uf,
        region: null,
        links: [],
      })
    }
  }
  return {
    competitions,
    teams: [...canonical.values()],
    counts: {
      competitions: competitions.length,
      teams: canonical.size,
      results: competitions.reduce((n, c) => n + c.results.length, 0),
      // nada de corte silencioso: o dry-run imprime o que precisou de desempate
      ambiguous: competitions.reduce((n, c) => n + c.ambiguous.length, 0),
    },
  }
}
