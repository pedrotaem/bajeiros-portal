import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSession, ApiError, type TeamTab } from '../session'
import { OrgChart, type OrgMember, type OrgPosition } from './OrgChart'
import { EvolutionTab } from './EvolutionTab'
import { KnowledgeTab } from './KnowledgeTab'
import { ProjectsTab } from './ProjectsTab'

// DF-12 §3.3 — o espaço da equipe passa a ter QUATRO abas: Evolução · Pessoas ·
// Conhecimento · Projetos. Nada do DF-10 foi removido, só reorganizado: "Visão
// geral" morreu porque a leitura de lacunas virou evidência da Evolução, e
// Membros + Organograma + Estrutura + Entradas colapsaram em Pessoas.
//
// DF-10 E4 — página inteira de gestão da equipe (substitui o modal TeamsPanel).
// Papel de acesso e função do organograma são coisas separadas de propósito: o papel
// (owner/admin/member) é o que a RLS entende; a função é um nó de team_positions.
// O backend é a autoridade de permissão — esconder ação aqui só evita clique morto.

type Role = 'owner' | 'admin' | 'member'
type Situacao = 'trainee' | 'efetivo'
type SubPessoas = 'lista' | 'organograma' | 'estrutura' | 'entradas'
type Api = ReturnType<typeof useSession.getState>['api']

interface TeamRow {
  id: string
  name: string
  university: string | null
  myRole: Role
  memberCount: number
  joinRequestCount: number
  createdAt: string
}

// Estende o tipo que o organograma consome: a página precisa de e-mail/papel/entrada,
// o OrgChart não.
interface Member extends OrgMember {
  userId: string
  displayName: string
  email: string
  role: Role
  status: Situacao
  positionId: string | null
  joinedAt: string
}

interface Invite {
  id: string
  email: string
  expiresAt: string
}

interface JoinRequest {
  id: string
  userId: string
  displayName: string
  email: string
  requestedAt: string
  expiresAt: string
}

interface MyJoinRequest {
  id: string
  teamId: string
  teamName: string
  requestedAt: string
  expiresAt: string
}

interface TeamDetail extends TeamRow {
  members: Member[]
  pendingInvites: Invite[]
  joinRequests: JoinRequest[]
  positions: OrgPosition[]
}

interface ProjectRow {
  id: string
  name: string
  ownerUserId: string | null
  ownerTeamId: string | null
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'capitão/capitã',
  admin: 'co-capitão/co-capitã',
  member: 'membro',
}

const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 }

const TABS: [TeamTab, string][] = [
  ['evolucao', 'Evolução'],
  ['pessoas', 'Pessoas'],
  ['conhecimento', 'Conhecimento'],
  ['projetos', 'Projetos'],
]

// Vocabulário normativo (DF-12 RF-4.1): "Entradas" → "Convites e pedidos".
const SUB_PESSOAS: [SubPessoas, string][] = [
  ['lista', 'Lista'],
  ['organograma', 'Organograma'],
  ['estrutura', 'Editar cargos'],
  ['entradas', 'Convites e pedidos'],
]

const MAX_POSITIONS = 40
const MAX_DEPTH = 5

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function monthsSince(iso: string): number {
  const from = new Date(iso)
  const now = new Date()
  const raw = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth()
  return Math.max(0, now.getDate() < from.getDate() ? raw - 1 : raw)
}

function tempoDeCasa(iso: string): string {
  const meses = monthsSince(iso)
  if (meses < 1) return 'menos de 1 mês'
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const parte = `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  return resto ? `${parte} e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : parte
}

function isFixed(p: OrgPosition): boolean {
  return p.kind === 'captain' || p.kind === 'cocaptain'
}

// Mesma leitura do organograma: os nós de capitania são ocupados por quem TEM o
// papel de acesso, não por atribuição de função — só ficam vagos se a equipe
// estiver sem capitã(o) / sem co-capitania.
function vacantPositions(team: TeamDetail): OrgPosition[] {
  const ocupadas = new Set(team.members.map((m) => m.positionId).filter(Boolean))
  const temPapel = (role: Role) => team.members.some((m) => m.role === role)
  return team.positions.filter((p) => {
    if (p.kind === 'captain') return !temPapel('owner')
    if (p.kind === 'cocaptain') return !temPapel('admin')
    return !ocupadas.has(p.id)
  })
}

function useErr(): [string | null, (e: unknown) => void, () => void] {
  const [err, setErr] = useState<string | null>(null)
  return [
    err,
    (e) =>
      setErr(
        e instanceof ApiError
          ? (e.problem.detail ?? e.problem.title)
          : 'Erro de rede — API local rodando?',
      ),
    () => setErr(null),
  ]
}

export function TeamPage(): JSX.Element {
  const api = useSession((s) => s.api)
  const meId = useSession((s) => s.user?.id ?? '')
  const inviteNotice = useSession((s) => s.inviteNotice)
  const clearInviteNotice = useSession((s) => s.clearInviteNotice)
  // sub-estados de navegacao vivem no store central, nunca em useState local
  // (DF-12 P-1.4: e o que cria estado-navegacao orfao)
  const tab = useSession((s) => s.teamTab)
  const setTab = useSession((s) => s.setTeamTab)
  const activeTeamId = useSession((s) => s.activeTeamId)
  const setActiveTeam = useSession((s) => s.setActiveTeam)
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [mine, setMine] = useState<MyJoinRequest[]>([])
  const [team, setTeam] = useState<TeamDetail | null>(null)
  const [subPessoas, setSubPessoas] = useState<SubPessoas>('lista')
  // "trocar de equipe" precisa de um estado explícito: sem ele o efeito de
  // auto-abertura reabre a mesma equipe no mesmo tick e o botão vira no-op para
  // quem tem uma equipe só — exatamente o caso mais comum.
  const [listando, setListando] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUniversity, setNewUniversity] = useState('')
  const [err, fail, clear] = useErr()

  const reloadList = useCallback(() => {
    // erro precisa aparecer nas duas chamadas: engolir a de pendências deixava a
    // tela dizendo "você não participa de equipes" logo abaixo do aviso de
    // "pedido enviado", sem explicar nada (P-1.3)
    api<TeamRow[]>('/api/v1/teams')
      .then(setTeams)
      .catch((e) => {
        setTeams([])
        fail(e)
      })
    api<MyJoinRequest[]>('/api/v1/teams/join-requests/mine').then(setMine).catch(fail)
  }, [api]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reloadList, [reloadList])

  const openTeam = useCallback(
    async (id: string) => {
      clear()
      try {
        setTeam(await api<TeamDetail>(`/api/v1/teams/${id}`))
        setListando(false)
      } catch (e) {
        fail(e)
      }
    },
    [api], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Toda mutação termina aqui: sem refetch o organograma mostraria o estado velho (RF-3.2).
  const refresh = useCallback(() => {
    if (team) void openTeam(team.id)
  }, [team, openTeam])

  // Abre sozinha a equipe ativa (DF-12 RF-2.3): o espaço da equipe é um DESTINO do
  // rail, não uma lista para escolher toda vez.
  useEffect(() => {
    if (team || listando || !teams?.length) return
    const alvo = teams.find((t) => t.id === activeTeamId) ?? teams[0]
    void openTeam(alvo.id)
    if (alvo.id !== activeTeamId) setActiveTeam(alvo.id)
  }, [teams, team, listando, activeTeamId, openTeam, setActiveTeam])

  const trocarEquipe = (id: string) => {
    setActiveTeam(id)
    setListando(false)
    setTeam(null)
    void openTeam(id)
  }

  const back = () => {
    setTeam(null)
    setListando(true)
    reloadList()
  }

  const createTeam = async (e: FormEvent) => {
    e.preventDefault()
    clear()
    try {
      const t = await api<TeamRow>('/api/v1/teams', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), university: newUniversity.trim() || null }),
      })
      setNewName('')
      setNewUniversity('')
      reloadList()
      // equipe recem-criada vira a ATIVA: sem isto o Inicio continuaria mostrando a
      // equipe anterior e a pessoa acharia que a criacao nao pegou
      setActiveTeam(t.id)
      void openTeam(t.id)
    } catch (e2) {
      fail(e2)
    }
  }

  const giveUp = async (r: MyJoinRequest) => {
    if (!window.confirm(`Desistir de entrar na equipe ${r.teamName}?`)) return
    clear()
    try {
      await api(`/api/v1/teams/${r.teamId}/join-requests/${r.id}`, { method: 'DELETE' })
      reloadList()
    } catch (e) {
      fail(e)
    }
  }

  if (team) {
    const canManage = team.myRole !== 'member'
    return (
      <div className="bj-page team-page">
        <header className="bj-eq-head">
          <h2 className="bj-eq-nome">{team.name}</h2>
          {(teams?.length ?? 0) > 1 && (
            <select
              className="bj-eq-seletor"
              value={team.id}
              onChange={(e) => trocarEquipe(e.target.value)}
              aria-label="Equipe ativa"
            >
              {(teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <span className="bj-chip bj-chip-neutro">
            {team.university ?? 'instituição não informada'}
          </span>
          <span className="bj-chip bj-chip-neutro">{team.members.length} pessoas</span>
          <span className="bj-chip bj-chip-neutro">você é {ROLE_LABELS[team.myRole]}</span>
          <button type="button" className="bj-link" onClick={back}>
            todas as equipes
          </button>
        </header>

        <div className="bj-abas" role="tablist" aria-label="Seções da equipe">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              className="bj-aba"
              aria-selected={tab === id}
              onClick={() => {
                clear()
                setTab(id)
              }}
            >
              {label}
              {id === 'pessoas' && team.joinRequests.length > 0 && (
                <span className="bj-aba-badge">{team.joinRequests.length}</span>
              )}
            </button>
          ))}
        </div>

        {err && <p className="bj-erro">{err}</p>}

        <div className="team-tab-body">
          {tab === 'evolucao' && <EvolutionTab teamId={team.id} canManage={canManage} />}
          {tab === 'conhecimento' && <KnowledgeTab teamId={team.id} canManage={canManage} />}
          {tab === 'projetos' && <ProjectsTab teamId={team.id} canManage={canManage} />}
          {tab === 'pessoas' && (
            <>
              {/* organograma e edição da árvore são a MESMA superfície (estudo §9.4):
                  ver é de todos, editar continua exigindo position.manage */}
              <div className="bj-abas" role="tablist" aria-label="Visões de pessoas">
                {SUB_PESSOAS.filter(([id]) => id !== 'estrutura' || canManage).map(
                  ([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      className="bj-aba"
                      aria-selected={subPessoas === id}
                      onClick={() => (clear(), setSubPessoas(id))}
                    >
                      {label}
                      {id === 'entradas' && team.joinRequests.length > 0 && (
                        <span className="bj-aba-badge">{team.joinRequests.length}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
              {subPessoas === 'lista' && (
                <MembersTab
                  api={api}
                  fail={fail}
                  team={team}
                  meId={meId}
                  refresh={refresh}
                  onLeave={back}
                />
              )}
              {subPessoas === 'organograma' && <OrgTab team={team} />}
              {subPessoas === 'estrutura' && (
                <StructureTab api={api} fail={fail} team={team} refresh={refresh} />
              )}
              {subPessoas === 'entradas' && (
                <EntriesTab
                  api={api}
                  fail={fail}
                  team={team}
                  canManage={canManage}
                  refresh={refresh}
                />
              )}
              <OverviewTab
                key={team.id}
                api={api}
                fail={fail}
                team={team}
                meId={meId}
                refresh={refresh}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bj-page team-page">
      <div className="team-tab-body">
        {inviteNotice && (
          <p className="modal-note" onClick={clearInviteNotice}>
            {inviteNotice}
          </p>
        )}
        <p className="modal-note">
          Uma equipe compartilha projetos entre os membros e organiza quem responde por cada
          subsistema. Convide colegas por link — o convite vale só p/ o e-mail convidado, expira em
          7 dias e a entrada ainda passa pela confirmação da capitania.
        </p>
        <form className="team-form" onSubmit={createTeam}>
          <label className="field">
            Nome da equipe
            <input
              required
              maxLength={80}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ex.: MBF Racing"
            />
          </label>
          <label className="field">
            Universidade (opcional)
            <input
              maxLength={120}
              value={newUniversity}
              onChange={(e) => setNewUniversity(e.target.value)}
              placeholder="ex.: UFSC"
            />
          </label>
          <button className="account-btn primary" type="submit">
            Criar equipe
          </button>
        </form>
        {teams === null && <p className="modal-note">Carregando…</p>}
        {teams?.length === 0 && <p className="modal-note">Você ainda não participa de equipes.</p>}
        {teams && teams.length > 0 && (
          <ul className="project-list">
            {teams.map((t) => (
              <li key={t.id}>
                <span>
                  <b>{t.name}</b>
                  <small>
                    {' '}
                    · {ROLE_LABELS[t.myRole]} · {t.memberCount} membro(s)
                  </small>
                  {t.joinRequestCount > 0 && (
                    <span className="team-badge">{t.joinRequestCount} aguardando confirmação</span>
                  )}
                </span>
                <button className="account-btn" onClick={() => void openTeam(t.id)}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}
        {mine.length > 0 && (
          <>
            <div className="modal-section">Aguardando confirmação</div>
            <p className="modal-note">
              Você aceitou o convite e a capitania ainda precisa confirmar sua entrada.
            </p>
            <ul className="project-list">
              {mine.map((r) => (
                <li key={r.id}>
                  <span>
                    <b>{r.teamName}</b>
                    <small>
                      {' '}
                      · pedido em {fmtDate(r.requestedAt)} · expira em {fmtDate(r.expiresAt)}
                    </small>
                  </span>
                  <button className="account-btn danger" onClick={() => void giveUp(r)}>
                    Desistir
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {err && <p className="modal-err">{err}</p>}
      </div>
    </div>
  )
}

// ---------- visão geral ----------

function eliteGaps(team: TeamDetail): string[] {
  const gaps: string[] = []
  const ocupadas = new Set(team.members.map((m) => m.positionId).filter(Boolean))
  if (team.positions.length === 0) {
    gaps.push('A equipe ainda não tem organograma — crie a estrutura padrão na aba Estrutura.')
  }
  const semLider = team.positions.filter((p) => p.kind === 'lead' && !ocupadas.has(p.id))
  if (semLider.length > 0) {
    gaps.push(
      `${semLider.length} subsistema(s) sem líder: ${semLider.map((p) => p.name).join(', ')}.`,
    )
  }
  // quem está na capitania já aparece no nó de capitania — não conta como sem função
  const semFuncao = team.members.filter((m) => !m.positionId && m.role === 'member')
  if (semFuncao.length > 0) {
    gaps.push(`${semFuncao.length} membro(s) sem função definida no organograma.`)
  }
  const traineesAntigos = team.members.filter(
    (m) => m.status === 'trainee' && monthsSince(m.joinedAt) >= 6,
  )
  if (traineesAntigos.length > 0) {
    gaps.push(`${traineesAntigos.length} trainee(s) há mais de 6 meses sem efetivação.`)
  }
  if (team.members.filter((m) => m.role === 'owner').length > 1) {
    gaps.push('A equipe tem mais de um capitão — regularize transferindo a capitania.')
  } else if (team.members.length > 2 && !team.members.some((m) => m.role === 'admin')) {
    gaps.push('Nenhum co-capitão nomeado — a capitania fica sem suplência.')
  }
  if (team.joinRequests.length > 0) {
    gaps.push(`${team.joinRequests.length} solicitação(ões) de entrada esperando resposta.`)
  }
  return gaps
}

function OverviewTab({
  api,
  fail,
  team,
  meId,
  refresh,
}: {
  api: Api
  fail: (e: unknown) => void
  team: TeamDetail
  meId: string
  refresh: () => void
}) {
  const canManage = team.myRole !== 'member'
  const [name, setName] = useState(team.name)
  const [university, setUniversity] = useState(team.university ?? '')
  const [personal, setPersonal] = useState<ProjectRow[]>([])
  const [transferId, setTransferId] = useState('')

  useEffect(() => {
    api<ProjectRow[]>('/api/v1/projects')
      .then((list) => setPersonal(list.filter((p) => p.ownerUserId === meId)))
      .catch(() => {})
  }, [api, meId])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api(`/api/v1/teams/${team.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), university: university.trim() || null }),
      })
      refresh()
    } catch (e2) {
      fail(e2)
    }
  }

  const transfer = async (e: FormEvent) => {
    e.preventDefault()
    if (!transferId) return
    try {
      await api(`/api/v1/projects/${transferId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ teamId: team.id }),
      })
      setPersonal((list) => list.filter((p) => p.id !== transferId))
      setTransferId('')
    } catch (e2) {
      fail(e2)
    }
  }

  const cards: [string, number | string][] = [
    ['Membros', team.members.length],
    ['Trainees', team.members.filter((m) => m.status === 'trainee').length],
    ['Funções', team.positions.length],
    ['Vagas (funções sem ocupante)', vacantPositions(team).length],
    ['Entradas a confirmar', team.joinRequests.length],
    ['Equipe desde', fmtDate(team.createdAt)],
  ]
  const gaps = eliteGaps(team)

  return (
    <>
      {canManage ? (
        <form className="team-form" onSubmit={save}>
          <label className="field">
            Nome da equipe
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Universidade
            <input
              maxLength={120}
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              placeholder="ex.: UFSC"
            />
          </label>
          <button
            className="account-btn primary"
            type="submit"
            disabled={name.trim() === team.name && university.trim() === (team.university ?? '')}
          >
            Salvar
          </button>
        </form>
      ) : (
        <p className="modal-note">
          <b>{team.name}</b> · {team.university ?? 'universidade não informada'}. Só a capitania
          edita os dados da equipe.
        </p>
      )}

      <div className="team-cards">
        {cards.map(([label, value]) => (
          <div key={label} className="team-card">
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {gaps.length > 0 && (
        <>
          <div className="modal-section">Práticas de elite — o que falta</div>
          <ul className="team-gaps">
            {gaps.map((g) => (
              <li key={g} className="team-gap">
                {g}
              </li>
            ))}
          </ul>
        </>
      )}

      {personal.length > 0 && (
        <>
          <div className="modal-section">Trazer projeto p/ a equipe</div>
          <form className="modal-row" onSubmit={transfer}>
            <select
              className="team-select"
              value={transferId}
              onChange={(e) => setTransferId(e.target.value)}
            >
              <option value="">Escolha um projeto pessoal…</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="account-btn" type="submit" disabled={!transferId}>
              Transferir
            </button>
          </form>
          <p className="modal-note">
            Depois de transferir, o projeto passa a ser da equipe — todos os membros veem e salvam
            versões.
          </p>
        </>
      )}
    </>
  )
}

// ---------- membros ----------

function MembersTab({
  api,
  fail,
  team,
  meId,
  refresh,
  onLeave,
}: {
  api: Api
  fail: (e: unknown) => void
  team: TeamDetail
  meId: string
  refresh: () => void
  onLeave: () => void
}) {
  const canManage = team.myRole !== 'member'
  const canRole = team.myRole === 'owner'
  const byId = useMemo(() => new Map(team.positions.map((p) => [p.id, p])), [team.positions])
  const assignable = team.positions.filter((p) => !isFixed(p))
  // equipe legada (anterior ao DF-10) pode ter mais de um capitão: aí a tela
  // precisa oferecer os caminhos que a API aceita para regularizar
  const multiOwner = team.members.filter((m) => m.role === 'owner').length > 1

  const patch = async (userId: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/v1/teams/${team.id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (m: Member) => {
    const self = m.userId === meId
    const msg = self
      ? 'Sair desta equipe? Você perde o acesso aos projetos dela.'
      : `Remover ${m.displayName} da equipe?`
    if (!window.confirm(msg)) return
    try {
      await api(`/api/v1/teams/${team.id}/members/${m.userId}`, { method: 'DELETE' })
      if (self) onLeave()
      else refresh()
    } catch (e) {
      fail(e)
    }
  }

  const transferCaptaincy = async (m: Member) => {
    const msg =
      `Transferir a capitania para ${m.displayName}? ` +
      'Você deixa de ser capitão/capitã: vira co-capitão/co-capitã se houver vaga, senão membro.'
    if (!window.confirm(msg)) return
    try {
      await api(`/api/v1/teams/${team.id}/transfer-captaincy`, {
        method: 'POST',
        body: JSON.stringify({ toUserId: m.userId }),
      })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="team-table-wrap">
      <table className="team-table">
        <thead>
          <tr>
            <th>Membro</th>
            <th>Papel de acesso</th>
            <th>Situação</th>
            <th>Função</th>
            <th>Entrada</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {team.members.map((m) => {
            const self = m.userId === meId
            const pos = m.positionId ? byId.get(m.positionId) : undefined
            const removable = self || (canManage && RANK[team.myRole] > RANK[m.role])
            // o backend exige superar o papel do alvo p/ mexer em função e situação
            const canAssign = canManage && (self || RANK[team.myRole] > RANK[m.role])
            const canChangeRole = canRole && !self && (m.role !== 'owner' || multiOwner)
            return (
              <tr key={m.userId}>
                <td>
                  <b>{m.displayName}</b>
                  {self && <span className="admin-chip">você</span>}
                  <br />
                  <span className="admin-dim">{m.email}</span>
                </td>
                <td>
                  {canChangeRole ? (
                    <select
                      className="team-select"
                      value={m.role}
                      onChange={(e) => void patch(m.userId, { role: e.target.value })}
                    >
                      {m.role === 'owner' && <option value="owner">capitão/capitã</option>}
                      <option value="admin">co-capitão/co-capitã</option>
                      <option value="member">membro</option>
                    </select>
                  ) : (
                    ROLE_LABELS[m.role]
                  )}
                </td>
                <td>
                  <span
                    className={m.status === 'efetivo' ? 'admin-chip team-chip-ok' : 'admin-chip'}
                  >
                    {m.status}
                  </span>
                  {canAssign && (
                    <>
                      <br />
                      <button
                        className="account-btn"
                        onClick={() =>
                          void patch(m.userId, {
                            status: m.status === 'trainee' ? 'efetivo' : 'trainee',
                          })
                        }
                      >
                        {m.status === 'trainee' ? 'Efetivar' : 'Voltar a trainee'}
                      </button>
                    </>
                  )}
                </td>
                <td>
                  {!canAssign ? (
                    <>
                      {pos?.name ?? <span className="admin-dim">sem função</span>}
                      {m.role !== 'member' && (
                        <>
                          <br />
                          <span className="admin-dim">+ {ROLE_LABELS[m.role]}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <select
                      className="team-select"
                      value={m.positionId ?? ''}
                      onChange={(e) => void patch(m.userId, { positionId: e.target.value || null })}
                    >
                      <option value="">sem função</option>
                      {assignable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  {fmtDate(m.joinedAt)}
                  <br />
                  <span className="admin-dim">{tempoDeCasa(m.joinedAt)} de casa</span>
                </td>
                <td>
                  <div className="team-row-actions">
                    {canRole && !self && (
                      <button className="account-btn" onClick={() => void transferCaptaincy(m)}>
                        Transferir capitania
                      </button>
                    )}
                    {removable && (
                      <button className="account-btn danger" onClick={() => void remove(m)}>
                        {self ? 'Sair da equipe' : 'Remover'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------- organograma ----------

function OrgTab({ team }: { team: TeamDetail }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = team.members.find((m) => m.userId === pickedId) ?? null
  const pos = picked?.positionId
    ? (team.positions.find((p) => p.id === picked.positionId) ?? null)
    : null

  if (team.positions.length === 0) {
    return (
      <p className="modal-note">
        A equipe ainda não tem funções — crie a estrutura padrão na aba Estrutura para ver o
        organograma.
      </p>
    )
  }

  return (
    <div className="team-chart-wrap">
      <OrgChart
        positions={team.positions}
        members={team.members}
        selectedPositionId={picked?.positionId ?? null}
        onSelectMember={(userId) => setPickedId(userId)}
      />
      {picked && (
        <aside className="team-member-card">
          <div className="modal-row">
            <b>{picked.displayName}</b>
            <button className="account-btn" onClick={() => setPickedId(null)}>
              Fechar
            </button>
          </div>
          <span className="admin-dim">{picked.email}</span>
          <p>
            <b>Função:</b> {pos?.name ?? 'sem função'}
          </p>
          {pos?.description && <p className="modal-note">{pos.description}</p>}
          <p>
            <b>Papel de acesso:</b> {ROLE_LABELS[picked.role]}
          </p>
          <p>
            <b>Situação:</b> {picked.status}
          </p>
          <p>
            <b>Entrada:</b> {fmtDate(picked.joinedAt)} · {tempoDeCasa(picked.joinedAt)} de casa
          </p>
        </aside>
      )}
    </div>
  )
}

// ---------- estrutura (árvore de funções) ----------

function StructureTab({
  api,
  fail,
  team,
  refresh,
}: {
  api: Api
  fail: (e: unknown) => void
  team: TeamDetail
  refresh: () => void
}) {
  const canManage = team.myRole !== 'member'
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })

  const byParent = useMemo(() => {
    const map = new Map<string | null, OrgPosition[]>()
    for (const p of team.positions) {
      const list = map.get(p.parentId) ?? []
      list.push(p)
      map.set(p.parentId, list)
    }
    return map
  }, [team.positions])

  const ids = useMemo(() => new Set(team.positions.map((p) => p.id)), [team.positions])

  // Toda função precisa aparecer aqui, senão fica sem ação possível na tela. Dado
  // torto (ciclo, função-mãe inexistente) entra como raiz em vez de sumir.
  const roots = useMemo(() => {
    const raizes = team.positions.filter((p) => !p.parentId || !ids.has(p.parentId))
    const alcancavel = new Set<string>()
    const marcar = (p: OrgPosition) => {
      if (alcancavel.has(p.id)) return
      alcancavel.add(p.id)
      for (const filho of byParent.get(p.id) ?? []) marcar(filho)
    }
    raizes.forEach(marcar)
    return [...raizes, ...team.positions.filter((p) => !alcancavel.has(p.id))]
  }, [team.positions, ids, byParent])

  const descendants = (id: string): Set<string> => {
    const out = new Set<string>([id])
    const walk = (parent: string) => {
      for (const child of byParent.get(parent) ?? []) {
        if (out.has(child.id)) continue // ciclo: não entra em recursão infinita
        out.add(child.id)
        walk(child.id)
      }
    }
    walk(id)
    return out
  }

  const closeForms = () => {
    setEditing(null)
    setCreating(null)
    setForm({ name: '', description: '' })
  }

  const seed = async () => {
    try {
      await api(`/api/v1/teams/${team.id}/positions/seed`, { method: 'POST' })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!creating) return
    try {
      await api(`/api/v1/teams/${team.id}/positions`, {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          parentId: creating,
        }),
      })
      closeForms()
      refresh()
    } catch (e2) {
      fail(e2)
    }
  }

  const rename = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    try {
      await api(`/api/v1/teams/${team.id}/positions/${editing}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      })
      closeForms()
      refresh()
    } catch (e2) {
      fail(e2)
    }
  }

  const move = async (id: string, parentId: string) => {
    try {
      await api(`/api/v1/teams/${team.id}/positions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ parentId }),
      })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const drop = async (p: OrgPosition, ocupantes: number, filhos: number) => {
    const msg =
      `Excluir a função "${p.name}"?` +
      (ocupantes ? ` ${ocupantes} ocupante(s) ficam sem função.` : '') +
      (filhos ? ` ${filhos} subfunção(ões) sobem para a função-mãe.` : '')
    if (!window.confirm(msg)) return
    try {
      await api(`/api/v1/teams/${team.id}/positions/${p.id}`, { method: 'DELETE' })
      closeForms()
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const nodeForm = (onSubmit: (e: FormEvent) => void, depth: number, label: string) => (
    <li className="team-node-form" style={{ marginLeft: depth * 18 }}>
      <form onSubmit={onSubmit}>
        <label className="field">
          Nome da função
          <input
            required
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="field">
          Responsabilidades
          <input
            maxLength={280}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="o que essa função responde na equipe"
          />
        </label>
        <div className="team-row-actions">
          <button className="account-btn primary" type="submit">
            {label}
          </button>
          <button className="account-btn" type="button" onClick={closeForms}>
            Cancelar
          </button>
        </div>
      </form>
    </li>
  )

  const renderNode = (p: OrgPosition, depth: number, acima: string[] = []): JSX.Element => {
    // corta aresta de volta: com dado em ciclo a recursão travaria a aba
    const kids = (byParent.get(p.id) ?? []).filter((k) => !acima.includes(k.id))
    const fixa = isFixed(p)
    const ocupantes = fixa
      ? team.members.filter((m) => (p.kind === 'captain' ? m.role === 'owner' : m.role === 'admin'))
      : team.members.filter((m) => m.positionId === p.id)
    const podeCriarFilho =
      canManage && depth + 1 < MAX_DEPTH && team.positions.length < MAX_POSITIONS
    const alvos = fixa ? [] : team.positions.filter((t) => !descendants(p.id).has(t.id))
    return (
      <Fragment key={p.id}>
        <li
          className={fixa ? 'team-node team-node-fixed' : 'team-node'}
          style={{ marginLeft: depth * 18 }}
        >
          <div>
            <span className="team-node-name">{p.name}</span>
            {ocupantes.length ? (
              <small className="admin-dim">
                {' '}
                · {ocupantes.map((m) => m.displayName).join(', ')}
              </small>
            ) : (
              <small className="team-vaga"> · vaga</small>
            )}
            {p.description && <div className="team-node-desc">{p.description}</div>}
          </div>
          {canManage && (
            <div className="team-row-actions">
              {podeCriarFilho && (
                <button
                  className="account-btn"
                  onClick={() => {
                    setEditing(null)
                    setCreating(p.id)
                    setForm({ name: '', description: '' })
                  }}
                >
                  Nova subfunção
                </button>
              )}
              <button
                className="account-btn"
                onClick={() => {
                  setCreating(null)
                  setEditing(p.id)
                  setForm({ name: p.name, description: p.description ?? '' })
                }}
              >
                Editar
              </button>
              {!fixa && alvos.length > 0 && (
                <select
                  className="team-select"
                  value=""
                  onChange={(e) => e.target.value && void move(p.id, e.target.value)}
                >
                  <option value="">Mover para…</option>
                  {alvos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {!fixa && (
                <button
                  className="account-btn danger"
                  onClick={() => void drop(p, ocupantes.length, kids.length)}
                >
                  Excluir
                </button>
              )}
            </div>
          )}
        </li>
        {editing === p.id && nodeForm(rename, depth + 1, 'Salvar função')}
        {creating === p.id && nodeForm(create, depth + 1, 'Criar subfunção')}
        {kids.map((k) => renderNode(k, depth + 1, [...acima, p.id]))}
      </Fragment>
    )
  }

  if (team.positions.length === 0) {
    return (
      <>
        <p className="modal-note">
          A equipe ainda não tem organograma. A estrutura padrão traz capitania, os seis líderes de
          subsistema e o nó de membros, cada um com as responsabilidades já descritas.
        </p>
        {canManage ? (
          <div className="modal-row">
            <button className="account-btn primary" onClick={() => void seed()}>
              Criar estrutura padrão
            </button>
          </div>
        ) : (
          <p className="modal-note">Só a capitania cria e edita funções.</p>
        )}
      </>
    )
  }

  return (
    <>
      <p className="modal-note">
        Cada função tem responsabilidades próprias e cada pessoa ocupa uma função. Os nós de
        capitania mostram quem tem o papel de acesso correspondente: dá p/ renomear e descrever, não
        p/ mover, excluir ou atribuir na mão.
      </p>
      <ul className="team-tree">{roots.map((p) => renderNode(p, 0))}</ul>
      {canManage && team.positions.length >= MAX_POSITIONS && (
        <p className="modal-note">Limite de {MAX_POSITIONS} funções atingido.</p>
      )}
    </>
  )
}

// ---------- entradas (solicitações + convites) ----------

function EntriesTab({
  api,
  fail,
  team,
  canManage,
  refresh,
}: {
  api: Api
  fail: (e: unknown) => void
  team: TeamDetail
  canManage: boolean
  refresh: () => void
}) {
  const [choice, setChoice] = useState<Record<string, { status: Situacao; positionId: string }>>({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const assignable = team.positions.filter((p) => !isFixed(p))

  if (!canManage) {
    return (
      <p className="modal-note">
        Só o capitão/capitã e os co-capitães convidam pessoas e confirmam entradas.
      </p>
    )
  }

  const pick = (id: string) => choice[id] ?? { status: 'trainee' as Situacao, positionId: '' }
  const setPick = (id: string, patch: Partial<{ status: Situacao; positionId: string }>) =>
    setChoice((c) => ({ ...c, [id]: { ...pick(id), ...patch } }))

  const approve = async (r: JoinRequest) => {
    const { status, positionId } = pick(r.id)
    try {
      await api(`/api/v1/teams/${team.id}/join-requests/${r.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ status, positionId: positionId || null }),
      })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const reject = async (r: JoinRequest) => {
    if (!window.confirm(`Recusar a entrada de ${r.displayName}?`)) return
    try {
      await api(`/api/v1/teams/${team.id}/join-requests/${r.id}`, { method: 'DELETE' })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault()
    setCopied(false)
    try {
      const r = await api<{ token: string }>(`/api/v1/teams/${team.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const link = `${window.location.origin}${window.location.pathname}#convite=${r.token}`
      setLastLink(link)
      setInviteEmail('')
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
      } catch {
        /* clipboard pode ser negado — o link fica visível p/ copiar na mão */
      }
      refresh()
    } catch (e2) {
      fail(e2)
    }
  }

  const revoke = async (id: string) => {
    try {
      await api(`/api/v1/teams/${team.id}/invites/${id}`, { method: 'DELETE' })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <>
      <div className="modal-section">Entradas a confirmar</div>
      {team.joinRequests.length === 0 ? (
        <p className="modal-note">Ninguém esperando confirmação.</p>
      ) : (
        <ul className="project-list">
          {team.joinRequests.map((r) => (
            <li key={r.id}>
              <span>
                <b>{r.displayName}</b>
                <small>
                  {' '}
                  · {r.email} · pediu em {fmtDate(r.requestedAt)} · expira em {fmtDate(r.expiresAt)}
                </small>
              </span>
              <span className="team-approve">
                <select
                  className="team-select"
                  value={pick(r.id).status}
                  onChange={(e) => setPick(r.id, { status: e.target.value as Situacao })}
                >
                  <option value="trainee">entra como trainee</option>
                  <option value="efetivo">entra como efetivo</option>
                </select>
                <select
                  className="team-select"
                  value={pick(r.id).positionId}
                  onChange={(e) => setPick(r.id, { positionId: e.target.value })}
                >
                  <option value="">sem função por enquanto</option>
                  {assignable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="account-btn primary" onClick={() => void approve(r)}>
                  Confirmar entrada
                </button>
                <button className="account-btn danger" onClick={() => void reject(r)}>
                  Recusar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="modal-section">Convidar</div>
      <form className="modal-row" onSubmit={sendInvite}>
        <input
          type="email"
          required
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="e-mail do(a) colega"
        />
        <button className="account-btn primary" type="submit">
          Gerar link
        </button>
      </form>
      {lastLink && (
        <p className="modal-note">
          {copied ? 'Link copiado! ' : ''}Envie este link (vale 7 dias, só p/ o e-mail convidado):{' '}
          <code>{lastLink}</code>
        </p>
      )}
      {team.pendingInvites.length > 0 && (
        <ul className="project-list">
          {team.pendingInvites.map((i) => (
            <li key={i.id}>
              <span>
                {i.email}
                <small> · expira em {fmtDate(i.expiresAt)}</small>
              </span>
              <button className="account-btn danger" onClick={() => void revoke(i.id)}>
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
