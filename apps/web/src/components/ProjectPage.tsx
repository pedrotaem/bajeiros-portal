import { useMemo, useState } from 'react'
import type { Cage } from '@bajeiros/core/model/types'
import { useSession, type ProjectTab } from '../session'
import { useStore } from '../store'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconCloudUp } from '../icons/glyphs'
import { StatusChip, type StatusRole } from '../icons/statusIcon'
import { DatasheetTab } from './DatasheetTab'

/**
 * Página de projeto (DF-21 §3.5). `Equipe › Projetos › <projeto>` deixa de ser item
 * de lista e vira página com três abas: **Ficha · Versões · Validação**.
 *
 * A separação entre Ficha e Validação é a aplicação do §3.2 na navegação: a aba
 * Validação pode ficar vazia a vida inteira sem afetar a Ficha em nada. Por isso a
 * Ficha é a aba de abertura — ela vale sem o validador, e é o caso da equipe que
 * modela no CAD ou ainda nem começou a modelar.
 */
interface ProjectRow {
  id: string
  name: string
  description: string | null
  ownerUserId: string | null
  ownerTeamId: string | null
  lastSeq?: number
}

interface SnapshotRow {
  id: string
  seq: number
  created_at: string
  saved_by_user_id: string | null
}

interface RuleResult {
  id: string
  title: string
  status: 'pass' | 'fail' | 'warn' | 'manual'
  measured?: string
  limit?: string
  note?: string
}

interface TeamDetail {
  id: string
  name: string
  myRole: 'owner' | 'admin' | 'member'
  members: { userId: string; displayName: string }[]
}

const ABAS: [ProjectTab, string][] = [
  ['ficha', 'Ficha'],
  ['versoes', 'Versões'],
  ['validacao', 'Validação'],
]

export function ProjectPage(): JSX.Element {
  const projeto = useSession((s) => s.currentProject)
  const setPage = useSession((s) => s.setPage)
  const tab = useSession((s) => s.projectTab)
  const setTab = useSession((s) => s.setProjectTab)

  const projectId = projeto?.id ?? null
  const info = useFetch<ProjectRow>(projectId ? `/api/v1/projects/${projectId}` : null)
  const versoes = useFetch<SnapshotRow[]>(
    projectId ? `/api/v1/projects/${projectId}/snapshots` : null,
  )
  const equipe = useFetch<TeamDetail>(
    info.data?.ownerTeamId ? `/api/v1/teams/${info.data.ownerTeamId}` : null,
  )

  // Nome de quem editou: sem isto o "alterado por" da ficha viraria um uuid. Projeto
  // pessoal não precisa do mapa — é sempre a mesma pessoa.
  const nomes = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of equipe.data?.members ?? []) map.set(m.userId, m.displayName)
    return map
  }, [equipe.data])

  const podeDispensar = info.data?.ownerTeamId
    ? equipe.data?.myRole !== 'member'
    : !!info.data?.ownerUserId

  if (!projeto || !projectId) {
    return (
      <div className="bj-page">
        <div className="bj-vazio">
          <h4>Nenhum projeto aberto</h4>
          <p>Escolha um projeto em Equipe › Projetos para ver a ficha, as versões e a validação.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bj-page bj-projeto">
      <header className="bj-eq-head">
        <h2 className="bj-eq-nome">{info.data?.name ?? projeto.name}</h2>
        <span className="bj-chip bj-chip-neutro">
          {info.data?.ownerTeamId ? (equipe.data?.name ?? 'projeto da equipe') : 'projeto pessoal'}
        </span>
        <span className="bj-chip bj-chip-neutro">
          {versoes.data?.length
            ? `${versoes.data.length} versão(ões) da gaiola`
            : 'sem versão de gaiola'}
        </span>
        <button
          type="button"
          className="bj-link"
          onClick={() => (useSession.getState().setTeamTab('projetos'), setPage('equipe'))}
        >
          todos os projetos
        </button>
      </header>

      <div className="bj-abas" role="tablist" aria-label="Seções do projeto">
        {ABAS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            className="bj-aba"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {info.estado === 'error' && <p className="bj-erro">{info.erro}</p>}

      <div className="team-tab-body">
        {tab === 'ficha' && (
          <DatasheetTab
            projectId={projectId}
            nomes={nomes}
            podeDispensar={!!podeDispensar}
            onAbrirEditor={() => abrirNoEditor(projectId, projeto.name, versoes.data ?? [])}
          />
        )}
        {tab === 'versoes' && <VersoesTab projectId={projectId} versoes={versoes} nomes={nomes} />}
        {tab === 'validacao' && (
          <ValidacaoTab projectId={projectId} ultima={versoes.data?.[0]?.seq ?? null} />
        )}
      </div>
    </div>
  )
}

/** Abre a versão mais recente no editor 3D — sem desmontar o `<Viewport>`. */
async function abrirNoEditor(projectId: string, name: string, versoes: SnapshotRow[]) {
  const { api, setCurrentProject, setPage } = useSession.getState()
  const seq = versoes[0]?.seq ?? 0
  try {
    if (seq > 0) {
      const snap = await api<{ cage_json: Cage }>(`/api/v1/projects/${projectId}/snapshots/${seq}`)
      useStore.getState().loadCage(snap.cage_json)
    }
    setCurrentProject({ id: projectId, name, seq })
    setPage('editor')
  } catch {
    // falhar ao carregar a versão não pode prender a pessoa na ficha
    setCurrentProject({ id: projectId, name, seq })
    setPage('editor')
  }
}

// ---------- aba Versões ----------

function VersoesTab({
  projectId,
  versoes,
  nomes,
}: {
  projectId: string
  versoes: ReturnType<typeof useFetch<SnapshotRow[]>>
  nomes: Map<string, string>
}) {
  const projeto = useSession((s) => s.currentProject)
  const [erro, setErro] = useState<string | null>(null)

  const abrir = async (seq: number) => {
    setErro(null)
    try {
      const { api, setCurrentProject, setPage } = useSession.getState()
      const snap = await api<{ cage_json: Cage }>(`/api/v1/projects/${projectId}/snapshots/${seq}`)
      useStore.getState().loadCage(snap.cage_json)
      setCurrentProject({ id: projectId, name: projeto?.name ?? '', seq })
      setPage('editor')
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  if (versoes.estado === 'loading') return <span className="bj-skeleton" style={{ height: 80 }} />
  if (versoes.estado === 'error') return <p className="bj-erro">{versoes.erro}</p>

  return (
    <div className="bj-versoes">
      {erro && <p className="bj-erro">{erro}</p>}
      {(versoes.data ?? []).length === 0 ? (
        <div className="bj-vazio">
          <h4>Nenhuma versão salva</h4>
          <p>
            A ficha do protótipo funciona sem nenhuma versão — o validador facilita, nunca é
            condição. Quando a equipe modelar a gaiola, cada salvar vira uma versão aqui.
          </p>
        </div>
      ) : (
        <ul className="bj-cards">
          {(versoes.data ?? []).map((v) => (
            <li key={v.id} className="bj-card">
              <header>
                <h4>v{v.seq}</h4>
                <span className="bj-chip bj-chip-neutro">
                  {new Date(v.created_at).toLocaleString('pt-BR')}
                </span>
              </header>
              <p className="bj-card-estado">
                salva por {nomes.get(v.saved_by_user_id ?? '') ?? 'ex-membro'}
              </p>
              <div className="bj-card-acoes">
                <button type="button" className="bj-btn" onClick={() => void abrir(v.seq)}>
                  Abrir no validador <IconArrow size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- aba Validação ----------

function ValidacaoTab({ projectId, ultima }: { projectId: string; ultima: number | null }) {
  const snap = useFetch<{ seq: number; rules_result: RuleResult[] | null }>(
    ultima ? `/api/v1/projects/${projectId}/snapshots/${ultima}` : null,
  )
  const setPage = useSession((s) => s.setPage)

  if (!ultima) {
    // O convite do §3.5 — e ele é convite, nunca cobrança: a ficha não depende disto.
    return (
      <div className="bj-vazio">
        <h4>Este projeto ainda não tem gaiola modelada</h4>
        <p>
          A validação B6 aparece aqui quando a equipe salvar uma versão no validador. Nada da ficha
          depende disso: o carro pode estar 100% registrado sem nenhuma versão salva.
        </p>
        <button type="button" className="bj-btn" onClick={() => setPage('editor')}>
          Abrir o validador <IconArrow size={16} />
        </button>
      </div>
    )
  }
  if (snap.estado === 'loading') return <span className="bj-skeleton" style={{ height: 120 }} />
  if (snap.estado === 'error') return <p className="bj-erro">{snap.erro}</p>

  const resultados = snap.data?.rules_result ?? []
  const conta = (s: RuleResult['status']) => resultados.filter((r) => r.status === s).length
  const papeis: StatusRole[] = ['fail', 'warn', 'manual', 'pass']

  return (
    <div className="bj-validacao">
      <p className="bj-lead">
        Conformidade da versão v{snap.data?.seq} — estado da gaiola, não campo da ficha. Um número
        que a equipe não consegue preencher à mão é resultado de ferramenta, e mora aqui.
      </p>
      <div className="bj-contadores">
        {papeis.map((p) => (
          <span key={p}>
            <StatusChip role={p} /> {conta(p as RuleResult['status'])}
          </span>
        ))}
      </div>
      <ul className="bj-criterios">
        {resultados
          .filter((r) => r.status !== 'pass')
          .map((r) => (
            <li key={r.id} className="bj-criterio">
              <StatusChip role={r.status} />
              <div className="bj-criterio-corpo">
                <span className="bj-criterio-label">
                  {r.id} — {r.title}
                </span>
                {(r.measured || r.limit) && (
                  <span className="bj-criterio-meta">
                    {r.measured ?? ''}
                    {r.measured && r.limit ? ' · limite: ' : ''}
                    {r.limit ?? ''}
                  </span>
                )}
              </div>
            </li>
          ))}
      </ul>
      <p className="bj-rodape-catalogo">
        <IconCloudUp size={16} /> A validação lê a última versão salva. Salvar uma versão nova muda
        o que aparece aqui e as sugestões da ficha — nunca os valores que a equipe digitou.
      </p>
    </div>
  )
}
