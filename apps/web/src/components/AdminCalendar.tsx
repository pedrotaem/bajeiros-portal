import { useState } from 'react'
import type {
  CalendarCompetition,
  CalendarMilestone,
  CalendarPayload,
  MilestoneKind,
  RegistrationKind,
  SourceKind,
} from '@bajeiros/calendar/types'
import { MILESTONE_KINDS, REGISTRATION_KINDS, SOURCE_KINDS } from '@bajeiros/calendar/types'
import { cycleOf, seasonLabel } from '@bajeiros/calendar/cycle'
import { dataCurta, todayIso } from '@bajeiros/calendar/dates'
import {
  KIND_LABEL,
  nomeDaFonte,
  REGISTRATION_LABEL,
  SOURCE_LABEL,
} from '@bajeiros/calendar/labels'
import type { ParsedRow } from '@bajeiros/calendar/parse-table'
import { useSession } from '../session'
import { mensagem, useFetch } from '../lib/useFetch'
import { IconArrow, IconPlus, IconTrash } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'

/**
 * Administração › Calendário (DF-33 §4.8): competições da temporada, e por competição os
 * marcos, os documentos-fonte e os links úteis. Todo salvar carimba `checked_at` e deixa
 * trilha em audit_events — a API garante; aqui só se digita e se confere.
 *
 * "Colar tabela" (FR-DF33.23) propõe marcos em RASCUNHO: nada é gravado até a pessoa
 * conferir linha a linha e salvar.
 */

type Rascunho = ParsedRow & {
  sourceId: string | null
  dateResolved: boolean
  kind: MilestoneKind
  competitionId: string
  selecionado: boolean
}

export function AdminCalendar() {
  const [season, setSeason] = useState(cycleOf(todayIso()))
  const dados = useFetch<CalendarPayload>(`/api/v1/admin/calendar?season=${season}`, [season])
  const [aberta, setAberta] = useState<string | null>(null)
  const [novaCompeticao, setNovaCompeticao] = useState(false)
  const p = dados.data
  const temporadas = [...new Set([...(p?.seasons ?? []), season, season + 1])].sort((a, b) => b - a)

  return (
    <div className="bj-admin-cal">
      <div className="bj-eq-head">
        <select
          className="bj-eq-seletor"
          value={season}
          onChange={(e) => setSeason(Number(e.target.value))}
          aria-label="Temporada"
        >
          {temporadas.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          onClick={() => setNovaCompeticao((v) => !v)}
        >
          <IconPlus size={16} /> Competição
        </button>
        <span className="bj-legenda">
          Ciclo de 1º de julho de {season - 1} ao Nacional {season}; regionais de {season - 1}.
        </span>
      </div>

      {novaCompeticao && (
        <CompeticaoForm
          season={season}
          onSalvo={() => {
            setNovaCompeticao(false)
            dados.recarregar()
          }}
          onCancelar={() => setNovaCompeticao(false)}
        />
      )}

      {dados.estado === 'loading' && <span className="bj-skeleton" style={{ height: 120 }} />}
      {dados.estado === 'error' && (
        <p className="bj-erro" role="alert">
          {dados.erro}
        </p>
      )}
      {p && p.competitions.length === 0 && (
        <p className="bj-vazio">Nenhuma competição neste ciclo. Cadastre a primeira acima.</p>
      )}

      <ul className="bj-cards" style={{ gridTemplateColumns: '1fr' }}>
        {(p?.competitions ?? []).map((c) => (
          <li key={c.id} className="bj-card">
            <header>
              <h3>{c.name}</h3>
              {c.stale && <StatusChip role="warn" />}
              <span className="bj-legenda">
                {c.checkedAt
                  ? `conferida em ${dataCurta(c.checkedAt.slice(0, 10))}`
                  : 'nunca conferida'}
              </span>
            </header>
            <p className="bj-card-estado">
              {c.startsOn
                ? `${dataCurta(c.startsOn)} a ${dataCurta(c.endsOn ?? c.startsOn)}`
                : 'datas a confirmar'}
              {c.location ? ` · ${c.location}` : ''}
              {c.registrationOpensOn && c.registrationClosesOn
                ? ` · inscrições ${dataCurta(c.registrationOpensOn)} a ${dataCurta(c.registrationClosesOn)}`
                : ''}
            </p>
            <div className="bj-card-acoes">
              <button
                type="button"
                className="bj-btn bj-btn-sm"
                aria-expanded={aberta === c.id}
                onClick={() => setAberta(aberta === c.id ? null : c.id)}
              >
                {aberta === c.id ? 'Fechar' : 'Marcos, fontes e colagem'}
              </button>
              {c.officialUrl && (
                <a
                  className="bj-btn bj-btn-sm"
                  href={c.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  página oficial <IconArrow size={16} />
                </a>
              )}
            </div>
            {aberta === c.id && p && <Competicao c={c} payload={p} onChanged={dados.recarregar} />}
          </li>
        ))}
      </ul>
    </div>
  )
}

type Api = ReturnType<typeof useSession.getState>['api']

function CompeticaoForm({
  season,
  onSalvo,
  onCancelar,
}: {
  season: number
  onSalvo: () => void
  onCancelar: () => void
}) {
  const api = useSession((s) => s.api)
  const [kind, setKind] = useState<'nacional' | 'regional'>('nacional')
  const [region, setRegion] = useState('Sudeste')
  const [f, setF] = useState({
    startsOn: '',
    endsOn: '',
    location: '',
    officialUrl: '',
    registrationOpensOn: '',
    registrationClosesOn: '',
  })
  const [erro, setErro] = useState<string | null>(null)
  const ano = kind === 'nacional' ? season : season - 1
  const name = kind === 'nacional' ? `Nacional ${ano}` : `Regional ${region} ${ano}`
  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  })

  return (
    <form
      className="bj-card bj-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setErro(null)
        try {
          await api('/api/v1/admin/calendar/competitions', {
            method: 'POST',
            body: JSON.stringify({
              season: ano,
              kind,
              region: kind === 'regional' ? region : null,
              name,
              startsOn: f.startsOn || null,
              endsOn: f.endsOn || null,
              location: f.location || null,
              officialUrl: f.officialUrl || null,
              registrationOpensOn: f.registrationOpensOn || null,
              registrationClosesOn: f.registrationClosesOn || null,
            }),
          })
          onSalvo()
        } catch (err) {
          setErro(mensagem(err))
        }
      }}
    >
      <h4>Nova competição · {name}</h4>
      <div className="bj-marco">
        <select
          className="bj-eq-seletor"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'nacional' | 'regional')}
          aria-label="Tipo"
        >
          <option value="nacional">Nacional</option>
          <option value="regional">Regional</option>
        </select>
        {kind === 'regional' && (
          <select
            className="bj-eq-seletor"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Região"
          >
            {['Nordeste', 'Sudeste', 'Sul'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
      </div>
      <div className="bj-marco">
        <label>
          Início <input className="bj-eq-seletor" type="date" {...campo('startsOn')} />
        </label>
        <label>
          Fim <input className="bj-eq-seletor" type="date" {...campo('endsOn')} />
        </label>
      </div>
      <div className="bj-marco">
        <label>
          Inscrições de{' '}
          <input className="bj-eq-seletor" type="date" {...campo('registrationOpensOn')} />
        </label>
        <label>
          até <input className="bj-eq-seletor" type="date" {...campo('registrationClosesOn')} />
        </label>
      </div>
      <input className="bj-eq-seletor" placeholder="Local" maxLength={200} {...campo('location')} />
      <input
        className="bj-eq-seletor"
        placeholder="URL da página oficial"
        maxLength={500}
        {...campo('officialUrl')}
      />
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-sm bj-btn-primary">
          Salvar competição
        </button>
        <button type="button" className="bj-btn bj-btn-sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Competicao({
  c,
  payload,
  onChanged,
}: {
  c: CalendarCompetition
  payload: CalendarPayload
  onChanged: () => void
}) {
  const api = useSession((s) => s.api)
  const [erro, setErro] = useState<string | null>(null)
  const marcos = payload.milestones.filter(
    (m) => m.competitionId === c.id && !m.id.startsWith('src:'),
  )
  const fontes = [
    ...c.links,
    ...payload.milestones
      .filter((m) => m.competitionId === c.id && m.id.startsWith('src:') && m.source)
      .map((m) => m.source!),
  ]
  const [colagem, setColagem] = useState('')
  const [rascunho, setRascunho] = useState<Rascunho[] | null>(null)
  const [ignoradas, setIgnoradas] = useState<string[]>([])
  const [novoMarco, setNovoMarco] = useState(false)
  const [novaFonte, setNovaFonte] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setErro(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const propor = async () => {
    setErro(null)
    try {
      const r = await api<{
        rows: (ParsedRow & { sourceId: string | null; dateResolved: boolean })[]
        ignored: string[]
      }>('/api/v1/admin/calendar/parse-table', {
        method: 'POST',
        body: JSON.stringify({ text: colagem, competitionId: c.id }),
      })
      setRascunho(
        r.rows.map((row) => ({
          ...row,
          kind: row.kindGuess,
          competitionId: c.id,
          selecionado: !!row.dueOn,
        })),
      )
      setIgnoradas(r.ignored)
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const salvarRascunho = () =>
    run(async () => {
      for (const row of rascunho ?? []) {
        if (!row.selecionado || !row.dueOn) continue
        await api('/api/v1/admin/calendar/milestones', {
          method: 'POST',
          body: JSON.stringify({
            competitionId: c.id,
            kind: row.kind,
            title: row.title,
            dueOn: row.dueOn,
            sourceId: row.sourceId,
            status: 'confirmado',
          }),
        })
      }
      setRascunho(null)
      setColagem('')
    })

  return (
    <div className="bj-admin-cal-corpo">
      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      <section>
        <header className="bj-eq-head">
          <h4>Marcos ({marcos.length})</h4>
          <button
            type="button"
            className="bj-btn bj-btn-sm"
            onClick={() => setNovoMarco((v) => !v)}
          >
            <IconPlus size={16} /> Marco
          </button>
        </header>
        {novoMarco && (
          <MarcoForm
            api={api}
            competitionId={c.id}
            fontes={fontes}
            onSalvo={() => {
              setNovoMarco(false)
              onChanged()
            }}
          />
        )}
        <div className="bj-tabela-wrap">
          <table className="bj-tabela">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Marco</th>
                <th scope="col">Tipo</th>
                <th scope="col">Vale para</th>
                <th scope="col">Fonte</th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="bj-sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {marcos.length === 0 && (
                <tr>
                  <td colSpan={7} className="bj-legenda">
                    Nenhum marco. Cole a tabela oficial abaixo ou adicione um.
                  </td>
                </tr>
              )}
              {marcos.map((m) => (
                <MarcoLinha key={m.id} m={m} api={api} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className="bj-eq-head">
          <h4>Documentos-fonte e links ({fontes.length})</h4>
          <button
            type="button"
            className="bj-btn bj-btn-sm"
            onClick={() => setNovaFonte((v) => !v)}
          >
            <IconPlus size={16} /> Documento
          </button>
        </header>
        {novaFonte && (
          <FonteForm
            api={api}
            competitionId={c.id}
            onSalvo={() => {
              setNovaFonte(false)
              onChanged()
            }}
          />
        )}
        <ul className="bj-lista">
          {fontes.map((s) => (
            <li key={s.id}>
              <b>{nomeDaFonte(s)}</b> · {SOURCE_LABEL[s.kind]}
              {s.publishedOn ? ` · ${dataCurta(s.publishedOn)}` : ''}{' '}
              <a href={s.url} target="_blank" rel="noreferrer">
                abrir <IconArrow size={16} />
              </a>{' '}
              <button
                type="button"
                className="bj-link"
                onClick={() =>
                  run(() => api(`/api/v1/admin/calendar/sources/${s.id}`, { method: 'DELETE' }))
                }
              >
                excluir
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Colar tabela oficial</h4>
        <p className="bj-legenda">
          Copie a tabela "ATIVIDADE · LOCAL · PRAZO · INFORMATIVO" da página de Informações e cole
          aqui. O portal propõe os marcos; você confere e salva. "até a competição" vira a data de
          início do evento; "Informativo NN" liga ao documento já cadastrado.
        </p>
        <textarea
          className="bj-eq-seletor bj-textarea"
          value={colagem}
          onChange={(e) => setColagem(e.target.value)}
          placeholder={'Inscrição de equipe\tSite\taté 15/09/2026\tInformativo 01'}
          rows={6}
        />
        <div className="bj-card-acoes">
          <button
            type="button"
            className="bj-btn bj-btn-sm"
            disabled={!colagem.trim()}
            onClick={propor}
          >
            Propor marcos
          </button>
        </div>
        {rascunho && (
          <>
            <div className="bj-tabela-wrap">
              <table className="bj-tabela">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="bj-sr-only">Salvar</span>
                    </th>
                    <th scope="col">Marco</th>
                    <th scope="col">Data</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {rascunho.map((row, i) => {
                    const set = (patch: Partial<Rascunho>) =>
                      setRascunho(rascunho.map((r, j) => (i === j ? { ...r, ...patch } : r)))
                    return (
                      <tr key={i}>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.selecionado}
                            disabled={!row.dueOn}
                            aria-label={`Salvar ${row.title}`}
                            onChange={(e) => set({ selecionado: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            className="bj-eq-seletor"
                            value={row.title}
                            maxLength={140}
                            onChange={(e) => set({ title: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="bj-eq-seletor"
                            type="date"
                            value={row.dueOn ?? ''}
                            onChange={(e) =>
                              set({ dueOn: e.target.value || null, selecionado: !!e.target.value })
                            }
                          />
                          {row.dateResolved && (
                            <span className="bj-legenda"> (início da competição)</span>
                          )}
                          {!row.dueOn && row.dateHint && (
                            <span className="bj-legenda"> "{row.dateHint}"</span>
                          )}
                        </td>
                        <td>
                          <select
                            className="bj-eq-seletor"
                            value={row.kind}
                            onChange={(e) => set({ kind: e.target.value as MilestoneKind })}
                          >
                            {MILESTONE_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABEL[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="bj-eq-seletor"
                            value={row.sourceId ?? ''}
                            onChange={(e) => set({ sourceId: e.target.value || null })}
                          >
                            <option value="">
                              {row.sourceNumber != null
                                ? `Informativo ${row.sourceNumber} (não cadastrado)`
                                : 'sem fonte'}
                            </option>
                            {fontes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {nomeDaFonte(s)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {ignoradas.length > 0 && (
              <p className="bj-legenda">Ignoradas: {ignoradas.join(' · ')}</p>
            )}
            <div className="bj-card-acoes">
              <button
                type="button"
                className="bj-btn bj-btn-sm bj-btn-primary"
                onClick={salvarRascunho}
              >
                Salvar {rascunho.filter((r) => r.selecionado && r.dueOn).length} marco(s)
              </button>
              <button type="button" className="bj-btn bj-btn-sm" onClick={() => setRascunho(null)}>
                Descartar
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function MarcoLinha({
  m,
  api,
  onChanged,
}: {
  m: CalendarMilestone
  api: Api
  onChanged: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const patch = async (body: Record<string, unknown>) => {
    setErro(null)
    try {
      await api(`/api/v1/admin/calendar/milestones/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      onChanged()
    } catch (e) {
      setErro(mensagem(e))
    }
  }
  return (
    <tr>
      <td className="bj-num">
        <input
          className="bj-eq-seletor"
          type="date"
          defaultValue={m.dueOn}
          aria-label={`Data de ${m.title}`}
          onBlur={(e) =>
            e.target.value && e.target.value !== m.dueOn && patch({ dueOn: e.target.value })
          }
        />
      </td>
      <td>
        {m.title}
        {m.summary && <div className="bj-legenda">{m.summary}</div>}
        {erro && <div className="bj-erro">{erro}</div>}
      </td>
      <td>{KIND_LABEL[m.kind]}</td>
      <td>
        {m.appliesTo.length
          ? m.appliesTo.map((k) => REGISTRATION_LABEL[k as RegistrationKind]).join(', ')
          : 'todas'}
      </td>
      <td>{m.source ? nomeDaFonte(m.source) : '—'}</td>
      <td>
        <select
          className="bj-eq-seletor"
          value={m.status}
          aria-label={`Situação de ${m.title}`}
          onChange={(e) => patch({ status: e.target.value })}
        >
          <option value="previsto">previsto</option>
          <option value="confirmado">confirmado</option>
          <option value="cancelado">cancelado</option>
        </select>
      </td>
      <td>
        <button
          type="button"
          className="bj-btn bj-btn-sm"
          aria-label={`Excluir ${m.title}`}
          onClick={async () => {
            setErro(null)
            try {
              await api(`/api/v1/admin/calendar/milestones/${m.id}`, { method: 'DELETE' })
              onChanged()
            } catch (e) {
              setErro(mensagem(e))
            }
          }}
        >
          <IconTrash size={16} />
        </button>
      </td>
    </tr>
  )
}

function MarcoForm({
  api,
  competitionId,
  fontes,
  onSalvo,
}: {
  api: Api
  competitionId: string
  fontes: CalendarCompetition['links']
  onSalvo: () => void
}) {
  const [f, setF] = useState({
    kind: 'documento' as MilestoneKind,
    title: '',
    summary: '',
    startsOn: '',
    dueOn: '',
    appliesTo: [] as RegistrationKind[],
    sourceId: '',
    sectionId: '',
    status: 'confirmado',
  })
  const [erro, setErro] = useState<string | null>(null)
  return (
    <form
      className="bj-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setErro(null)
        try {
          await api('/api/v1/admin/calendar/milestones', {
            method: 'POST',
            body: JSON.stringify({
              competitionId,
              kind: f.kind,
              title: f.title.trim(),
              summary: f.summary.trim() || null,
              startsOn: f.startsOn || null,
              dueOn: f.dueOn,
              appliesTo: f.appliesTo,
              sourceId: f.sourceId || null,
              sectionId: f.sectionId.trim() || null,
              status: f.status,
            }),
          })
          onSalvo()
        } catch (err) {
          setErro(mensagem(err))
        }
      }}
    >
      <div className="bj-marco">
        <select
          className="bj-eq-seletor"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as MilestoneKind })}
          aria-label="Tipo"
        >
          {MILESTONE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          className="bj-eq-seletor"
          placeholder="Título (vocabulário do DS: 'Inscrição de integrantes')"
          maxLength={140}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          required
        />
      </div>
      <div className="bj-marco">
        <label>
          Início (janela){' '}
          <input
            className="bj-eq-seletor"
            type="date"
            value={f.startsOn}
            onChange={(e) => setF({ ...f, startsOn: e.target.value })}
          />
        </label>
        <label>
          Prazo{' '}
          <input
            className="bj-eq-seletor"
            type="date"
            value={f.dueOn}
            onChange={(e) => setF({ ...f, dueOn: e.target.value })}
            required
          />
        </label>
        <select
          className="bj-eq-seletor"
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value })}
          aria-label="Situação"
        >
          <option value="previsto">previsto</option>
          <option value="confirmado">confirmado</option>
        </select>
      </div>
      <textarea
        className="bj-eq-seletor bj-textarea"
        placeholder="Descrição curta curada (≤ 280): paráfrase, nunca cópia do informativo"
        maxLength={280}
        value={f.summary}
        onChange={(e) => setF({ ...f, summary: e.target.value })}
      />
      <div className="bj-marco">
        <span>Vale para:</span>
        {REGISTRATION_KINDS.map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={f.appliesTo.includes(k)}
              onChange={(e) =>
                setF({
                  ...f,
                  appliesTo: e.target.checked
                    ? [...f.appliesTo, k]
                    : f.appliesTo.filter((x) => x !== k),
                })
              }
            />{' '}
            {REGISTRATION_LABEL[k]}
          </label>
        ))}
      </div>
      <div className="bj-marco">
        <select
          className="bj-eq-seletor"
          value={f.sourceId}
          onChange={(e) => setF({ ...f, sourceId: e.target.value })}
          aria-label="Fonte"
        >
          <option value="">sem documento-fonte</option>
          {fontes.map((s) => (
            <option key={s.id} value={s.id}>
              {nomeDaFonte(s)}
            </option>
          ))}
        </select>
        <input
          className="bj-eq-seletor"
          placeholder="Seção do regulamento (ex.: C3.2)"
          maxLength={40}
          value={f.sectionId}
          onChange={(e) => setF({ ...f, sectionId: e.target.value })}
        />
      </div>
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-sm bj-btn-primary">
          Salvar marco
        </button>
      </div>
    </form>
  )
}

function FonteForm({
  api,
  competitionId,
  onSalvo,
}: {
  api: Api
  competitionId: string
  onSalvo: () => void
}) {
  const [f, setF] = useState({
    kind: 'informativo' as SourceKind,
    number: '',
    title: '',
    url: '',
    publishedOn: '',
    edition: '',
    geral: false,
  })
  const [erro, setErro] = useState<string | null>(null)
  return (
    <form
      className="bj-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setErro(null)
        try {
          await api('/api/v1/admin/calendar/sources', {
            method: 'POST',
            body: JSON.stringify({
              competitionId: f.geral ? null : competitionId,
              kind: f.kind,
              number: f.number ? Number(f.number) : null,
              title: f.title.trim(),
              url: f.url.trim(),
              publishedOn: f.publishedOn || null,
              edition: f.edition.trim() || null,
            }),
          })
          onSalvo()
        } catch (err) {
          setErro(mensagem(err))
        }
      }}
    >
      <div className="bj-marco">
        <select
          className="bj-eq-seletor"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as SourceKind })}
          aria-label="Tipo de documento"
        >
          {SOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SOURCE_LABEL[k]}
            </option>
          ))}
        </select>
        {f.kind === 'informativo' && (
          <input
            className="bj-eq-seletor"
            type="number"
            min={0}
            max={999}
            placeholder="nº"
            value={f.number}
            onChange={(e) => setF({ ...f, number: e.target.value })}
            aria-label="Número do informativo"
          />
        )}
        <input
          className="bj-eq-seletor"
          placeholder="Título como a organização nomeia"
          maxLength={200}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          required
        />
      </div>
      <input
        className="bj-eq-seletor"
        type="url"
        placeholder="URL (única por documento)"
        maxLength={500}
        value={f.url}
        onChange={(e) => setF({ ...f, url: e.target.value })}
        required
      />
      <div className="bj-marco">
        <label>
          Publicado em{' '}
          <input
            className="bj-eq-seletor"
            type="date"
            value={f.publishedOn}
            onChange={(e) => setF({ ...f, publishedOn: e.target.value })}
          />
        </label>
        <input
          className="bj-eq-seletor"
          placeholder="Edição (emenda-07, Ver27)"
          maxLength={40}
          value={f.edition}
          onChange={(e) => setF({ ...f, edition: e.target.value })}
        />
        <label>
          <input
            type="checkbox"
            checked={f.geral}
            onChange={(e) => setF({ ...f, geral: e.target.checked })}
          />{' '}
          vale para todas as competições
        </label>
      </div>
      {erro && <p className="bj-erro">{erro}</p>}
      <div className="bj-card-acoes">
        <button type="submit" className="bj-btn bj-btn-sm bj-btn-primary">
          Salvar documento
        </button>
      </div>
    </form>
  )
}
