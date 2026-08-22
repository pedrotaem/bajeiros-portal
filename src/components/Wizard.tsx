import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildCage, defaultParams, type WizardParams } from '../model/builder'
import type { Cage } from '../model/types'

interface Field {
  key: keyof WizardParams
  label: string
}

interface StepDef {
  title: string
  guide: string
  fields: Field[]
}

const STEPS: StepDef[] = [
  {
    title: '1 · Corta-fogo (plano do RRH)',
    guide:
      'Guia B6: inclinação ≤ 20° (B6.2.4.2); largura ≥ 737 mm medida a 686 mm acima do Geraldão (B6.2.4.3). O plano já nasce com ALC, BLC, SHC e diagonal LDB.',
    fields: [
      { key: 'baseWidth', label: 'Largura na base A–A (mm)' },
      { key: 'topWidth', label: 'Largura no topo B–B (mm)' },
      { key: 'height', label: 'Altura dos pontos B (mm)' },
      { key: 'topOffsetZ', label: 'Recuo do topo em Z (mm)' },
      { key: 'seatY', label: 'Geraldão Y (mm)' },
      { key: 'seatZ', label: 'Geraldão Z (mm)' },
      { key: 'simY', label: 'Altura dos pontos S (mm)' },
      { key: 'shcY', label: 'Altura do SHC — pontos H (mm)' },
    ],
  },
  {
    title: '2 · Chão do carro (LFS)',
    guide:
      'O chão sai dos pontos A (90° + o recuo definido no corta-fogo). ILC deve ficar a ≤ 51 mm da ancoragem traseira das bandejas inferiores dianteiras (B6.2.8.4). Gera LFS, ILC, FLC, diagonal LFDB e USM.',
    fields: [
      { key: 'floorLen', label: 'Comprimento até os pontos F (mm)' },
      { key: 'ilcZ', label: 'Posição Z da travessa ILC (mm)' },
      { key: 'frontWidth', label: 'Largura entre pontos F (mm)' },
    ],
  },
  {
    title: '3 · Teto (RHO)',
    guide:
      'Pontos C: ≥ 305 mm à frente e ≥ 1041 mm acima do Geraldão (B6.2.7.4/7.5). RHO deve sair aproximadamente horizontal dos pontos B.',
    fields: [
      { key: 'cWidth', label: 'Largura entre pontos C (mm)' },
      { key: 'cY', label: 'Altura dos pontos C (mm)' },
      { key: 'cZ', label: 'Avanço Z dos pontos C (mm)' },
    ],
  },
  {
    title: '4 · União frontal (FBM + SIM)',
    guide:
      'FBM superior ≤ 45° da vertical (B6.2.13.5); SIM entre 203 e 356 mm acima da base do assento (B6.2.12.6); largura dos SIM não pode decrescer de D para S (B6.2.12.4).',
    fields: [
      { key: 'dWidth', label: 'Largura entre pontos D (mm)' },
      { key: 'dY', label: 'Altura dos pontos D (mm)' },
      { key: 'dZ', label: 'Posição Z dos pontos D (mm)' },
    ],
  },
  {
    title: '5 · Ancoragens da suspensão',
    guide:
      'As 20 ancoragens entram agora: dianteiras já sobre LFS/SIM/FBM; traseiras ficam SOLTAS atrás do corta-fogo (a regra SUSP.1 vai acusar) até a amarração do próximo passo passar por elas. Ajuste fino depois, clicando em cada losango.',
    fields: [],
  },
  {
    title: '6 · Amarração (Fore-Aft Bracing)',
    guide:
      'O regulamento exige AO MENOS UM dos dois sistemas (B6.2.14.2): a dianteira dispensa a traseira e vice-versa — ambas também é aceito. Traseira: triângulos apoiados em B, S e A, membros ≤ 813 mm, ângulos ≥ 25° (B6.2.14.4). Dianteira: junção ≤ 127 mm do ponto C, ≥ 30° com o FBM e pontos P suportados até o LFS (B6.2.14.3).',
    fields: [
      { key: 'rearZ', label: 'Recuo Z do vértice R (mm)' },
      { key: 'rearY', label: 'Altura do vértice R (mm)' },
    ],
  },
]

export function Wizard() {
  const loadCage = useStore((s) => s.loadCage)
  const setWizardActive = useStore((s) => s.setWizardActive)
  const [step, setStep] = useState(1)
  const [params, setParams] = useState<WizardParams>({ ...defaultParams })
  const snapshot = useRef<Cage | null>(null)

  useEffect(() => {
    if (!snapshot.current) snapshot.current = structuredClone(useStore.getState().cage)
  }, [])

  useEffect(() => {
    loadCage(buildCage(params, step))
  }, [params, step, loadCage])

  const def = STEPS[step - 1]

  function setField(key: keyof WizardParams, value: number) {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  function cancel() {
    if (snapshot.current) loadCage(snapshot.current)
    setWizardActive(false)
  }

  function finish() {
    loadCage(buildCage(params, 6))
    setWizardActive(false)
  }

  return (
    <div className="wizard">
      <div className="wizard-progress">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className={`wizard-dot ${i + 1 === step ? 'current' : i + 1 < step ? 'done' : ''}`}
            title={s.title}
          />
        ))}
      </div>
      <div className="section">
        <div className="section-title">{def.title}</div>
        <div className="wizard-guide">{def.guide}</div>
        {def.fields.map((f) => (
          <label key={f.key} className="num-field">
            <span>{f.label}</span>
            <input
              type="number"
              value={params[f.key] as number}
              onChange={(e) => setField(f.key, Number(e.target.value))}
            />
          </label>
        ))}
        {step === 6 && (
          <label className="num-field">
            <span>Tipo de amarração</span>
            <select
              className="type-select small"
              value={params.bracing}
              onChange={(e) =>
                setParams((prev) => ({
                  ...prev,
                  bracing: e.target.value as WizardParams['bracing'],
                }))
              }
            >
              <option value="rear">Traseira</option>
              <option value="front">Dianteira</option>
              <option value="both">Ambas</option>
            </select>
          </label>
        )}
      </div>
      <div className="section actions wizard-nav">
        <div className="add-row">
          <button disabled={step === 1} onClick={() => setStep(step - 1)}>
            ← Voltar
          </button>
          {step < STEPS.length ? (
            <button onClick={() => setStep(step + 1)}>Próximo →</button>
          ) : (
            <button className="primary" onClick={finish}>
              Concluir gaiola
            </button>
          )}
        </div>
        <button className="danger" onClick={cancel}>
          Cancelar (restaura gaiola anterior)
        </button>
      </div>
    </div>
  )
}
