import { dark, viewport3d } from '../tokens'
import * as glyphs from '../icons/glyphs'
import { ICONS, ICON_CEILING, ICON_DONOR } from '../icons/registry'
import { STATUS_LABEL, StatusChip, type StatusRole } from '../icons/statusIcon'

/**
 * Galeria de componentes (fase 0, passo 0.6). Montada SÓ em desenvolvimento, por
 * `?galeria=1`. É a superfície de comparação barata do plano: uma captura cobre a
 * maior parte das combinações que os 12 PRs seguintes vão tocar, e a grade de ícones
 * a 16px é o teste de distinção de forma que §8.9 exige.
 *
 * Nada aqui é produto. O app não consome nenhum token ainda — a fase 0 tem diff de
 * zero pixel por contrato.
 */
const SURFACES = [
  'bg-canvas',
  'bg-base',
  'bg-raised',
  'bg-overlay',
  'bg-sunken',
  'bg-inset',
] as const
const STATUS: StatusRole[] = ['pass', 'fail', 'warn', 'manual', 'info']
const SEMANTIC = ['brand', 'accent', 'pass', 'fail', 'warn', 'manual', 'info'] as const

export function Galeria() {
  return (
    <div className="bj-galeria">
      <header>
        <h1>Galeria do design system</h1>
        <p>
          Tokens de <code>apps/web/src/tokens.ts</code> · iconografia {ICON_DONOR.name}{' '}
          {ICON_DONOR.version} ({ICONS.length}/{ICON_CEILING} formas). Só em desenvolvimento.
        </p>
      </header>

      <section>
        <h2>Superfícies</h2>
        <div className="bj-galeria-grid">
          {SURFACES.map((s) => (
            <div key={s} className="bj-galeria-swatch" style={{ background: `var(--bj-${s})` }}>
              <span style={{ color: 'var(--bj-fg-primary)' }}>{s}</span>
              <span style={{ color: 'var(--bj-fg-secondary)' }}>secundário</span>
              <span style={{ color: 'var(--bj-fg-muted)' }}>apagado</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Semântica de cor</h2>
        <div className="bj-galeria-grid">
          {SEMANTIC.map((s) => (
            <div
              key={s}
              className="bj-galeria-swatch"
              style={{
                background: `var(--bj-${s}-bg)`,
                border: `1px solid var(--bj-${s}-border)`,
                color: `var(--bj-${s})`,
              }}
            >
              <strong>{s}</strong>
              <span style={{ background: `var(--bj-${s})`, color: `var(--bj-on-${s})` }}>
                on-{s}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Status — ícone + texto (CT-3)</h2>
        <p>
          A cor é reforço, nunca portador: <code>brand × warn</code> tem ΔE00 0,9 em deuteranopia.
        </p>
        <div className="bj-galeria-row">
          {STATUS.map((role) => (
            <StatusChip key={role} role={role} />
          ))}
        </div>
        <div className="bj-galeria-row">
          {STATUS.map((role) => (
            <span key={role}>
              {role} → {STATUS_LABEL[role]}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>Inventário de ícones a 16px (teste de distinção de forma)</h2>
        <div className="bj-galeria-icons">
          {ICONS.map((entry) => {
            const Glyph = (glyphs as Record<string, (p: { size: 16 }) => JSX.Element>)[entry.name]
            return (
              <figure key={entry.name}>
                <Glyph size={16} />
                <figcaption>
                  {entry.name.replace('Icon', '')}
                  <small>{entry.meaning}</small>
                </figcaption>
              </figure>
            )
          })}
        </div>
      </section>

      <section>
        <h2>Cena 3D</h2>
        <div className="bj-galeria-grid" style={{ background: viewport3d.bg }}>
          {Object.entries(viewport3d).map(([name, value]) => (
            <div key={name} className="bj-galeria-swatch" style={{ background: value }}>
              <span style={{ color: dark['fg-inverse'] }}>{name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
