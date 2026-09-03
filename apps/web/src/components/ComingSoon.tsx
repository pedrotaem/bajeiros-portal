import { useEffect } from 'react'
import { track, useSession } from '../session'
import { DISCLAIMER } from './Shell'
import { SessionPanels } from './SessionPanels'

/**
 * Cortina "Em breve" (DF-27) — a única página que produção mostra antes do lançamento.
 *
 * Ela SUBSTITUI o portal, não o cobre: quem renderiza esta tela não montou `Shell`,
 * vitrine nem editor (DF-27 FR-DF27.5). É isso que faz a cortina esconder de fato —
 * sobrepor deixaria o conteúdo no DOM, a um inspetor de distância.
 *
 * A porta continua aberta (FR-DF27.6): o botão leva ao MESMO painel de login do portal,
 * com Cognito e Google conforme o ambiente. Quem entra e não é administrador fica aqui,
 * com a conta já criada — é o estado esperado, não um erro.
 */
export function ComingSoon() {
  const user = useSession((s) => s.user)
  const setPanel = useSession((s) => s.setPanel)
  const logout = useSession((s) => s.logout)

  // anônimo não é rastreado (DF-9) — e é ele quem mais chega nesta tela
  useEffect(() => {
    if (user) track('page:em-breve')
  }, [user])

  return (
    <div className="bj-cortina">
      <SessionPanels />
      <main className="bj-cortina-inner">
        {/* decorativa: o nome está no <h1> logo abaixo (mesma decisão da vitrine) */}
        <span className="bj-logo bj-cortina-logo" aria-hidden="true" />
        <h1 className="bj-cortina-titulo">Em breve</h1>
        <p className="bj-cortina-lead">
          Ferramentas e memória da comunidade Baja brasileira. Estamos afinando os últimos detalhes.
          O portal abre em breve.
        </p>

        {user ? (
          <div className="bj-cortina-conta">
            <p>Sua conta está pronta, {user.displayName}. Avisamos assim que abrirmos.</p>
            <button type="button" className="bj-btn" onClick={logout}>
              Sair
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="bj-btn bj-btn-primary bj-btn-lg"
            onClick={() => setPanel('login')}
          >
            Entrar
          </button>
        )}
      </main>

      {/* obrigação de interface do spec.md §1: enquanto a cortina é a única página
          visível, é nela que o aviso mora (DF-27 FR-DF27.10) */}
      <footer className="bj-cortina-rodape">
        <p>{DISCLAIMER}</p>
      </footer>
    </div>
  )
}
