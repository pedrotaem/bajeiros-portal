import { useRef, useState } from 'react'
import { useStore } from '../store'
import { useSession } from '../session'

// Landing de chegada (estudo UX, R1): apresenta o portal e pergunta a intenção
// antes de jogar o usuário no editor. Aparece na 1ª visita (localStorage) e
// pode ser reaberta pelo "Sobre" da topbar. Toda ação fecha e marca como vista.

export const LANDING_SEEN_KEY = 'bajeiros:landing-seen'

export function Landing({ onClose }: { onClose: () => void }) {
  const user = useSession((s) => s.user)
  const setPanel = useSession((s) => s.setPanel)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importErr, setImportErr] = useState(false)

  const dismiss = () => {
    try {
      localStorage.setItem(LANDING_SEEN_KEY, '1')
    } catch {
      /* modo privado */
    }
    onClose()
  }

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then((t) => {
      try {
        useStore.getState().loadCage(JSON.parse(t))
        setImportErr(false)
        dismiss()
      } catch {
        setImportErr(true)
      }
    })
  }

  const createNew = () => {
    useStore.getState().setWizardActive(true)
    dismiss()
  }

  const explore = () => {
    // o template conforme já está carregado — aqui só damos nome ao que ele é
    dismiss()
  }

  const account = () => {
    dismiss()
    setPanel(user ? 'projects' : 'login')
  }

  return (
    <div className="landing" role="dialog" aria-label="Bem-vindo ao Bajeiros">
      <div className="landing-inner">
        <header className="landing-head">
          <span className="landing-brand">Bajeiros</span>
          <span className="landing-tag">
            o validador 3D de gaiola da comunidade Baja brasileira
          </span>
        </header>

        <p className="landing-intro">
          Monte ou importe a gaiola de proteção do seu carro e confira, em tempo real, ~40
          verificações automáticas da seção B6 do regulamento (RATBSB, emenda 7) — mais os itens de
          inspeção manual, estimativa de massa, gabaritos de junta e manequim do piloto. Gratuito,
          feito por bajeiros, para bajeiros.
        </p>

        <div className="landing-cards">
          <button className="landing-card" onClick={() => fileRef.current?.click()}>
            <b>Validar minha gaiola</b>
            <span>
              Importe o JSON exportado pelo editor e veja na hora o que passa e o que precisa de
              ajuste.
            </span>
            <i>Importar arquivo →</i>
            {importErr && <em className="landing-err">Arquivo inválido — exporte pelo editor.</em>}
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={importJson} hidden />

          <button className="landing-card" onClick={createNew}>
            <b>Criar do zero</b>
            <span>
              Assistente em 6 passos monta uma gaiola conforme desde o corta-fogo — você ajusta as
              medidas do seu projeto depois.
            </span>
            <i>Abrir assistente →</i>
          </button>

          <button className="landing-card" onClick={explore}>
            <b>Explorar um exemplo</b>
            <span>
              Abra uma gaiola de exemplo 100% conforme para entender as regras, clicar nos tubos e
              ver cada verificação explicada.
            </span>
            <i>Ver exemplo →</i>
          </button>

          <button className="landing-card" onClick={account}>
            <b>{user ? 'Meus projetos' : 'Entrar ou criar conta'}</b>
            <span>
              {user
                ? 'Abra um projeto salvo ou crie um novo — versões ficam na nuvem.'
                : 'Salve versões na nuvem, acompanhe o histórico e compartilhe projetos com a sua equipe.'}
            </span>
            <i>{user ? 'Abrir projetos →' : 'Entrar →'}</i>
          </button>
        </div>

        <p className="landing-skip">
          <button className="landing-link" onClick={explore}>
            Continuar direto para o editor
          </button>{' '}
          — sem conta funciona 100%; seus dados ficam só neste navegador até você salvar.
        </p>

        <div className="landing-legal">
          <b>Aviso legal</b>
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
      </div>
    </div>
  )
}
