import { IconShield } from '../icons/glyphs'
import { useSession } from '../session'

/**
 * "Sobre o portal" como PÁGINA do shell (DF-12 E5). Chega pelo menu de conta no
 * rodapé do rail — não é item do rail, porque o glifo `info` é exclusivo de status
 * (DS §8.7/CT-3) e o inventário de 24 formas já fechou.
 *
 * A landing deslogada continua sendo a home pública; esta página é o mesmo conteúdo
 * para quem já está dentro.
 */
export function About() {
  const setPage = useSession((s) => s.setPage)

  return (
    <div className="bj-page bj-prosa">
      <p className="bj-lead">
        O Bajeiros é um projeto comunitário e independente: ferramentas feitas por quem participa de
        equipe Baja, para quem participa. O core do portal é a evolução das equipes — as ferramentas
        são meios que produzem evidência dessa evolução.
      </p>

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
            RATBSB (emenda 7) prevalece sempre.
          </li>
          <li>
            Os resultados de competição publicados na Comunidade são compilados de{' '}
            <b>fontes públicas</b>, com a origem citada em cada linha. Achou um erro? Peça a
            correção: nenhum número muda em silêncio.
          </li>
        </ul>
      </section>

      <section>
        <h2>O que já existe</h2>
        <ul className="bj-lista">
          <li>
            <b>Evolução da equipe</b> — maturidade por área, com critérios verificáveis e uma fila
            de próximos passos com dono.
          </li>
          <li>
            <b>Conhecimento</b> — diário de decisões, guias com dono e kits de passagem, contra o
            problema nº 1 das equipes: a rotatividade.
          </li>
          <li>
            <b>Validador de gaiola</b> — ~40 verificações automáticas da seção B6 em tempo real,
            massa estimada, gabaritos de junta e manequim do piloto.
          </li>
          <li>
            <b>Assistente do regulamento</b> — pergunta em português, resposta com a seção e a
            página citadas.
          </li>
          <li>
            <b>Comunidade</b> — acervo de resultados 2021–2026 e o registro das equipes do Brasil.
          </li>
        </ul>
      </section>

      <section>
        <h2>Privacidade em uma frase</h2>
        <p>
          Sem conta, o projeto fica só neste navegador. Com conta, o conteúdo registrado (decisões,
          guias, kits) é <b>da equipe</b> e permanece com ela; a autoria é anonimizada se você
          excluir a conta. Você pode exportar tudo que é seu a qualquer momento pelo Perfil.
        </p>
      </section>

      <button type="button" className="bj-btn" onClick={() => setPage('inicio')}>
        Voltar ao Início
      </button>
    </div>
  )
}
