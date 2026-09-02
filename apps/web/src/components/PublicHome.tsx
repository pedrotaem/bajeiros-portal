import { IconArrow, IconShield } from '../icons/glyphs'
import { MarkAssistant, MarkCage, MarkPortal } from '../icons/marks'
import { ATRITOS, MOSTRAR_ATRITOS, NUMEROS, PRATICAS } from '../data/panorama'
import { useSession } from '../session'
import { BrazilMap } from './BrazilMap'

/**
 * Vitrine — o Início de quem ainda não tem conta (DF-25).
 *
 * ONDE ELA MORA (DF-25 §5.1): dentro do shell, não fora. A landing-overlay do começo
 * foi removida pelo DF-12 com motivo escrito — quem chegava pela raiz via a
 * apresentação e nunca o produto —, e esta spec NÃO reabre a decisão. O ganho visual
 * está em faixas sangradas dentro do `bj-content`; o rail continua na tela, e daqui
 * até o validador é um clique num menu que já está visível.
 *
 * Por isso a vitrine não desenha topbar, nem wordmark de canto, nem botão "Entrar" no
 * alto: o rail já tem os três, e repetir diria duas coisas sobre onde clicar.
 *
 * A obrigação de interface do spec.md §1 é atendida duas vezes de propósito: o
 * disclaimer fixo da topbar e o bloco de aviso legal no fim.
 */
export function PublicHome() {
  const setPage = useSession((s) => s.setPage)
  const setPanel = useSession((s) => s.setPanel)

  /** Ação primária única, repetida (FR-DF25.3). Nunca um terceiro botão concorrente. */
  const criarConta = () => setPanel('login')
  const abrirValidador = () => setPage('editor')

  return (
    <div className="bj-vitrine">
      <section className="bj-faixa bj-vitrine-hero">
        <div className="bj-faixa-inner bj-hero-inner">
          <MarkPortal size={24} className="bj-hero-marca" />
          <h2 className="bj-hero-nome">Bajeiros</h2>
          <p className="bj-hero-lead">
            Ferramentas e memória da comunidade Baja brasileira. Toda geração recomeça do zero —
            essa é a parte que dá para resolver.
          </p>
          <div className="bj-hero-acoes">
            <button type="button" className="bj-btn bj-btn-primary bj-btn-lg" onClick={criarConta}>
              Criar conta <IconArrow size={16} />
            </button>
            <button type="button" className="bj-btn bj-btn-lg" onClick={abrirValidador}>
              <MarkCage size={16} /> Abrir o validador sem conta
            </button>
          </div>

          <ul className="bj-numeros">
            {NUMEROS.map((n) => (
              <li key={n.rotulo}>
                <strong>{n.valor}</strong>
                <span>{n.rotulo}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bj-faixa bj-faixa-funda">
        <div className="bj-faixa-inner">
          <header className="bj-faixa-head">
            <span className="bj-regua" />
            <h3>O Baja brasileiro, por região</h3>
            <p>Escolha uma região. Tom mais forte, mais equipes.</p>
          </header>
          <BrazilMap />
        </div>
      </section>

      <section className="bj-faixa">
        <div className="bj-faixa-inner">
          <header className="bj-faixa-head">
            <span className="bj-regua" />
            <h3>Por que o portal existe</h3>
          </header>
          <div className="bj-cards">
            <article className="bj-card bj-card-numero">
              <strong>12 de 22</strong>
              <p>membros saíram em 18 meses de observação numa equipe brasileira.</p>
              <p className="bj-fonte">Laboreal · MountainBaja / UNIFEI Itabira</p>
            </article>
            <article className="bj-card bj-card-numero">
              <strong>7 emendas</strong>
              <p>
                mais dezenas de informativos por temporada — e nenhuma versão consolidada do
                regulamento.
              </p>
              <p className="bj-fonte">RATBSB emenda 7 · A3.6.6</p>
            </article>
            <article className="bj-card bj-card-numero">
              <strong>Nenhuma</strong>
              <p>equipe campeã publica o processo interno. De fora só se vê o resultado.</p>
              <p className="bj-fonte">Pesquisa de mercado Bajeiros · 23/08/2026</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bj-faixa">
        <div className="bj-faixa-inner">
          <header className="bj-faixa-head bj-faixa-head-larga">
            <div>
              <span className="bj-regua" />
              <h3>O que a elite faz</h3>
            </div>
            <p>
              Levantado nas equipes de referência do país. Cada uma virou critério verificável, não
              conselho solto.
            </p>
          </header>
          <ul className="bj-tira">
            {PRATICAS.map((p) => (
              <li key={p.quem}>
                <strong>{p.valor}</strong>
                <p>{p.texto}</p>
                <p className="bj-tira-quem">{p.quem}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bj-faixa">
        <div className="bj-faixa-inner">
          <header className="bj-faixa-head">
            <span className="bj-regua" />
            <h3>Quatro partes</h3>
          </header>
          <div className="bj-cards bj-cards-4">
            {/* Sem ícone, que é o PADRÃO do sistema (design-system §8.4): apague o
                glifo e a linha continua igualmente rápida de varrer. Marca aqui seria
                pior que nada — ela identifica produto nomeado, e usar a do portal em
                três seções diferentes a faria significar três coisas. */}
            <article className="bj-card">
              <h4>Evolução</h4>
              <p>
                Seis áreas, níveis 1 a 5, 51 critérios. Sai uma fila de próximos passos com dono,
                não uma nota.
              </p>
            </article>
            <article className="bj-card">
              <h4>Conhecimento</h4>
              <p>
                Decisões numeradas, guias com validade e kits de passagem. O membro sai, a decisão
                fica.
              </p>
            </article>
            <article className="bj-card">
              <h4>Comunidade</h4>
              <p>
                O acervo do mapa acima, com benchmark pela mediana da sua coorte. Nunca ranking
                público.
              </p>
            </article>
            <article className="bj-card">
              <header>
                <MarkCage size={20} />
                <MarkAssistant size={20} />
                <h4>Ferramentas</h4>
              </header>
              <p>
                Validador de gaiola com ~40 verificações da seção B6, e o assistente que responde
                citando seção e página. Abrem sem conta.
              </p>
            </article>
          </div>
        </div>
      </section>

      {MOSTRAR_ATRITOS && (
        <section className="bj-faixa">
          <div className="bj-faixa-inner">
            <div className="bj-atritos">
              <div className="bj-atritos-texto">
                <span className="bj-regua" />
                <h3>Acompanhar a competição também é trabalho</h3>
                <p>
                  Não é queixa: boa parte disto é o verso de um comitê pequeno e voluntário. Mas
                  pesa mais em quem tem menos gente para monitorar.
                </p>
              </div>
              <ul className="bj-atritos-lista">
                {ATRITOS.map((a) => (
                  <li key={a.fonte}>
                    <p>{a.texto}</p>
                    <p className="bj-fonte">{a.fonte}</p>
                  </li>
                ))}
                <li className="bj-atritos-nota">
                  <p>
                    O portal não substitui esses canais nem fala pela organização — ajuda a rastrear
                    o que mudou.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="bj-faixa">
        <div className="bj-faixa-inner bj-fecho-inner">
          <div className="bj-fecho">
            {/* A marca sempre com o nome ao lado (FR-DF25.17): sozinha ela seria
                decoração, e marca não é decoração. */}
            <MarkPortal size={24} />
            <div>
              <span className="bj-fecho-marca">Bajeiros</span>
              <h3>Comece pela sua equipe</h3>
              <p>De graça, em um minuto. O validador abre sem conta.</p>
            </div>
            <button type="button" className="bj-btn bj-btn-primary bj-btn-lg" onClick={criarConta}>
              Criar conta <IconArrow size={16} />
            </button>
          </div>

          <section className="bj-aviso">
            <h3>
              <IconShield size={20} /> Aviso legal
            </h3>
            <ul>
              <li>
                Ferramenta <b>educacional</b> de apoio ao projeto — <b>não substitui</b> a Inspeção
                de Conformidade Técnica e Segurança nem o julgamento dos Juízes Credenciados de
                Segurança (B6.4).
              </li>
              <li>
                Projeto comunitário independente, <b>sem vínculo</b> com a organização da
                competição.
              </li>
              <li>
                As verificações são paráfrases interpretativas do regulamento — o texto oficial do
                RATBSB prevalece sempre.
              </li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  )
}

/**
 * Estado C-16 para os destinos que só existem com conta. Substitui o
 * redirecionamento silencioso: mandar a pessoa de volta para Ferramentas sem dizer
 * nada lê como bug — foi exatamente assim que este defeito foi relatado.
 */
export function PrecisaDeConta({ destino }: { destino: string }) {
  const setPanel = useSession((s) => s.setPanel)
  return (
    <div className="bj-page">
      <section className="bj-vazio">
        <h3>{destino} precisa de conta</h3>
        <p>
          Esta parte do portal é da sua equipe — para mostrar qualquer coisa aqui é preciso saber
          quem é você. Criar conta leva um minuto e não pede senha no ambiente de desenvolvimento.
        </p>
        <div className="bj-card-acoes">
          <button type="button" className="bj-btn bj-btn-primary" onClick={() => setPanel('login')}>
            Entrar ou criar conta <IconArrow size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}
