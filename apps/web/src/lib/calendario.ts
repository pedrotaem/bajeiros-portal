import { useEffect, useState } from 'react'
import { authHeaders } from '../session'

// Peças de navegador do calendário (DF-33). A lógica de datas, recorte e .ics é pura e
// mora em @bajeiros/calendar — aqui só o que precisa de `window`.

/** `true` quando a janela tem pelo menos `px` de largura; acompanha o redimensionar. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const [ok, setOk] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setOk(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return ok
}

/** Entrega um texto como arquivo para download (.ics de um marco, gerado no cliente). */
export function baixarTexto(conteudo: string, nome: string, mime = 'text/calendar;charset=utf-8') {
  const blob = new Blob([conteudo], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Baixa um arquivo da API. Passa pelo `fetch` (e não por `<a download>`) porque a rota
 * da equipe exige o header Authorization — o token mora só em memória.
 */
export async function baixarArquivo(url: string, nome: string): Promise<void> {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Não deu para baixar (${res.status}).`)
  baixarTexto(await res.text(), nome, res.headers.get('content-type') ?? undefined)
}

/** Encurta rótulos da linha do tempo sem cortar no meio da palavra. */
export function rotuloCurto(s: string, max = 22): string {
  if (s.length <= max) return s
  const corte = s.lastIndexOf(' ', max - 1)
  return `${s.slice(0, corte > 8 ? corte : max - 1)}…`
}
