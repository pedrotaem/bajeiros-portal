import { useSession } from '../session'

// Página inicial do portal (estudo UX, R1 v2): TODO acesso à raiz cai aqui —
// apresentação, aviso legal e as duas portas: editor/validador e conta.
// Link de convite (#convite=) pula direto p/ o login; "Sobre o portal" reabre.

function IconCage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 17V9.5L9 4h6l5 5.5V17" />
      <path d="M4 17h16" />
      <path d="M9 4v13M15 4v13" />
      <path d="M4 9.5h16" />
      <path d="M4 9.5 15 17M20 9.5 9 17" opacity=".55" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.4-3.6 4.4-5.4 7.5-5.4s6.1 1.8 7.5 5.4" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3l7 2.8v5.4c0 4.8-2.9 7.8-7 9.8-4.1-2-7-5-7-9.8V5.8z" />
      <path d="M12 8v4.5M12 15.5v.01" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 5.5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  )
}

export function Landing({ onClose }: { onClose: () => void }) {
  const user = useSession((s) => s.user)
  const setPanel = useSession((s) => s.setPanel)
  const setPage = useSession((s) => s.setPage)

  const openEditor = () => {
    setPage('editor')
    onClose()
  }

  const openAssistant = () => {
    setPage('assistant') // anônimo pode (2 perguntas/dia)
    onClose()
  }

  const account = () => {
    onClose()
    setPanel(user ? 'projects' : 'login')
  }

  return (
    <div className="landing" role="dialog" aria-label="Bajeiros — portal">
      <div className="landing-topbar">
        <span className="landing-logo">Bajeiros</span>
        <button className="landing-account" onClick={account}>
          <IconUser />
          {user ? `${user.displayName} · Meus projetos` : 'Entrar ou criar conta'}
        </button>
      </div>

      <div className="landing-inner">
        <header className="landing-head">
          <h1 className="landing-brand">Bajeiros</h1>
          <p className="landing-tag">ferramentas da comunidade Baja brasileira</p>
        </header>

        <p className="landing-intro">
          Tire dúvidas do regulamento (RATBSB, emenda 7) em linguagem natural com o Assistente de
          Regras e valide a gaiola de proteção do seu carro no editor 3D — ~40 verificações
          automáticas da seção B6 em tempo real, mais itens de inspeção manual, estimativa de massa,
          gabaritos de junta e manequim do piloto. Gratuito, feito por bajeiros, para bajeiros.
        </p>

        <div className="landing-legal">
          <b>
            <IconShield /> Aviso legal
          </b>
          <ul>
            <li>
              Ferramenta <b>educacional</b> de apoio ao projeto — <b>não substitui</b> a Inspeção de
              Conformidade Técnica e Segurança nem o julgamento dos Juízes Credenciados de Segurança
              (B6.4).
            </li>
            <li>
              Projeto comunitário independente, <b>sem vínculo com a SAE</b> ou com organizadores de
              competição.
            </li>
            <li>
              As verificações são paráfrases interpretativas do regulamento — o texto oficial do
              RATBSB prevalece sempre.
            </li>
          </ul>
        </div>

        <button className="landing-cta" onClick={openAssistant}>
          <span className="landing-cta-icon">
            <IconChat />
          </span>
          <span className="landing-cta-text">
            <b>Assistente de Regras (IA)</b>
            <span>
              Pergunte em linguagem natural sobre o regulamento completo — não só B6. Respostas
              citam seção e página do PDF oficial.
              {!user && ' Experimente sem conta (2 perguntas/dia).'}
            </span>
          </span>
          <span className="landing-cta-arrow" aria-hidden>
            →
          </span>
        </button>

        <button className="landing-cta" onClick={openEditor}>
          <span className="landing-cta-icon">
            <IconCage />
          </span>
          <span className="landing-cta-text">
            <b>Editor / Validador de Gaiola</b>
            <span>
              Importe, crie do zero com o assistente ou explore o exemplo conforme — o checklist B6
              responde a cada mudança.
            </span>
          </span>
          <span className="landing-cta-arrow" aria-hidden>
            →
          </span>
        </button>

        <p className="landing-skip">
          Sem conta funciona 100% — seus dados ficam só neste navegador até você salvar na nuvem.
        </p>
      </div>
    </div>
  )
}
