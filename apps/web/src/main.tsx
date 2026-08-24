import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { loadAppConfig } from './config'
import { initSession } from './session'
import './styles.css'

// Boot assíncrono: config por ambiente + callback OIDC ANTES do primeiro render
// (o ?code= do redirect é single-use; dentro do React o StrictMode duplicaria).
const config = await loadAppConfig()
await initSession(config)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
