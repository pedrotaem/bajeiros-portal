import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadAppConfig } from './config'
import { initSession } from './session'
// tokens ANTES de styles.css: as custom properties têm de existir quando a primeira
// regra que as consome for avaliada (fase 0 do plano de design, passo 0.2)
import './tokens.css'
import './styles.css'

// Boot assíncrono: config por ambiente + callback OIDC ANTES do primeiro render
// (o ?code= do redirect é single-use; dentro do React o StrictMode duplicaria).
const config = await loadAppConfig()
await initSession(config)

// Galeria do design system: só em dev, por ?galeria=1. O `import.meta.env.DEV` é
// constante em build de produção, então o import dinâmico inteiro sai do bundle.
const querGaleria =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('galeria')
const Galeria = querGaleria ? (await import('./dev/Galeria')).Galeria : null

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{Galeria ? <Galeria /> : <App />}</React.StrictMode>,
)
