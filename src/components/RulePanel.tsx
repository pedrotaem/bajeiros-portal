import type { RuleResult, Status } from '../rules/b6'
import { useStore } from '../store'

const BADGE: Record<Status, { label: string; className: string }> = {
  pass: { label: 'OK', className: 'badge pass' },
  fail: { label: 'FALHA', className: 'badge fail' },
  warn: { label: 'ATENÇÃO', className: 'badge warn' },
  manual: { label: 'MANUAL', className: 'badge manual' },
}

export function RulePanel({ results }: { results: RuleResult[] }) {
  const highlightRule = useStore((s) => s.highlightRule)
  const setHighlightRule = useStore((s) => s.setHighlightRule)

  const auto = results.filter((r) => r.status !== 'manual')
  const passed = auto.filter((r) => r.status === 'pass').length
  const failed = auto.filter((r) => r.status === 'fail').length

  return (
    <div className="rule-panel">
      <div className="score">
        <span className={failed ? 'score-bad' : 'score-good'}>
          {passed}/{auto.length}
        </span>{' '}
        verificações automáticas OK
        {failed > 0 && <span className="score-fail-count"> · {failed} falha(s)</span>}
      </div>
      <ul className="rule-list">
        {results.map((r, i) => (
          <li
            key={`${r.id}-${i}`}
            className={`rule-item ${highlightRule === r.id ? 'active' : ''}`}
            onClick={() => setHighlightRule(highlightRule === r.id ? null : r.id)}
          >
            <div className="rule-head">
              <span className={BADGE[r.status].className}>{BADGE[r.status].label}</span>
              <span className="rule-id">{r.id}</span>
            </div>
            <div className="rule-title">{r.title}</div>
            {(r.measured || r.limit) && (
              <div className="rule-detail">
                {r.measured && <span>medido: {r.measured}</span>}
                {r.limit && <span className="rule-limit"> · limite: {r.limit}</span>}
              </div>
            )}
            {r.note && <div className="rule-note">{r.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
