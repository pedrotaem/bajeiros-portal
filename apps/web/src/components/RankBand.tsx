import { useRef, useState } from 'react'
import { formatAverage } from '@bajeiros/evolution/areas'
import { useSession } from '../session'
import { mensagem } from '../lib/useFetch'
import { IconArrow, IconCheck } from '../icons/glyphs'

/**
 * DF-18 — a patente do protótipo na tela.
 *
 * Regras que a implementação preserva, e que valem mais que o layout:
 *  - **a unidade avaliada nunca fica implícita** (§3.1): a linha do protótipo e da
 *    temporada vem ANTES do nome da patente;
 *  - **CT-3, nunca só cor**: a patente sempre vem com o número e o nome; emblema
 *    bloqueado usa dessaturação E o rótulo "faltam N critérios";
 *  - **queda não abre aviso de tela cheia** (RF-5.4): só a promoção abre. Comemorar
 *    em tela cheia e cobrar no rodapé é decisão de produto, não descuido;
 *  - **ocre segue sendo acento** (§7): a placa ocre da arte fica confinada ao
 *    emblema, que ocupa ~1% da tela.
 */

export interface RankDefView {
  n: number
  id: string
  name: string
  freeName: string
  reading: string
  emblem: string
}

export interface RankStepView {
  kind: 'maturidade' | 'competicao'
  text: string
}

export interface RankView {
  rank: RankDefView | null
  max: number
  reason: 'sem-avaliacao' | 'sem-prototipo' | null
  average: number
  floor: number
  seasonLabel: string | null
  seasonProjectId: string | null
  next:
    | (RankDefView & {
        block: string
        maturity: RankStepView[]
        competition: RankStepView | null
      })
    | null
  grace: { since: string; target: RankDefView; endsAt: string; days: number } | null
  best: RankDefView | null
  cohort: (RankDefView & { teams: number }) | null
  promotion: { from: number | null; to: number; at: string } | null
  visibility: { rankPublic: boolean; rankHistoryPublic: boolean }
  ladder: RankDefView[]
}

/**
 * RF-8.1 — o crédito da arte aparece NA TELA (rodapé da tela de patentes e do
 * cartaz). Diferente dos ícones do Lucide, que não creditam na interface: a licença
 * CC BY-NC 4.0 exige atribuição "de forma razoável", e este é o lugar razoável.
 *
 * RF-8.3 — a cláusula NC tem PRAZO: vale enquanto o portal for gratuito. Antes de
 * qualquer cobrança (marco M3), ou permissão direta dos dois autores, ou arte
 * original com a escada de nomes livres — que já vive no catálogo (`freeName`).
 */
export const ART_CREDIT =
  'Emblemas: Evgeniy Yudin (Mazok Pixels) e Misha Petrick, “MAD MAX Fury Road”, CC BY-NC 4.0.'

export function emblemSrc(def: RankDefView): string {
  return `/patentes/${def.emblem}`
}

export function RankBand({
  rank,
  teamName,
  projectName,
  onSeeNext,
}: {
  rank: RankView
  teamName: string
  projectName: string | null
  onSeeNext?: () => void
}) {
  if (rank.reason === 'sem-prototipo') {
    return (
      <section className="bj-patente bj-patente-vazia">
        <p>
          A patente é do <b>protótipo da temporada</b>. Designe um projeto para a temporada{' '}
          {rank.seasonLabel ?? 'atual'} e o emblema aparece aqui. Nenhuma área é penalizada enquanto
          isso.
        </p>
      </section>
    )
  }
  const def = rank.rank
  if (!def) return null

  return (
    <section className="bj-patente" aria-live="polite">
      {/* §3.1 — a unidade avaliada vem ANTES do nome: é o protótipo, não a equipe */}
      <p className="bj-patente-unidade">
        {projectName ?? 'Protótipo da temporada'}
        {rank.seasonLabel ? ` · temporada ${rank.seasonLabel}` : ''}
      </p>
      <div className="bj-patente-corpo">
        <img
          className="bj-emblema bj-emblema-lg"
          src={emblemSrc(def)}
          alt={`Emblema da patente ${def.n}: ${def.name}`}
          width={128}
          height={128}
        />
        <div className="bj-patente-txt">
          <h3 className="bj-patente-nome">{def.name}</h3>
          <p className="bj-patente-num">
            patente {def.n} de {rank.max}
          </p>
          <p className="bj-patente-leitura">{def.reading}</p>
          <p className="bj-patente-numeros">
            média <b>{formatAverage(rank.average)}</b> · piso <b>{rank.floor}</b>
            {rank.best && rank.best.n < def.n && <> · maior alcançada: {rank.best.name}</>}
          </p>
          {/* §7 — a mediana da coorte também vem em emblema, não só em número */}
          {rank.cohort && (
            <p className="bj-patente-coorte">
              A mediana da sua coorte é <b>{rank.cohort.name}</b> ({rank.cohort.teams} equipes com
              evolução ativa), pela maturidade.
            </p>
          )}
        </div>
        <div className="bj-patente-acoes">
          {rank.next && (
            <button type="button" className="bj-btn bj-btn-sm" onClick={onSeeNext}>
              Para chegar em {rank.next.name}
              <IconArrow size={16} />
            </button>
          )}
          <PosterButton rank={rank} teamName={teamName} />
        </div>
      </div>

      {/* §3.5 — a queda é amortecida, e a tela diz até quando dá para consertar */}
      {rank.grace && (
        <p className="bj-patente-carencia">
          Uma trava da patente {def.n} está rompida desde{' '}
          {new Date(rank.grace.since).toLocaleDateString('pt-BR')}. Você tem até{' '}
          <b>{new Date(rank.grace.endsAt).toLocaleDateString('pt-BR')}</b> para consertar. Se a
          trava voltar antes disso, o emblema nunca desce. Depois, ele passa a{' '}
          {rank.grace.target.name}.
        </p>
      )}
    </section>
  )
}

/** RF-1.5 / §7 — o painel "para chegar em …", separando as duas travas. */
export function NextRankPanel({
  rank,
  onEnqueue,
  pendingIds,
}: {
  rank: RankView
  onEnqueue?: () => void
  pendingIds: string[]
}) {
  const next = rank.next
  if (!next) {
    return (
      <section>
        <h3>Para chegar em…</h3>
        <p className="bj-vazio">
          A equipe está em {rank.rank?.name}, o topo da escada. Não há próxima patente.
        </p>
      </section>
    )
  }
  return (
    <section className="bj-proxima">
      <h3>Para chegar em {next.name}</h3>
      <div className="bj-proxima-topo">
        <img
          className="bj-emblema bj-emblema-bloqueado"
          src={emblemSrc(next)}
          alt={`Emblema bloqueado da patente ${next.n}: ${next.name}`}
          width={56}
          height={56}
        />
        {/* CT-3 — dessaturação NUNCA sozinha: o rótulo diz quantos faltam */}
        <span className="bj-chip bj-chip-neutro">
          faltam {next.maturity.length + (next.competition ? 1 : 0)} passos
        </span>
      </div>
      {next.maturity.length > 0 && (
        <>
          <p className="bj-proxima-secao">Maturidade</p>
          <ul className="bj-lista">
            {next.maturity.map((s) => (
              <li key={s.text}>{s.text}</li>
            ))}
          </ul>
        </>
      )}
      {/* a linha de competição vem SEPARADA e sem prometer que critério resolve */}
      {next.competition && (
        <>
          <p className="bj-proxima-secao">Competição oficial</p>
          <p className="bj-proxima-competicao">{next.competition.text}</p>
          {next.block === 'prova-ausente' && (
            <p className="bj-proxima-nota">
              Isto não é uma reprovação: o rol de provas muda a cada edição, e sem a prova não há
              como conferir esta trava.
            </p>
          )}
        </>
      )}
      {/*
        O §7 pede um botão "colocar os N na fila". Passo de critério é DERIVADO
        (DF-13 RF-4.1): ele já nasce na fila quando o critério fica pendente, então
        um botão que "coloca" seria um no-op com nome de ação. O botão leva até eles.
        E o número é o dos CRITÉRIOS pendentes, não o dos passos da patente — são
        coisas diferentes e misturá-las no mesmo painel confunde.
      */}
      {onEnqueue && pendingIds.length > 0 && (
        <button type="button" className="bj-btn bj-btn-sm" onClick={onEnqueue}>
          <IconCheck size={16} /> Ver os {pendingIds.length} critérios pendentes na fila
        </button>
      )}
      <p className="bj-credito-arte">{ART_CREDIT}</p>
    </section>
  )
}

/**
 * RF-5.1/5.2/5.3 — o aviso de promoção, uma vez por membro. Mostra o emblema
 * anterior e o novo, o nome, a patente e a média; as ações são baixar o cartaz, ver
 * o que falta para a próxima, e fechar.
 */
export function PromotionNotice({
  rank,
  teamName,
  onClose,
}: {
  rank: RankView
  teamName: string
  onClose: () => void
}) {
  const api = useSession((s) => s.api)
  const promo = rank.promotion
  const def = rank.rank
  if (!promo || !def) return null
  const antes = promo.from ? rank.ladder.find((r) => r.n === promo.from) : null

  const fechar = async () => {
    try {
      await api(`/api/v1/teams/${useSession.getState().activeTeamId}/rank/seen`, {
        method: 'POST',
        body: JSON.stringify({ rank: def.n }),
      })
    } catch {
      // silenciar o aviso é conveniência, não transação: falhar aqui não trava a tela
    }
    onClose()
  }

  return (
    <div className="bj-promocao" role="dialog" aria-modal="true" aria-label="Nova patente">
      <div className="bj-promocao-caixa">
        {/* a PRIMEIRA patente não é subida: é o emblema de estreia, e chamar isso de
            "subiu" seria comemorar um degrau que ninguém galgou */}
        <p className="bj-promocao-titulo">
          {antes ? `${teamName} subiu de patente` : `A primeira patente de ${teamName}`}
        </p>
        <div className="bj-promocao-emblemas">
          {antes && (
            <>
              <img
                className="bj-emblema bj-emblema-bloqueado"
                src={emblemSrc(antes)}
                alt={`Emblema anterior: ${antes.name}`}
                width={72}
                height={72}
              />
              <IconArrow size={24} />
            </>
          )}
          <img
            className="bj-emblema bj-emblema-lg"
            src={emblemSrc(def)}
            alt={`Novo emblema: ${def.name}`}
            width={144}
            height={144}
          />
        </div>
        <h2 className="bj-patente-nome">{def.name}</h2>
        <p className="bj-patente-num">
          patente {def.n} de {rank.max} · média {formatAverage(rank.average)}
        </p>
        <p className="bj-patente-leitura">{def.reading}</p>
        <div className="bj-promocao-acoes">
          <PosterButton rank={rank} teamName={teamName} />
          <button type="button" className="bj-btn" onClick={fechar}>
            Fechar
          </button>
        </div>
        <p className="bj-credito-arte">{ART_CREDIT}</p>
      </div>
    </div>
  )
}

/**
 * RF-7.1 — "Baixar o cartaz da equipe": PNG 1080×1080 gerado NO CLIENTE, com
 * emblema, nome da equipe, patente, temporada e o domínio. Sem serviço novo, sem
 * upload, sem rede (AC-DF18.13) — o emblema já está no bundle da página.
 *
 * RF-7.2 — é o único canal pelo qual a patente sai do portal sem a capitania mandar,
 * e sai por ato explícito de um membro, para o grupo da equipe.
 *
 * As cores saem dos tokens em tempo de execução (`getComputedStyle`): o canvas não
 * lê `var()`, e escrever hex aqui furaria a guarda `check-tokens`.
 */
function PosterButton({ rank, teamName }: { rank: RankView; teamName: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const ref = useRef<HTMLCanvasElement | null>(null)

  const baixar = async () => {
    const def = rank.rank
    if (!def) return
    setErro(null)
    setGerando(true)
    try {
      const blob = await desenharCartaz(ref, def, rank, teamName)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `patente-${def.n}-${def.id}-${teamName.replace(/\W+/g, '-').toLowerCase()}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(mensagem(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      <button type="button" className="bj-btn bj-btn-sm" onClick={baixar} disabled={gerando}>
        {gerando ? 'Gerando…' : 'Baixar o cartaz'}
      </button>
      <canvas ref={ref} width={1080} height={1080} hidden />
      {erro && <p className="bj-erro">{erro}</p>}
    </>
  )
}

const POSTER = 1080

async function desenharCartaz(
  ref: React.MutableRefObject<HTMLCanvasElement | null>,
  def: RankDefView,
  rank: RankView,
  teamName: string,
): Promise<Blob> {
  const canvas = ref.current
  if (!canvas) throw new Error('Cartaz indisponível nesta tela.')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador não gera o cartaz.')

  const token = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const fundo = token('--bj-bg-sunken') || 'black'
  const texto = token('--bj-fg-primary') || 'white'
  const suave = token('--bj-fg-muted') || 'gray'
  const marca = token('--bj-brand') || 'orange'
  const serif = token('--bj-font-display') || 'serif'
  const mono = token('--bj-font-mono') || 'monospace'
  const sans = token('--bj-font-sans') || 'sans-serif'

  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, POSTER, POSTER)

  const img = await carregarImagem(emblemSrc(def))
  const lado = 520
  ctx.drawImage(img, (POSTER - lado) / 2, 120, lado, lado)

  ctx.textAlign = 'center'
  ctx.fillStyle = marca
  ctx.font = `700 76px ${serif}`
  ctx.fillText(def.name, POSTER / 2, 760, POSTER - 120)

  ctx.fillStyle = texto
  ctx.font = `500 34px ${mono}`
  ctx.fillText(`PATENTE ${def.n} DE ${rank.max}`, POSTER / 2, 818)

  ctx.font = `600 44px ${sans}`
  ctx.fillText(teamName, POSTER / 2, 890, POSTER - 120)

  ctx.fillStyle = suave
  ctx.font = `400 30px ${sans}`
  const linha = rank.seasonLabel ? `Protótipo da temporada ${rank.seasonLabel}` : 'Protótipo'
  ctx.fillText(linha, POSTER / 2, 938)
  ctx.fillText('bajeiros.com.br', POSTER / 2, 984)

  // RF-7.3 — o crédito da arte acompanha o cartaz, em texto pequeno no rodapé
  ctx.font = `400 20px ${sans}`
  ctx.fillText(ART_CREDIT, POSTER / 2, 1032, POSTER - 60)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Não deu para gerar a imagem do cartaz.'))),
      'image/png',
    ),
  )
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('O emblema não carregou; recarregue a página.'))
    img.src = src
  })
}
