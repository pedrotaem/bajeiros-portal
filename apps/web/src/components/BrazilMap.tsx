import { useMemo, useState } from 'react'
import { MAPA_VIEWBOX, UFS } from '../data/brasil-uf'
import {
  BRASIL,
  FONTE_PANORAMA,
  NOME_COORTE,
  REGIOES,
  equipesDaUf,
  opacidadeDe,
  selecao,
  type RegiaoId,
} from '../data/panorama'

/**
 * Panorama do Brasil por região (DF-25 §4.2), sobre as fronteiras estaduais reais.
 *
 * O QUE O DESENHO DIZ, em duas leituras sobrepostas:
 *  - **estado** é a forma e o tom: cada UF é pintada pela quantidade de equipes dela,
 *    e as 9 sem equipe ficam num neutro próprio — "nenhuma" não é o degrau mais baixo
 *    de uma escala, é outra categoria;
 *  - **região** é o recorte: passar o ponteiro ou selecionar acende as UFs da região
 *    inteira, e o rótulo grande é o da região, porque é ela que o painel detalha.
 *
 * ACESSIBILIDADE (FR-DF25.12 / §8.2): quem comanda são os BOTÕES da fileira — eles
 * têm foco, rótulo e `aria-pressed`. O `<svg>` é `role="img"` com rótulo que resume o
 * que ele mostra, e clicar num estado é atalho de ponteiro, não a única porta. Cada UF
 * tem `<title>` (dica nativa do navegador, sem JS). O painel é `aria-live="polite"`.
 */
export function BrazilMap() {
  const [ativa, setAtiva] = useState<RegiaoId | 'BR'>('BR')
  const sel = selecao(ativa)

  // Barra proporcional ao total DA SELEÇÃO (não ao do Brasil): a leitura é "como esta
  // região se divide", não "quanto ela pesa no país" — esse número já é o total.
  const fatia = (n: number) => (sel.total > 0 ? `${Math.round((n / sel.total) * 100)}%` : '0%')

  // Âncora do rótulo de região = média dos centroides das UFs dela. Derivada, como a
  // rampa: trocar a malha não deixa cinco coordenadas para alguém lembrar de mexer.
  const rotulos = useMemo(
    () =>
      REGIOES.map((r) => {
        const suas = UFS.filter((u) => u.regiao === r.id)
        return {
          id: r.id,
          nome: r.nome,
          total: r.total,
          x: suas.reduce((s, u) => s + u.centro[0], 0) / suas.length,
          y: suas.reduce((s, u) => s + u.centro[1], 0) / suas.length,
        }
      }),
    [],
  )

  const opcoes: { id: RegiaoId | 'BR'; nome: string }[] = [
    { id: 'BR', nome: BRASIL.nome },
    ...REGIOES.map((r) => ({ id: r.id, nome: r.nome })),
  ]

  return (
    <div className="bj-panorama">
      <div className="bj-panorama-mapa">
        <svg
          viewBox={MAPA_VIEWBOX}
          className="bj-mapa"
          role="img"
          aria-label={
            'Mapa do Brasil com as fronteiras dos 27 estados, pintado pelo número de ' +
            'equipes Baja mapeadas em cada um. Por região: ' +
            REGIOES.map((r) => `${r.nome} ${r.total}`).join(', ') +
            '. Use os botões abaixo para escolher uma região.'
          }
        >
          {UFS.map((u) => {
            const n = equipesDaUf(u.sigla)
            const naSelecao = ativa === u.regiao
            return (
              <path
                key={u.sigla}
                d={u.d}
                className={
                  'bj-uf' +
                  (n === 0 ? ' bj-uf-vazia' : '') +
                  (naSelecao ? ' bj-uf-selecionada' : '')
                }
                style={n > 0 ? { fillOpacity: opacidadeDe(n) } : undefined}
                onClick={() => setAtiva(u.regiao)}
              >
                <title>
                  {u.nome} — {n === 0 ? 'nenhuma equipe mapeada' : `${n} equipe${n > 1 ? 's' : ''}`}
                </title>
              </path>
            )
          })}

          {/* Rótulos por último e com halo (`paint-order`): eles cruzam fronteira e
              tom, e sem o halo some quem cai sobre um estado claro. */}
          {rotulos.map((r) => (
            <g key={r.id} className="bj-mapa-rotulo" aria-hidden="true">
              <text x={r.x} y={r.y} className="bj-mapa-sigla">
                {r.nome.toUpperCase()}
              </text>
              <text x={r.x} y={r.y + 26} className="bj-mapa-num">
                {r.total}
              </text>
            </g>
          ))}
        </svg>

        <div className="bj-panorama-chips">
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              className={ativa === o.id ? 'bj-chip-btn bj-chip-btn-on' : 'bj-chip-btn'}
              aria-pressed={ativa === o.id}
              onClick={() => setAtiva(o.id)}
            >
              {o.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="bj-panorama-painel" aria-live="polite">
        <div className="bj-painel-topo">
          <div className="bj-painel-nome">
            <span className="bj-painel-rotulo">{sel.rotulo}</span>
            <h4>{sel.nome}</h4>
          </div>
          <p className="bj-painel-total">
            <strong>{sel.total}</strong>
            <span>equipes</span>
          </p>
        </div>

        <dl className="bj-coortes">
          {(
            [
              ['alta', sel.alta],
              ['intermediaria', sel.intermediaria],
              ['iniciante', sel.iniciante],
            ] as const
          ).map(([c, n]) => (
            <div key={c} className={`bj-coorte bj-coorte-${c}`}>
              <dt>{NOME_COORTE[c]}</dt>
              <dd>{n}</dd>
              <div className="bj-coorte-trilho">
                <div className="bj-coorte-barra" style={{ width: fatia(n) }} />
              </div>
            </div>
          ))}
        </dl>

        <div className="bj-painel-metas">
          <p>
            <strong>{sel.ufs}</strong>
            <span>{sel.ufs === 1 ? 'estado' : 'estados'}</span>
          </p>
          <p>
            <strong>{sel.nacional}</strong>
            <span>no Nacional 2026</span>
          </p>
        </div>

        <p className="bj-painel-nota">{sel.nota}</p>
        <p className="bj-painel-fonte">{FONTE_PANORAMA}</p>
      </div>
    </div>
  )
}
