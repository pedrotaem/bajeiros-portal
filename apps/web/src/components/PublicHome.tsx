import {
  IconArrow,
  IconMessage,
  IconShield,
  IconTrophy,
  IconUsers,
  IconWrench,
} from '../icons/glyphs'
import { useSession } from '../session'

/**
 * Início de quem ainda não tem conta. É a **home pública** do portal — o papel que
 * a landing separada exercia até aqui.
 *
 * Por que deixou de ser uma tela à parte: a landing era um overlay fora do shell, e
 * quem chegava pela raiz nunca via o produto — via a apresentação e mais nada. Agora
 * a apresentação mora DENTRO do shell, com o rail visível: dá para olhar as
 * ferramentas, entrar no validador e criar conta sem trocar de mundo.
 *
 * A obrigação de interface do spec.md §1 continua atendida em dois lugares: o
 * disclaimer permanente da topbar e o bloco de aviso legal abaixo.
 */
export function PublicHome() {
  const setPage = useSession((s) => s.setPage)
  const setPanel = useSession((s) => s.setPanel)

  return (
    <div className="bj-page bj-inicio">
      <header className="bj-inicio-saudacao">
        <h2>Ferramentas da comunidade Baja brasileira</h2>
        <p>
          O portal existe para a <b>evolução das equipes</b>: maturidade por área com critérios
          verificáveis, o conhecimento que não se perde na virada de geração, e o acervo de
          resultados do Brasil. As ferramentas — validador de gaiola e assistente do regulamento —
          são os meios que produzem essa evidência.
        </p>
        <div className="bj-card-acoes">
          <button type="button" className="bj-btn bj-btn-primary" onClick={() => setPanel('login')}>
            Entrar ou criar conta <IconArrow size={16} />
          </button>
          <button type="button" className="bj-btn" onClick={() => setPage('sobre')}>
            Sobre o portal
          </button>
        </div>
      </header>

      <div className="bj-cards">
        <article className="bj-card">
          <header>
            <IconWrench size={20} />
            <h3>Validador de gaiola</h3>
          </header>
          <p>
            ~40 verificações automáticas da seção B6 em tempo real, itens de inspeção presencial,
            massa estimada, gabaritos de junta e manequim do piloto.
          </p>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn" onClick={() => setPage('editor')}>
              Abrir sem conta <IconArrow size={16} />
            </button>
          </div>
        </article>

        <article className="bj-card">
          <header>
            <IconMessage size={20} />
            <h3>Assistente do regulamento</h3>
          </header>
          <p>
            Pergunte em português sobre o regulamento completo (RATBSB, emenda 7) — a resposta cita
            seção e página do documento oficial.
          </p>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn" onClick={() => setPage('assistant')}>
              Experimentar (2 por dia) <IconArrow size={16} />
            </button>
          </div>
        </article>

        <article className="bj-card">
          <header>
            <IconUsers size={20} />
            <h3>Evolução e conhecimento da equipe</h3>
          </header>
          <p>
            Maturidade por área com critérios verificáveis, fila de próximos passos com dono, diário
            de decisões, guias e kits de passagem. Precisa de conta e de equipe.
          </p>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn" onClick={() => setPanel('login')}>
              Criar conta
            </button>
          </div>
        </article>

        <article className="bj-card">
          <header>
            <IconTrophy size={20} />
            <h3>Comunidade</h3>
          </header>
          <p>
            Acervo de resultados das competições de 2021 a 2026 e o registro das equipes do Brasil,
            compilados de fontes públicas com a origem citada por linha.
          </p>
          <div className="bj-card-acoes">
            <button type="button" className="bj-btn" onClick={() => setPanel('login')}>
              Criar conta
            </button>
          </div>
        </article>
      </div>

      <section className="bj-aviso">
        <h2>
          <IconShield size={20} /> Aviso legal
        </h2>
        <ul>
          <li>
            Ferramenta <b>educacional</b> de apoio ao projeto — <b>não substitui</b> a Inspeção de
            Conformidade Técnica e Segurança nem o julgamento dos Juízes Credenciados de Segurança
            (B6.4).
          </li>
          <li>
            Projeto comunitário independente, <b>sem vínculo</b> com a organização da competição.
          </li>
          <li>
            As verificações são paráfrases interpretativas do regulamento — o texto oficial do
            RATBSB prevalece sempre.
          </li>
        </ul>
      </section>

      <p className="bj-rodape-catalogo">
        Sem conta funciona: o projeto fica só neste navegador até você salvar na nuvem.
      </p>
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
