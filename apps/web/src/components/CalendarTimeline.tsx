import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  CalendarCompetition,
  CalendarMilestone,
  CalendarPayload,
  TeamBond,
} from '@bajeiros/calendar/types'
import { monthsOf } from '@bajeiros/calendar/cycle'
import { dataCurta, daysBetween, stateChip, stateOf } from '@bajeiros/calendar/dates'
import { ariaLabelDoMarco, shapeOf, SHAPE_LABEL } from '@bajeiros/calendar/labels'
import { useSession } from '../session'
import { rotuloCurto } from '../lib/calendario'
import { IconArrow } from '../icons/glyphs'
import { StatusChip } from '../icons/statusIcon'

/**
 * Linha do tempo (design-system C-26): eixo por mês, uma raia por competição, a raia "Sua
 * temporada" no topo para quem é da equipe. Cada marco tem FORMA por tipo (FR-DF33.5) e
 * rótulo textual — a cor só reforça. Marco e faixa são botões: Tab entra, ←/→ percorre
 * a raia, Enter abre o painel (FR-DF33.6).
 */
interface Props {
  payload: CalendarPayload
  competitions: CalendarCompetition[]
  milestones: CalendarMilestone[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Presente só para quem tem `evolution.season` (FR-DF33.12). */
  onBond?: (competitionId: string, bond: TeamBond | null) => void
}

/**
 * Andar de cada marco na raia (alto · baixo · meio), escolhido por data: o rótulo ocupa
 * ~13% da largura do trilho e o próximo marco cai no primeiro andar já livre. Três andares
 * e ~10 marcos por raia cabem sem sobrepor; quando não cabe, o "meio" é o que sobra.
 */
export type Andar = 'alto' | 'baixo' | 'meio'

/** Largura típica de um rótulo (forma + texto curto), em px — bate com `.bj-cal-rotulo`. */
const ROTULO_PX = 160

export function andares(percentuais: number[], larguraRotulo = 13): Andar[] {
  const ordem: Andar[] = ['alto', 'baixo', 'meio']
  const fim: Record<Andar, number> = { alto: -Infinity, baixo: -Infinity, meio: -Infinity }
  return percentuais.map((x) => {
    const livre =
      ordem.find((a) => fim[a] <= x) ?? ordem.reduce((m, a) => (fim[a] < fim[m] ? a : m))
    fim[livre] = x + larguraRotulo
    return livre
  })
}

function pctNum(range: { from: string; to: string }, iso: string): number {
  const total = daysBetween(range.from, range.to) + 1
  return (Math.min(Math.max(daysBetween(range.from, iso), 0), total) / total) * 100
}

export function CalendarTimeline({
  payload,
  competitions,
  milestones,
  selectedId,
  onSelect,
  onBond,
}: Props) {
  const goToTeam = useSession((s) => s.goToTeam)
  const { range, today, team } = payload
  // largura real do trilho: o rótulo tem ~150px, e é em % dela que os andares se decidem
  const trilhoRef = useRef<HTMLDivElement>(null)
  const [larguraTrilho, setLarguraTrilho] = useState(1100)
  useEffect(() => {
    const el = trilhoRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = e?.contentRect.width
      if (w) setLarguraTrilho(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const larguraRotulo = Math.min(50, (ROTULO_PX / larguraTrilho) * 100)
  const meses = monthsOf(range)
  const total = daysBetween(range.from, range.to) + 1
  const pct = (iso: string) =>
    `${(Math.min(Math.max(daysBetween(range.from, iso), 0), total) / total) * 100}%`
  const largura = (from: string, to: string) =>
    `${(Math.min(Math.max(daysBetween(from, to) + 1, 1), total) / total) * 100}%`
  const hojeDentro = today >= range.from && today <= range.to
  // Marco fora da faixa do ciclo NÃO é desenhado: clampado, ele apareceria colado na borda
  // esquerda como se fosse de julho (a inscrição das regionais fecha em junho, antes do ciclo
  // começar). A Lista continua mostrando, sob "Já passou" — é lá que o histórico cabe.
  const noCiclo = (m: CalendarMilestone) => m.dueOn >= range.from && m.dueOn <= range.to
  const daEquipe = milestones.filter((m) => m.kind === 'equipe' && noCiclo(m))

  return (
    <div className="bj-cal-linha" role="group" aria-label="Linha do tempo da temporada">
      <div className="bj-cal-raia bj-cal-raia--meses" aria-hidden="true">
        <div className="bj-cal-raia-cab" />
        <div
          ref={trilhoRef}
          className="bj-cal-meses"
          style={{ gridTemplateColumns: meses.map((m) => `${m.days}fr`).join(' ') }}
        >
          {meses.map((m) => (
            <span key={m.key}>
              {m.label}
              {m.month === 1 || m.key === meses[0].key ? ` ${m.year}` : ''}
            </span>
          ))}
        </div>
      </div>

      {team && (
        <div className="bj-cal-raia bj-cal-raia--equipe">
          <div className="bj-cal-raia-cab">
            <strong>Sua temporada · {team.label}</strong>
            <span className="bj-cal-raia-nota">marcos e entregas da equipe</span>
          </div>
          <Trilho pct={pct} today={today} hojeDentro={hojeDentro} range={range}>
            {daEquipe.length === 0 ? (
              <span className="bj-cal-vazia">
                <button type="button" className="bj-link" onClick={() => goToTeam('projetos')}>
                  Configure a temporada em Equipe › Projetos
                </button>
              </span>
            ) : (
              (() => {
                const andar = andares(
                  daEquipe.map((m) => pctNum(range, m.dueOn)),
                  larguraRotulo,
                )
                return daEquipe.map((m, i) => (
                  <Marco
                    key={m.id}
                    m={m}
                    competitionName={null}
                    seasonLabel={team.label}
                    today={today}
                    left={pct(m.dueOn)}
                    andar={andar[i]}
                    selected={selectedId === m.id}
                    onSelect={onSelect}
                  />
                ))
              })()
            )}
          </Trilho>
        </div>
      )}

      {competitions.map((c) => {
        const marcos = milestones.filter((m) => m.competitionId === c.id && noCiclo(m))
        const andar = andares(
          marcos.map((m) => pctNum(range, m.startsOn ?? m.dueOn)),
          larguraRotulo,
        )
        return (
          <div key={c.id} className="bj-cal-raia">
            <div className="bj-cal-raia-cab">
              <strong>{c.name}</strong>
              <span className="bj-cal-raia-chips">
                {c.bond === 'inscrita' && <span className="bj-chip bj-chip-brand">INSCRITA</span>}
                {c.bond === 'interesse' && (
                  <span className="bj-chip bj-chip-interesse">INTERESSE</span>
                )}
                {c.stale && <StatusChip role="warn" />}
              </span>
              {onBond && <BondButtons c={c} onBond={onBond} />}
              <span className="bj-cal-raia-nota">
                {c.checkedAt
                  ? `Fonte conferida em ${dataCurta(c.checkedAt.slice(0, 10))}`
                  : 'Fonte não conferida'}
                {c.stale ? ' — pode estar desatualizado — confira a fonte' : ''}
                {c.officialUrl && (
                  <>
                    {' · '}
                    <a href={c.officialUrl} target="_blank" rel="noreferrer">
                      página oficial <IconArrow size={16} />
                    </a>
                  </>
                )}
              </span>
            </div>
            <Trilho pct={pct} today={today} hojeDentro={hojeDentro} range={range}>
              {c.registrationOpensOn &&
                c.registrationClosesOn &&
                c.registrationClosesOn >= range.from && (
                  <button
                    type="button"
                    className={`bj-cal-janela bj-cal-janela--${stateOf(c.registrationClosesOn, today)}`}
                    style={{
                      left: pct(c.registrationOpensOn),
                      width: largura(c.registrationOpensOn, c.registrationClosesOn),
                    }}
                    aria-label={`Inscrições, de ${dataCurta(c.registrationOpensOn)} a ${dataCurta(c.registrationClosesOn)}, ${c.name}`}
                    onClick={() =>
                      c.officialUrl && window.open(c.officialUrl, '_blank', 'noreferrer')
                    }
                  >
                    <span className="bj-cal-rotulo">inscrições</span>
                  </button>
                )}
              {c.startsOn && (
                <span
                  className={`bj-cal-evento bj-cal-evento--${stateOf(c.endsOn ?? c.startsOn, today)}`}
                  style={{
                    left: pct(c.startsOn),
                    width: largura(c.startsOn, c.endsOn ?? c.startsOn),
                  }}
                  role="img"
                  aria-label={`${c.name}, de ${dataCurta(c.startsOn)} a ${dataCurta(c.endsOn ?? c.startsOn)}`}
                >
                  <span className="bj-cal-rotulo">competição</span>
                </span>
              )}
              {marcos.map((m, i) => (
                <Marco
                  key={m.id}
                  m={m}
                  competitionName={c.name}
                  today={today}
                  left={pct(m.dueOn)}
                  width={m.startsOn ? largura(m.startsOn, m.dueOn) : undefined}
                  leftStart={m.startsOn ? pct(m.startsOn) : undefined}
                  andar={andar[i]}
                  selected={selectedId === m.id}
                  onSelect={onSelect}
                />
              ))}
            </Trilho>
          </div>
        )
      })}

      <p className="bj-legenda bj-cal-legenda">
        Formas: <i className="bj-cal-forma bj-cal-forma--losango" aria-hidden="true" /> prazo ·{' '}
        <i className="bj-cal-forma bj-cal-forma--barra" aria-hidden="true" /> janela ·{' '}
        <i className="bj-cal-forma bj-cal-forma--faixa" aria-hidden="true" /> evento ·{' '}
        <i className="bj-cal-forma bj-cal-forma--circulo" aria-hidden="true" /> comunicado ·{' '}
        <i className="bj-cal-forma bj-cal-forma--quadrado" aria-hidden="true" /> marco da equipe. A
        região à esquerda da linha "hoje" já passou.
      </p>
    </div>
  )
}

/** "Estamos inscritos" · "Acompanhar" — mesmo PUT da aba Projetos (§10.9). */
function BondButtons({
  c,
  onBond,
}: {
  c: CalendarCompetition
  onBond: (competitionId: string, bond: TeamBond | null) => void
}) {
  return (
    <span className="bj-cal-vinculo" role="group" aria-label={`Vínculo com ${c.name}`}>
      <button
        type="button"
        className="bj-btn bj-btn-sm"
        aria-pressed={c.bond === 'inscrita'}
        onClick={() => onBond(c.id, c.bond === 'inscrita' ? null : 'inscrita')}
      >
        Estamos inscritos
      </button>
      <button
        type="button"
        className="bj-btn bj-btn-sm"
        aria-pressed={c.bond === 'interesse'}
        onClick={() => onBond(c.id, c.bond === 'interesse' ? null : 'interesse')}
      >
        Acompanhar
      </button>
    </span>
  )
}

function Trilho({
  pct,
  today,
  hojeDentro,
  range,
  children,
}: {
  pct: (iso: string) => string
  today: string
  hojeDentro: boolean
  range: { from: string; to: string }
  children: React.ReactNode
}) {
  // ←/→ percorrem os marcos da raia (FR-DF33.6) — botões irmãos, na ordem do DOM
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const botoes = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const alvo = botoes[(i + (e.key === 'ArrowRight' ? 1 : botoes.length - 1)) % botoes.length]
    alvo?.focus()
  }
  return (
    <div className="bj-cal-trilho" onKeyDown={onKeyDown}>
      {hojeDentro && (
        <>
          <span className="bj-cal-passado" style={{ width: pct(today) }} aria-hidden="true" />
          <span className="bj-cal-hoje" style={{ left: pct(today) }} aria-label="hoje">
            <span className="bj-cal-hoje-rotulo">hoje</span>
          </span>
        </>
      )}
      {!hojeDentro && today > range.to && (
        <span className="bj-cal-passado" style={{ width: '100%' }} aria-hidden="true" />
      )}
      {children}
    </div>
  )
}

function Marco({
  m,
  competitionName,
  seasonLabel,
  today,
  left,
  leftStart,
  width,
  andar,
  selected,
  onSelect,
}: {
  m: CalendarMilestone
  competitionName: string | null
  seasonLabel?: string
  today: string
  left: string
  leftStart?: string
  width?: string
  andar: Andar
  selected: boolean
  onSelect: (id: string) => void
}) {
  const shape = shapeOf(m)
  const state = stateOf(m.dueOn, today)
  const chip = stateChip(m.dueOn, today)
  const janela = shape === 'barra' && leftStart && width
  return (
    <button
      type="button"
      className={[
        'bj-cal-marco',
        `bj-cal-marco--${shape}`,
        `bj-cal-marco--${state}`,
        `bj-cal-marco--${andar}`,
        selected ? 'bj-cal-marco--sel' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={janela ? { left: leftStart, width } : { left }}
      aria-label={ariaLabelDoMarco(m, competitionName, seasonLabel)}
      aria-pressed={selected}
      title={SHAPE_LABEL[shape]}
      onClick={() => onSelect(m.id)}
    >
      <span className={`bj-cal-forma bj-cal-forma--${shape}`} aria-hidden="true" />
      <span className="bj-cal-rotulo">
        {rotuloCurto(m.title)}
        {chip && <span className="bj-chip bj-chip-warn">{chip}</span>}
      </span>
    </button>
  )
}
