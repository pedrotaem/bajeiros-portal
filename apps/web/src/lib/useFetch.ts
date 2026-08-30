import { useCallback, useEffect, useState } from 'react'
import { ApiError, useSession } from '../session'

/**
 * Leitura de API com os TRÊS estados obrigatórios do design system (C-12):
 * `loading | ok | error`. Nunca existe "carregando" eterno — se falhar, a tela
 * mostra o motivo e um "tentar de novo".
 */
export type Estado = 'loading' | 'ok' | 'error'

export interface Fetched<T> {
  data: T | null
  estado: Estado
  erro: string | null
  recarregar: () => void
}

export function useFetch<T>(path: string | null, deps: unknown[] = []): Fetched<T> {
  const api = useSession((s) => s.api)
  const [data, setData] = useState<T | null>(null)
  const [estado, setEstado] = useState<Estado>(path ? 'loading' : 'ok')
  const [erro, setErro] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) {
      setData(null)
      setEstado('ok')
      return
    }
    let vivo = true
    setEstado('loading')
    setErro(null)
    api<T>(path)
      .then((r) => {
        if (!vivo) return
        setData(r)
        setEstado('ok')
      })
      .catch((e) => {
        if (!vivo) return
        setErro(mensagem(e))
        setEstado('error')
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, path, tick, ...deps])

  const recarregar = useCallback(() => setTick((t) => t + 1), [])
  return { data, estado, erro, recarregar }
}

export function mensagem(e: unknown): string {
  if (e instanceof ApiError) return e.problem.detail ?? e.problem.title
  return e instanceof Error ? e.message : 'Erro inesperado'
}

/** Horário relativo curto do feed de atividade (DF-16 RF-1.3). */
export function quando(iso: string): string {
  const t = new Date(iso)
  const min = Math.round((Date.now() - t.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.round(h / 24)
  if (dias === 1) return 'ontem'
  if (dias < 7) return t.toLocaleDateString('pt-BR', { weekday: 'short' })
  return t.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
