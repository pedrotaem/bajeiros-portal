import { useMemo, useState } from 'react'
import { authHeaders, useSession } from '../session'
import { mensagem, quando, useFetch } from '../lib/useFetch'
import { IconArrow, IconCheck, IconDownload, IconRotateCcw } from '../icons/glyphs'
import { StatusIcon } from '../icons/statusIcon'

/**
 * Aba Ficha do protótipo (DF-21 E2/E3).
 *
 * As três regras que a tela precisa aplicar, e que valem mais que o layout:
 *  1. **Nenhum campo é somente leitura.** Todos aceitam digitação, sempre — inclusive
 *     os que têm sugestão do modelo 3D.
 *  2. **Sem gaiola salva, a linha de sugestão não aparece.** Nada de espaço vazio
 *     cobrando o uso do editor (RF-3.5).
 *  3. **Divergência não tem cor de status.** Não é conformidade, é informação (§3.3):
 *     o aviso de faixa é chip `warn`; a diferença entre colunas é texto neutro.
 */
type Kind = 'design' | 'measured'
type Escalar = number | string | boolean

interface CampoMeta {
  id: string
  section: string
  label: string
  type: 'number' | 'enum' | 'boolean' | 'text' | 'longtext' | 'date' | 'link'
  unit?: string
  help: string
  options?: { id: string; label: string }[]
  typical?: { min: number; max: number }
  dual: boolean
  suggestable: boolean
  comparable: boolean
  maxLength?: number
}

interface ValorGuardado {
  fieldId: string
  kind: Kind
  value: Escalar
  updatedBy: string | null
  updatedAt: string | null
}

interface Delta {
  abs: number
  pct: number | null
}

interface SecaoView {
  id: string
  label: string
  purpose: string
  waived: boolean
  waiverReason: string | null
  progress: { filled: number; total: number; pct: number }
}

interface Ficha {
  projectId: string
  projectName: string
  catalogVersion: string
  hasCage: boolean
  cageSeq: number | null
  sections: SecaoView[]
  fields: CampoMeta[]
  values: ValorGuardado[]
  suggestions: { fieldId: string; value: Escalar; origin: string }[]
  divergences: {
    fieldId: string
    suggestedVsDesign?: Delta
    designVsMeasured?: Delta
    suggestedVsMeasured?: Delta
  }[]
  warnings: { fieldId: string; kind: Kind; message: string }[]
  progress: {
    filled: number
    total: number
    pct: number
    waivedSections: number
    sections: { sectionId: string; filled: number; total: number; pct: number; waived: boolean }[]
  }
}

interface Revisao {
  fieldId: string
  kind: Kind
  oldValue: Escalar | null
  newValue: Escalar | null
  source: 'manual' | 'suggestion'
  changedBy: string | null
  changedAt: string
}

const chave = (fieldId: string, kind: Kind) => `${fieldId}:${kind}`

function numero(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * Valor → texto do formulário. Número sai com **vírgula**: é como a pessoa escreve,
 * e a borda da API aceita as duas formas — o ida e volta fecha sem surpresa.
 */
function texto(v: Escalar | undefined | null): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'sim' : 'nao'
  return typeof v === 'number' ? numero(v) : String(v)
}

function sinal(d: Delta): string {
  const abs = `${d.abs > 0 ? '+' : ''}${numero(d.abs)}`
  return d.pct === null ? abs : `${abs} (${d.pct > 0 ? '+' : ''}${numero(d.pct)}%)`
}

export function DatasheetTab({
  projectId,
  nomes,
  podeDispensar,
  onAbrirEditor,
}: {
  projectId: string
  nomes: Map<string, string>
  podeDispensar: boolean
  onAbrirEditor: () => void
}) {
  const api = useSession((s) => s.api)
  const meId = useSession((s) => s.user?.id ?? '')
  const busca = useFetch<Ficha>(`/api/v1/projects/${projectId}/datasheet`)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [ultimaLeitura, setUltimaLeitura] = useState<Ficha | null>(null)
  // `null` = ninguém mexeu no acordeão ainda; a primeira seção abre sozinha
  const [abertas, setAbertas] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  // Ajuste de estado DURANTE o render (padrão do React para "estado derivado de
  // props"): a escrita atualiza a ficha localmente, e uma leitura nova a substitui.
  if (busca.data && busca.data !== ultimaLeitura) {
    setUltimaLeitura(busca.data)
    setFicha(busca.data)
  }

  const valores = useMemo(() => {
    const map = new Map<string, ValorGuardado>()
    for (const v of ficha?.values ?? []) map.set(chave(v.fieldId, v.kind), v)
    return map
  }, [ficha])

  const sugestoes = useMemo(
    () => new Map((ficha?.suggestions ?? []).map((s) => [s.fieldId, s])),
    [ficha],
  )
  const divergencias = useMemo(
    () => new Map((ficha?.divergences ?? []).map((d) => [d.fieldId, d])),
    [ficha],
  )
  const avisos = useMemo(
    () => new Map((ficha?.warnings ?? []).map((w) => [chave(w.fieldId, w.kind), w.message])),
    [ficha],
  )

  if (busca.estado === 'loading' && !ficha) {
    return <span className="bj-skeleton" style={{ height: 240 }} />
  }
  if (busca.estado === 'error') {
    return (
      <div className="bj-vazio">
        <h4>Não deu para carregar a ficha</h4>
        <p>{busca.erro}</p>
        <button type="button" className="bj-btn" onClick={busca.recarregar}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!ficha) return <span className="bj-skeleton" style={{ height: 240 }} />

  /** Escrita de UM campo. Parcial é o caso normal — nada aqui exige ficha completa. */
  const salvar = async (
    campo: CampoMeta,
    kind: Kind,
    bruto: string | null,
    source: 'manual' | 'suggestion' = 'manual',
  ) => {
    const atual = valores.get(chave(campo.id, kind))
    const valor = converter(campo, bruto)
    if (valor !== null && texto(valor) === texto(atual?.value)) return // nada mudou
    if (valor === null && !atual) return

    setErro(null)
    setSalvando(chave(campo.id, kind))
    try {
      const r = await api<{
        values: ValorGuardado[]
        progress: Ficha['progress']
        warnings: { fieldId: string; kind: Kind; message: string }[]
      }>(`/api/v1/projects/${projectId}/datasheet`, {
        method: 'PUT',
        body: JSON.stringify({
          values: [
            {
              fieldId: campo.id,
              kind,
              value: valor,
              // lock otimista por campo: quem editou antes não perde a escrita em
              // silêncio — a resposta 409 diz o valor vigente
              expectedUpdatedAt: atual?.updatedAt ?? null,
              source,
            },
          ],
        }),
      })
      setFicha((f) =>
        f
          ? {
              ...f,
              values: r.values,
              progress: r.progress,
              sections: f.sections.map((s) => ({
                ...s,
                progress: r.progress.sections.find((p) => p.sectionId === s.id) ?? s.progress,
              })),
              warnings: [
                ...f.warnings.filter((w) => !(w.fieldId === campo.id && w.kind === kind)),
                ...r.warnings,
              ],
              divergences: f.divergences, // recalculadas no próximo GET; nunca guardadas
            }
          : f,
      )
      // as divergências e as sugestões saem da leitura: recarrega em segundo plano
      busca.recarregar()
    } catch (e) {
      setErro(mensagem(e))
    } finally {
      setSalvando(null)
    }
  }

  const dispensar = async (sectionId: string, reason: string | null) => {
    setErro(null)
    try {
      const r = await api<Ficha>(
        `/api/v1/projects/${projectId}/datasheet/waivers/${sectionId}`,
        reason === null
          ? { method: 'DELETE' }
          : { method: 'PUT', body: JSON.stringify({ reason }) },
      )
      setFicha(r)
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const exportar = async (fmt: 'md' | 'csv') => {
    setErro(null)
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/datasheet/export?fmt=${fmt}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Não deu para gerar o arquivo agora.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ficha-${ficha.projectName}.${fmt}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const { progress } = ficha

  return (
    <div className="bj-ficha">
      <header className="bj-ficha-topo">
        <div className="bj-escore-num">
          <strong>{progress.pct}%</strong>
          <span>
            {progress.filled} de {progress.total} campos
            {progress.waivedSections > 0 &&
              ` · ${progress.waivedSections} seção(ões) não se aplicam`}
          </span>
        </div>
        <p className="bj-ficha-lead">
          Preenchimento parcial é normal. Nada aqui trava e nada exige o validador. A ficha vale
          para a inspeção, para o relatório e para quem chegar na equipe no ano que vem.
        </p>
        <div className="bj-card-acoes">
          <button type="button" className="bj-btn bj-btn-sm" onClick={() => void exportar('md')}>
            <IconDownload size={16} /> Markdown
          </button>
          <button type="button" className="bj-btn bj-btn-sm" onClick={() => void exportar('csv')}>
            <IconDownload size={16} /> CSV
          </button>
        </div>
      </header>

      {erro && (
        <p className="bj-erro" role="alert">
          {erro}
        </p>
      )}

      {ficha.hasCage ? (
        <p className="bj-ficha-nota">
          <StatusIcon role="info" /> Seis campos têm palpite do modelo 3D (v{ficha.cageSeq}). O
          palpite é oferta: quem decide é quem está editando, e salvar uma versão nova nunca
          sobrescreve o que a equipe digitou.
        </p>
      ) : (
        <p className="bj-ficha-nota">
          <StatusIcon role="info" /> Este projeto não tem versão de gaiola salva, e a ficha continua
          100% preenchível.{' '}
          <button type="button" className="bj-link" onClick={onAbrirEditor}>
            abrir o validador
          </button>
        </p>
      )}

      {ficha.sections.map((secao) => (
        <Secao
          key={secao.id}
          secao={secao}
          campos={ficha.fields.filter((f) => f.section === secao.id)}
          aberta={(abertas ?? [ficha.sections[0].id]).includes(secao.id)}
          alternar={() =>
            setAbertas((a) => {
              const atual = a ?? [ficha.sections[0].id]
              return atual.includes(secao.id)
                ? atual.filter((x) => x !== secao.id)
                : [...atual, secao.id]
            })
          }
          valores={valores}
          sugestoes={sugestoes}
          divergencias={divergencias}
          avisos={avisos}
          hasCage={ficha.hasCage}
          salvando={salvando}
          nomes={nomes}
          meId={meId}
          projectId={projectId}
          podeDispensar={podeDispensar}
          onSalvar={salvar}
          onDispensar={dispensar}
        />
      ))}

      <p className="bj-rodape-catalogo">
        Catálogo da ficha v{ficha.catalogVersion}. Rótulos, unidades e faixas são canônicos do
        catálogo. Mudar exige PR, e é assim que a comparação com a comunidade continua honesta.
      </p>
    </div>
  )
}

/** Converte o que veio do formulário no valor tipado que a API espera (`null` apaga). */
function converter(campo: CampoMeta, bruto: string | null): Escalar | null {
  if (bruto === null) return null
  const v = bruto.trim()
  if (!v) return null
  if (campo.type === 'boolean') return v === 'sim'
  if (campo.type === 'number') return v // a borda aceita vírgula e devolve número
  return v
}

// ---------- seção ----------

function Secao({
  secao,
  campos,
  aberta,
  alternar,
  valores,
  sugestoes,
  divergencias,
  avisos,
  hasCage,
  salvando,
  nomes,
  meId,
  projectId,
  podeDispensar,
  onSalvar,
  onDispensar,
}: {
  secao: SecaoView
  campos: CampoMeta[]
  aberta: boolean
  alternar: () => void
  valores: Map<string, ValorGuardado>
  sugestoes: Map<string, { fieldId: string; value: Escalar; origin: string }>
  divergencias: Map<string, { suggestedVsDesign?: Delta; designVsMeasured?: Delta }>
  avisos: Map<string, string>
  hasCage: boolean
  salvando: string | null
  nomes: Map<string, string>
  meId: string
  projectId: string
  podeDispensar: boolean
  onSalvar: (
    campo: CampoMeta,
    kind: Kind,
    bruto: string | null,
    source?: 'manual' | 'suggestion',
  ) => Promise<void>
  onDispensar: (sectionId: string, reason: string | null) => Promise<void>
}) {
  const [motivo, setMotivo] = useState<string | null>(null)

  return (
    <section className={secao.waived ? 'bj-ficha-secao bj-ficha-dispensada' : 'bj-ficha-secao'}>
      <header className="bj-ficha-secao-topo">
        <button
          type="button"
          className="bj-ficha-secao-btn"
          aria-expanded={aberta && !secao.waived}
          onClick={alternar}
        >
          <span className="bj-ficha-secao-nome">{secao.label}</span>
          <span className="bj-ficha-secao-num">
            {secao.progress.filled}/{secao.progress.total}
          </span>
        </button>
        <div className="bj-barra" aria-hidden="true">
          <span className="bj-barra-cheio" style={{ width: `${secao.progress.pct}%` }} />
        </div>
        {podeDispensar &&
          (secao.waived ? (
            <button
              type="button"
              className="bj-link"
              onClick={() => void onDispensar(secao.id, null)}
            >
              <IconRotateCcw size={16} /> volta a valer
            </button>
          ) : (
            <button type="button" className="bj-link" onClick={() => setMotivo('')}>
              não se aplica
            </button>
          ))}
      </header>

      {/* dispensada fica RECOLHIDA com o motivo à vista — nunca escondida (RF-5.1) */}
      {secao.waived && (
        <p className="bj-ficha-motivo">
          Não se aplica a este protótipo: {secao.waiverReason ?? 'sem motivo registrado'}. Os campos
          saíram do denominador do progresso.
        </p>
      )}

      {motivo !== null && !secao.waived && (
        <form
          className="bj-ficha-motivo-form"
          onSubmit={(e) => {
            e.preventDefault()
            void onDispensar(secao.id, motivo.trim())
            setMotivo(null)
          }}
        >
          <label>
            Por que esta seção não se aplica?
            <input
              className="bj-eq-seletor"
              maxLength={280}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: a equipe não tem aquisição de dados nesta temporada"
            />
          </label>
          <button type="submit" className="bj-btn bj-btn-sm bj-btn-primary">
            Marcar
          </button>
          <button type="button" className="bj-btn bj-btn-sm" onClick={() => setMotivo(null)}>
            Cancelar
          </button>
        </form>
      )}

      {aberta && !secao.waived && (
        <>
          <p className="bj-ficha-proposito">{secao.purpose}</p>
          <ul className="bj-ficha-campos">
            {campos.map((campo) => (
              <Campo
                key={campo.id}
                campo={campo}
                design={valores.get(chave(campo.id, 'design'))}
                measured={valores.get(chave(campo.id, 'measured'))}
                sugestao={hasCage ? sugestoes.get(campo.id) : undefined}
                divergencia={divergencias.get(campo.id)}
                avisoDesign={avisos.get(chave(campo.id, 'design'))}
                avisoMedido={avisos.get(chave(campo.id, 'measured'))}
                salvando={salvando}
                nomes={nomes}
                meId={meId}
                projectId={projectId}
                onSalvar={onSalvar}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ---------- campo ----------

function Campo({
  campo,
  design,
  measured,
  sugestao,
  divergencia,
  avisoDesign,
  avisoMedido,
  salvando,
  nomes,
  meId,
  projectId,
  onSalvar,
}: {
  campo: CampoMeta
  design?: ValorGuardado
  measured?: ValorGuardado
  sugestao?: { value: Escalar; origin: string }
  divergencia?: { suggestedVsDesign?: Delta; designVsMeasured?: Delta }
  avisoDesign?: string
  avisoMedido?: string
  salvando: string | null
  nomes: Map<string, string>
  meId: string
  projectId: string
  onSalvar: (
    campo: CampoMeta,
    kind: Kind,
    bruto: string | null,
    source?: 'manual' | 'suggestion',
  ) => Promise<void>
}) {
  const [historico, setHistorico] = useState<Revisao[] | null>(null)
  const api = useSession((s) => s.api)

  const autor = design?.updatedBy
    ? design.updatedBy === meId
      ? 'você'
      : (nomes.get(design.updatedBy) ?? 'ex-membro')
    : null

  // a linha some quando o digitado já é igual ao sugerido — nada de ruído
  const mostraSugestao = sugestao && texto(sugestao.value) !== texto(design?.value)

  const verHistorico = async () => {
    if (historico) return setHistorico(null)
    try {
      setHistorico(
        await api<Revisao[]>(
          `/api/v1/projects/${projectId}/datasheet/history?field=${encodeURIComponent(campo.id)}`,
        ),
      )
    } catch {
      setHistorico([])
    }
  }

  return (
    <li className="bj-ficha-campo">
      <div className="bj-ficha-campo-topo">
        <label className="bj-ficha-campo-nome" htmlFor={`${campo.id}-design`}>
          {campo.label}
          {campo.comparable && (
            <span className="bj-chip bj-chip-neutro" title="entra nas medianas por classe">
              comparável
            </span>
          )}
        </label>
        <button type="button" className="bj-link" onClick={() => void verHistorico()}>
          histórico
        </button>
      </div>
      <p className="bj-ficha-ajuda">{campo.help}</p>

      <div className="bj-ficha-colunas">
        <Entrada
          key={`design:${design?.updatedAt ?? 'vazio'}`}
          campo={campo}
          kind="design"
          rotulo={campo.dual ? 'projetado' : undefined}
          valor={design}
          salvando={salvando === chave(campo.id, 'design')}
          onSalvar={onSalvar}
        />
        {campo.dual && (
          <Entrada
            key={`measured:${measured?.updatedAt ?? 'vazio'}`}
            campo={campo}
            kind="measured"
            rotulo="medido"
            valor={measured}
            salvando={salvando === chave(campo.id, 'measured')}
            onSalvar={onSalvar}
          />
        )}
        {/* diferença NÃO tem cor de status: é informação, não conformidade (§3.3) */}
        {(divergencia?.suggestedVsDesign || divergencia?.designVsMeasured) && (
          <span className="bj-ficha-delta">
            {divergencia.suggestedVsDesign && (
              <span>sugerido → projetado {sinal(divergencia.suggestedVsDesign)}</span>
            )}
            {divergencia.designVsMeasured && (
              <span>projetado → medido {sinal(divergencia.designVsMeasured)}</span>
            )}
          </span>
        )}
      </div>

      {mostraSugestao && (
        <div className="bj-ficha-sugestao">
          <span>
            {sugestao!.origin}: <b>{texto(sugestao!.value)}</b>
            {campo.unit ? ` ${campo.unit}` : ''}
          </span>
          <button
            type="button"
            className="bj-btn bj-btn-sm"
            onClick={() => void onSalvar(campo, 'design', texto(sugestao!.value), 'suggestion')}
          >
            <IconCheck size={16} /> usar
          </button>
        </div>
      )}

      {[avisoDesign, avisoMedido].filter(Boolean).map((msg) => (
        <span key={msg} className="bj-chip bj-chip-warn">
          <StatusIcon role="warn" /> {msg}
        </span>
      ))}

      {design?.updatedAt && (
        <span className="bj-ficha-autoria">
          alterado {autor ? `por ${autor} ` : ''}
          {quando(design.updatedAt)}
        </span>
      )}

      {historico && (
        <ul className="bj-ficha-historico">
          {historico.length === 0 && <li>Sem histórico ainda.</li>}
          {historico.map((r, i) => (
            <li key={i}>
              <span className="bj-ficha-historico-quando">{quando(r.changedAt)}</span>
              <span>
                {r.kind === 'measured' ? 'medido: ' : ''}
                {r.oldValue === null ? 'vazio' : texto(r.oldValue)} <IconArrow size={16} />{' '}
                {r.newValue === null ? 'apagado' : texto(r.newValue)}
              </span>
              <span className="bj-ficha-historico-quem">
                {r.changedBy === meId ? 'você' : (nomes.get(r.changedBy ?? '') ?? 'ex-membro')}
                {r.source === 'suggestion' ? ' · sugestão aceita' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Entrada({
  campo,
  kind,
  rotulo,
  valor,
  salvando,
  onSalvar,
}: {
  campo: CampoMeta
  kind: Kind
  rotulo?: string
  valor?: ValorGuardado
  salvando: boolean
  onSalvar: (
    campo: CampoMeta,
    kind: Kind,
    bruto: string | null,
    source?: 'manual' | 'suggestion',
  ) => Promise<void>
}) {
  // O estado do rascunho é reiniciado por `key` no chamador (remontagem), não por
  // efeito de sincronia: é o idioma do React para "resetar estado quando o dado muda".
  const [rascunho, setRascunho] = useState(texto(valor?.value))

  const id = `${campo.id}-${kind}`
  const gravar = () => void onSalvar(campo, kind, rascunho)

  const comum = {
    id,
    className: 'bj-eq-seletor',
    disabled: salvando,
    'aria-label': rotulo ? `${campo.label}: ${rotulo}` : campo.label,
  }

  return (
    <span className="bj-ficha-entrada">
      {rotulo && <span className="bj-ficha-entrada-rotulo">{rotulo}</span>}
      {campo.type === 'enum' ? (
        <select
          {...comum}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value)
            void onSalvar(campo, kind, e.target.value)
          }}
        >
          <option value="">—</option>
          {(campo.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : campo.type === 'boolean' ? (
        <select
          {...comum}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value)
            void onSalvar(campo, kind, e.target.value)
          }}
        >
          <option value="">—</option>
          <option value="sim">sim</option>
          <option value="nao">não</option>
        </select>
      ) : campo.type === 'longtext' ? (
        <textarea
          {...comum}
          className="bj-textarea"
          maxLength={campo.maxLength}
          rows={3}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={gravar}
        />
      ) : (
        <input
          {...comum}
          type={campo.type === 'date' ? 'date' : campo.type === 'number' ? 'text' : 'text'}
          inputMode={campo.type === 'number' ? 'decimal' : undefined}
          maxLength={campo.maxLength}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={gravar}
          onKeyDown={(e) => e.key === 'Enter' && gravar()}
        />
      )}
      {/* unidade SEMPRE à direita da entrada, nunca só no rótulo: é a defesa barata
          contra o erro de unidade, que é o erro mais comum em ficha técnica (§8) */}
      {campo.unit && <span className="bj-ficha-unidade">{campo.unit}</span>}
    </span>
  )
}
