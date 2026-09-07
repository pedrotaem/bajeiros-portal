import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../session'
import { useStore } from '../store'
import { mensagem, useFetch } from '../lib/useFetch'
import { useMinWidth } from '../lib/calendario'
import { IconArrow, IconFiles, IconInfoCircle, IconTriangleAlert } from '../icons/glyphs'
import { askAssistant } from './AssistantPanel'
import { RegulationTree, abrirAte } from './RegulationTree'
import {
  KIND_LABEL,
  referenciasDaSecao,
  rotuloVigencia,
  versaoEscolhida,
  versaoVigente,
  type PayloadRegulamento,
  type Referencia,
  type VersaoRegulamento,
} from '../regulamento/api'
import {
  ancestrais,
  filtrar,
  hashDaSecao,
  irmaos,
  regrasDaSecao,
  rotuloDePaginas,
  urlDaPagina,
  type Bloco,
  type IndiceRegulamento,
} from '../regulamento/indice'

/**
 * Ferramentas › Regulamento (DF-34) — o índice inteiro do regulamento vigente, a
 * navegação entre seções e a ponte com o assistente. Abre SEM conta (FR-DF34.2).
 *
 * O portal NÃO reproduz o regulamento: o modo desta versão é o `ponteiro` (§3.3) — cada
 * seção mostra número, título (onde há), páginas e um botão que abre o PDF oficial da
 * organização na página certa. Ler embutido depende de autorização escrita (ADR-013).
 */

/** Texto fixo, pedido do dono do produto (§4.6). Não é parafraseável. */
export const AVISO_REGULAMENTO =
  'O Portal é um facilitador de acesso à informação e não substitui a leitura integral do ' +
  'material direto da fonte. O usuário deve sempre verificar o documento oficial vigente ' +
  'referente à competição que lhe afeta e tomar qualquer decisão baseada no documento oficial.'

/** Contexto do assistente aceita id de item; "PARTE B" e "PREAMBULO" não são item. */
function contextoDeRegra(sectionId: string): { ruleId: string } | undefined {
  return /^[A-C]\d[0-9.]*$/.test(sectionId) ? { ruleId: sectionId } : undefined
}

function dataCurta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

export function RegulationPage() {
  const reg = useSession((s) => s.regulation)
  const setReg = useSession((s) => s.setRegulation)
  const versoes = useFetch<PayloadRegulamento>('/api/v1/public/regulation/versions')
  const versao = versaoEscolhida(versoes.data, reg.edition)
  const vigente = versaoVigente(versoes.data)
  const referencias = useFetch<{ season: number; references: Referencia[] }>(
    versoes.data ? `/api/v1/public/regulation/references?season=${versoes.data.season}` : null,
    [versoes.data?.season],
  )
  const indice = useIndice(versao?.edition ?? null)
  const largo = useMinWidth(1200)
  const [painelAberto, setPainelAberto] = useState(true)
  const [abertos, setAbertos] = useState<Set<string>>(new Set(['PARTE B']))
  const [ultimaSecao, setUltimaSecao] = useState<string | null>(null)

  // A árvore abre sozinha até a seção escolhida (chip do assistente, link, checklist).
  // Ajuste no render, não em efeito: reagir à MUDANÇA da seção, e não a todo render, é
  // o que deixa a pessoa recolher um ramo sem ele reabrir sozinho no próximo quadro.
  if (reg.sectionId !== ultimaSecao) {
    setUltimaSecao(reg.sectionId)
    setAbertos((atual) => abrirAte(reg.sectionId, atual))
  }

  const blocos = useMemo(() => indice.dados?.blocks ?? [], [indice.dados])
  const achados = useMemo(() => filtrar(blocos, reg.query), [blocos, reg.query])
  const selecionado = blocos.find((b) => b.id === reg.sectionId) ?? null

  const painel = !largo ? painelAberto : true

  return (
    <div className="bj-reg">
      {/* FR-DF34.16 — faixa da fonte (C-09 `fonte`), visível sem rolar, não fecha */}
      <div className="bj-fonte-aviso" role="note">
        <IconInfoCircle size={16} />
        <p>{AVISO_REGULAMENTO}</p>
      </div>

      <Cabecalho
        payload={versoes.data}
        versao={versao}
        indice={indice.dados}
        query={reg.query}
        onVersao={(edition) => setReg({ edition, sectionId: null, fromAssistant: false })}
        onQuery={(query) => setReg({ query })}
      />

      {versao && vigente && versao.id !== vigente.id && (
        // FR-DF34.17 — nunca redireciona sozinho: a numeração muda entre emendas
        <div className="bj-reg-aviso-warn" role="status">
          <IconTriangleAlert size={16} />
          <p>
            Você está lendo a <b>{versao.label}</b>
            {versao.supersededById ? ', substituída' : ''}
            {vigente.appliesTo.length > 0
              ? ` — o que vale para ${rotuloVigencia(vigente)} é a ${vigente.label}.`
              : ` — a emenda vigente no portal é a ${vigente.label}.`}{' '}
            A numeração muda entre emendas, então o portal não traduz a seção sozinho.
          </p>
        </div>
      )}

      {versoes.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {versoes.erro}{' '}
          <button type="button" className="bj-link" onClick={versoes.recarregar}>
            Tentar de novo
          </button>
        </p>
      )}

      {versoes.estado === 'loading' && (
        <div aria-busy="true" className="bj-reg-corpo">
          <span className="bj-skeleton" style={{ height: 320 }} />
          <span className="bj-skeleton" style={{ height: 320 }} />
        </div>
      )}

      {versoes.estado === 'ok' && !versao && (
        <div className="bj-vazio">
          <h3>Nenhuma emenda cadastrada ainda</h3>
          <p>
            A curadoria do portal registra qual emenda vale para cada competição. Enquanto isso, o
            documento oficial é o da organização.
          </p>
        </div>
      )}

      {versao && (
        <div
          className={painel && selecionado ? 'bj-reg-corpo bj-reg-corpo--painel' : 'bj-reg-corpo'}
        >
          <div className="bj-reg-indice">
            <h2 className="bj-secao" id="reg-indice">
              <IconFiles size={16} /> Índice
            </h2>
            {indice.erro && (
              <p className="bj-legenda">
                O índice desta emenda ainda não foi publicado no portal. O documento oficial
                continua acessível pelo botão acima.
              </p>
            )}
            {indice.carregando && <span className="bj-skeleton" style={{ height: 240 }} />}
            {reg.query.trim() ? (
              <Achados
                achados={achados}
                onSelecionar={(id) => setReg({ sectionId: id, query: '' })}
              />
            ) : (
              blocos.length > 0 && (
                <RegulationTree
                  blocos={blocos}
                  selecionado={reg.sectionId}
                  abertos={abertos}
                  onSelecionar={(id) => setReg({ sectionId: id })}
                  onAbrir={setAbertos}
                />
              )
            )}
            <Referencias
              refs={referencias.data?.references ?? []}
              versoes={versoes.data?.versions ?? []}
            />
          </div>

          <div className="bj-reg-documento">
            {selecionado ? (
              <CartaoDaSecao bloco={selecionado} blocos={blocos} versao={versao} />
            ) : (
              <div className="bj-vazio">
                <h3>{versao.label}</h3>
                <p>
                  {versao.pageCount} páginas · {blocos.length || '—'} itens numerados. Escolha uma
                  seção no índice para ver as páginas e abrir o PDF oficial nela.
                </p>
                <a className="bj-btn" href={versao.source.url} target="_blank" rel="noreferrer">
                  Abrir no PDF oficial <IconArrow size={16} />
                </a>
              </div>
            )}
          </div>

          {selecionado && (
            <PainelDaSecao
              bloco={selecionado}
              versao={versao}
              refs={referencias.data?.references ?? []}
              aberto={painel}
              largo={largo}
              onAlternar={() => setPainelAberto((v) => !v)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * O índice é arquivo estático da própria origem (`/regulamento/indice-<edition>.json`),
 * não rota de API: é metadado que muda uma vez por emenda, e o visitante sem conta não
 * deve acordar o banco para desenhar um índice (§5.2).
 */
function useIndice(edition: string | null) {
  const [dados, setDados] = useState<IndiceRegulamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!edition) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    fetch(`/regulamento/indice-${edition}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<IndiceRegulamento>) : Promise.reject(r.status)))
      .then((j) => {
        if (!vivo) return
        setDados(j)
        setCarregando(false)
      })
      .catch((e) => {
        if (!vivo) return
        setDados(null)
        setErro(mensagem(e))
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [edition])

  return { dados, erro, carregando }
}

function Cabecalho({
  payload,
  versao,
  indice,
  query,
  onVersao,
  onQuery,
}: {
  payload: PayloadRegulamento | null
  versao: VersaoRegulamento | null
  indice: IndiceRegulamento | null
  query: string
  onVersao: (edition: string) => void
  onQuery: (q: string) => void
}) {
  const vigencia = rotuloVigencia(versao)
  return (
    <div className="bj-reg-cabecalho">
      <label className="bj-reg-campo">
        <span className="bj-sr-only">Emenda do regulamento</span>
        <select
          className="bj-eq-seletor"
          value={versao?.edition ?? ''}
          onChange={(e) => onVersao(e.target.value)}
          disabled={!payload?.versions.length}
        >
          {(payload?.versions ?? []).map((v) => (
            <option key={v.id} value={v.edition}>
              {v.label}
              {v.supersededById ? ' · substituída' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="bj-reg-fonte">
        {vigencia && <span className="bj-chip bj-chip-neutro">VIGENTE PARA: {vigencia}</span>}
        {versao && (
          <>
            <a className="bj-link" href={versao.source.url} target="_blank" rel="noreferrer">
              PDF oficial <IconArrow size={16} />
            </a>
            <span className="bj-legenda">conferido em {dataCurta(versao.checkedAt)}</span>
          </>
        )}
        {indice && versao && indice.corpusVersion !== versao.corpusVersion && (
          // §10.4 — índice e assistente saíram de ingestões diferentes: a citação abre
          // pela página, não pelo id, e quem lê precisa saber disso.
          <span className="bj-chip bj-chip-neutro" title={indice.corpusVersion}>
            ÍNDICE DE OUTRA INGESTÃO — CONFIRA A PÁGINA
          </span>
        )}
      </div>

      <label className="bj-reg-campo bj-reg-campo--ir">
        <span className="bj-sr-only">Ir para seção, página ou palavra do título</span>
        <input
          className="bj-eq-seletor"
          type="search"
          placeholder="Ir para: B6.2.4.3, p. 42 ou gaiola"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
    </div>
  )
}

function Achados({
  achados,
  onSelecionar,
}: {
  achados: Bloco[]
  onSelecionar: (id: string) => void
}) {
  if (achados.length === 0) {
    return <p className="bj-legenda">Nada com esse número, página ou palavra de título.</p>
  }
  return (
    <ul className="bj-reg-achados">
      {achados.slice(0, 60).map((b) => (
        <li key={b.id}>
          <button type="button" className="bj-reg-achado" onClick={() => onSelecionar(b.id)}>
            <span className="bj-reg-num">{b.id}</span>
            {b.title ? (
              <span className="bj-reg-titulo">{b.title}</span>
            ) : (
              <span className="bj-reg-pagina">p. {b.pageStart}</span>
            )}
          </button>
        </li>
      ))}
      {achados.length > 60 && (
        <li className="bj-legenda">e mais {achados.length - 60} — refine a busca.</li>
      )}
    </ul>
  )
}

/** FR-DF34.9 — o cartão da seção no modo `ponteiro`: para onde ir, não o que a regra diz. */
function CartaoDaSecao({
  bloco,
  blocos,
  versao,
}: {
  bloco: Bloco
  blocos: Bloco[]
  versao: VersaoRegulamento
}) {
  const setReg = useSession((s) => s.setRegulation)
  const [copiado, setCopiado] = useState(false)
  const vizinhos = irmaos(blocos, bloco.id).filter((b) => b.id !== bloco.id)

  const copiar = async () => {
    const link = `${window.location.origin}${window.location.pathname}${hashDaSecao(bloco.id, versao.edition)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // clipboard bloqueado (http, permissão): o link vai para a barra de endereço
      window.location.hash = hashDaSecao(bloco.id, versao.edition)
    }
  }

  return (
    <article className="bj-reg-cartao" aria-labelledby="reg-cartao-id">
      <h2 className="bj-reg-cartao-id" id="reg-cartao-id">
        {bloco.id}
      </h2>
      {bloco.title && <p className="bj-reg-cartao-titulo">{bloco.title}</p>}
      <p className="bj-reg-cartao-pag">
        {rotuloDePaginas(bloco)} do PDF oficial · {versao.label}
      </p>
      <div className="bj-reg-acoes">
        <a
          className="bj-btn bj-btn-primary"
          href={urlDaPagina(versao.source.url, bloco.pageStart)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir no PDF oficial <IconArrow size={16} />
        </a>
        <button type="button" className="bj-btn" onClick={copiar}>
          {copiado ? 'Link copiado' : 'Copiar link da seção'}
        </button>
      </div>
      <p className="bj-legenda">
        No celular o PDF abre na primeira página — a seção está na p. {bloco.pageStart}.
      </p>

      {vizinhos.length > 0 && (
        <section className="bj-reg-irmaos" aria-labelledby="reg-irmaos">
          <h3 className="bj-secao" id="reg-irmaos">
            Seções vizinhas
          </h3>
          <ul className="bj-reg-achados">
            {vizinhos.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className="bj-reg-achado"
                  onClick={() => setReg({ sectionId: b.id })}
                >
                  <span className="bj-reg-num">{b.id}</span>
                  {b.title ? (
                    <span className="bj-reg-titulo">{b.title}</span>
                  ) : (
                    <span className="bj-reg-pagina">p. {b.pageStart}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

/** FR-DF34.12 — "Nesta seção": caminho, validador, assistente, referências e equipe. */
function PainelDaSecao({
  bloco,
  versao,
  refs,
  aberto,
  largo,
  onAlternar,
}: {
  bloco: Bloco
  versao: VersaoRegulamento
  refs: Referencia[]
  aberto: boolean
  largo: boolean
  onAlternar: () => void
}) {
  const user = useSession((s) => s.user)
  const currentProject = useSession((s) => s.currentProject)
  const setPage = useSession((s) => s.setPage)
  const goToTeam = useSession((s) => s.goToTeam)
  const setPanel = useSession((s) => s.setPanel)
  const setDecisionPrefill = useSession((s) => s.setDecisionPrefill)
  const reg = useSession((s) => s.regulation)
  const setHighlightRule = useStore((s) => s.setHighlightRule)
  const regras = regrasDaSecao(bloco.id)
  const daSecao = referenciasDaSecao(refs, bloco.id)

  if (!aberto) {
    return (
      <button type="button" className="bj-reg-painel-fechado" onClick={onAlternar}>
        Nesta seção
      </button>
    )
  }

  const registrarDecisao = () => {
    setDecisionPrefill({
      title: `Decisão sobre ${bloco.id}`,
      why:
        `Regulamento ${versao.label}, ${bloco.id} (${rotuloDePaginas(bloco)}). ` +
        `Link: ${hashDaSecao(bloco.id, versao.edition)}`,
    })
    goToTeam('conhecimento')
  }

  return (
    <aside className="bj-reg-painel" aria-label={`Nesta seção: ${bloco.id}`}>
      <div className="bj-reg-painel-topo">
        <h2 className="bj-secao">Nesta seção</h2>
        {!largo && (
          <button type="button" className="bj-link" onClick={onAlternar}>
            Fechar
          </button>
        )}
      </div>

      <p className="bj-reg-caminho">
        {ancestrais(bloco.id).map((id, i) => (
          <span key={id}>
            {i > 0 && ' › '}
            <span className="bj-reg-num">{id}</span>
          </span>
        ))}
      </p>
      <p className="bj-legenda">{rotuloDePaginas(bloco)}</p>

      <section className="bj-reg-bloco">
        <h3 className="bj-secao">Validador</h3>
        {regras.length === 0 ? (
          <p className="bj-legenda">O validador de gaiola não confere nada desta seção.</p>
        ) : (
          <>
            <ul className="bj-reg-regras">
              {regras.map((r) => (
                <li key={r} className="bj-reg-num">
                  {r}
                </li>
              ))}
            </ul>
            {currentProject && (
              <button
                type="button"
                className="bj-btn bj-btn-sm"
                onClick={() => {
                  setHighlightRule(regras[0])
                  setPage('editor')
                }}
              >
                Ver no checklist
              </button>
            )}
          </>
        )}
      </section>

      <section className="bj-reg-bloco">
        <h3 className="bj-secao">Assistente</h3>
        {reg.fromAssistant && (
          <p className="bj-legenda">
            Citado na sua conversa.{' '}
            <button type="button" className="bj-link" onClick={() => setPage('assistant')}>
              Voltar ao assistente
            </button>
          </p>
        )}
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          onClick={() =>
            askAssistant(
              `O que a seção ${bloco.id} do regulamento exige?`,
              contextoDeRegra(bloco.id),
            )
          }
        >
          Perguntar sobre {bloco.id}
        </button>
      </section>

      {daSecao.length > 0 && (
        <section className="bj-reg-bloco">
          <h3 className="bj-secao">Referências</h3>
          <ul className="bj-reg-refs">
            {daSecao.map((r) => (
              <li key={r.id}>
                <a className="bj-link" href={r.url} target="_blank" rel="noreferrer">
                  {r.title} <IconArrow size={16} />
                </a>
                {r.altersRules && <span className="bj-chip bj-chip-neutro">ALTERA REGRA</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bj-reg-bloco">
        <h3 className="bj-secao">Equipe</h3>
        {user ? (
          <button type="button" className="bj-btn bj-btn-sm" onClick={registrarDecisao}>
            Registrar decisão sobre esta seção
          </button>
        ) : (
          <p className="bj-legenda">
            <button type="button" className="bj-link" onClick={() => setPanel('login')}>
              Entrar ou criar conta
            </button>{' '}
            para registrar decisões da equipe com link para esta seção.
          </p>
        )}
      </section>

      {/* FR-DF34.13 — o aviso da fonte se repete no rodapé do painel */}
      <p className="bj-reg-rodape">{AVISO_REGULAMENTO}</p>
    </aside>
  )
}

/** FR-DF34.14 / FR-DF34.15 — referências oficiais do ciclo, direto de `source_documents`. */
function Referencias({ refs, versoes }: { refs: Referencia[]; versoes: VersaoRegulamento[] }) {
  if (refs.length === 0) return null
  const substituida = (r: Referencia) =>
    r.kind === 'regulamento' &&
    versoes.some((v) => v.source.id === r.id && v.supersededById !== null)
  const substitutaDe = (r: Referencia) => {
    const v = versoes.find((x) => x.source.id === r.id)
    const nova = v && versoes.find((x) => x.id === v.supersededById)
    return nova ?? null
  }

  return (
    <section className="bj-reg-referencias" aria-labelledby="reg-referencias">
      <h2 className="bj-secao" id="reg-referencias">
        Referências oficiais
      </h2>
      <ul className="bj-reg-refs">
        {refs.map((r) => {
          const nova = substituida(r) ? substitutaDe(r) : null
          return (
            <li key={r.id}>
              <a className="bj-link" href={r.url} target="_blank" rel="noreferrer">
                {r.title} <IconArrow size={16} />
              </a>
              <span className="bj-reg-ref-meta">
                <span className="bj-chip bj-chip-neutro">{KIND_LABEL[r.kind]}</span>
                {r.edition && <span className="bj-reg-num">{r.edition}</span>}
                {substituida(r) && <span className="bj-chip bj-chip-neutro">SUBSTITUÍDA</span>}
                <span className="bj-legenda">conferido em {dataCurta(r.checkedAt)}</span>
              </span>
              {nova && <span className="bj-legenda">Substituída pela {nova.label}.</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
