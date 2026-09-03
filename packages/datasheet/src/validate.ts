import { fieldById, maxLengthOf } from './catalog'
import type { Field, FieldValue, ValueKind } from './types'

// Validação de borda da ficha (DF-21 E4).
//
// A regra de projeto que governa este arquivo é a RF-4.3: **uma ficha que recusa o
// número real é uma ficha abandonada.** Só recusa o que não pode estar certo (faixa
// absoluta — massa de chassi de 2 kg, disco de freio de 3 m); o que é apenas incomum
// passa com aviso, e o aviso diz para conferir a unidade, que é o erro real por trás
// da maioria dos valores estranhos.
//
// O que NUNCA gera aviso: divergência entre sugerido e digitado (RF-4.4). É informação
// esperada — é o produto da ficha, não um desvio a corrigir.

export type ValidationResult =
  { ok: true; value: FieldValue; warning?: string } | { ok: false; error: string }

function num(n: number): string {
  return String(n).replace('.', ',')
}

function ok(value: FieldValue, warning?: string): ValidationResult {
  return warning ? { ok: true, value, warning } : { ok: true, value }
}

function fail(error: string): ValidationResult {
  return { ok: false, error }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validateNumber(field: Field, raw: unknown): ValidationResult {
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN
  if (!Number.isFinite(n)) return fail(`"${field.label}" espera um número.`)
  const unidade = field.unit ? ` ${field.unit}` : ''
  const abs = field.absolute
  if (abs && (n < abs.min || n > abs.max)) {
    return fail(
      `${num(n)}${unidade} está fora do que é fisicamente possível para "${field.label}" ` +
        `(${num(abs.min)}–${num(abs.max)}${unidade}). Confira a unidade.`,
    )
  }
  const tip = field.typical
  if (tip && (n < tip.min || n > tip.max)) {
    return ok(
      n,
      `Incomum para esta categoria (típico: ${num(tip.min)}–${num(tip.max)}${unidade}); ` +
        'confira a unidade. O valor foi salvo assim mesmo.',
    )
  }
  return ok(n)
}

function validateText(field: Field, raw: unknown): ValidationResult {
  if (typeof raw !== 'string') return fail(`"${field.label}" espera texto.`)
  const v = raw.trim()
  if (!v) return fail(`"${field.label}" não aceita texto vazio. Para apagar, remova o valor.`)
  const max = maxLengthOf(field)
  if (max != null && v.length > max) {
    return fail(`"${field.label}" tem no máximo ${max} caracteres (recebidos ${v.length}).`)
  }
  if (field.type === 'link' && !/^https?:\/\/\S+$/i.test(v)) {
    return fail(`"${field.label}" espera um endereço começando em http:// ou https://.`)
  }
  return ok(v)
}

/**
 * Valida um valor contra o campo do catálogo.
 * `kind = 'measured'` só existe em campo `dual` (§3.3) — é o que impede a coluna de
 * medido de aparecer onde ela não significa nada.
 */
export function validateValue(
  field: Field,
  raw: unknown,
  kind: ValueKind = 'design',
): ValidationResult {
  if (kind === 'measured' && !field.dual) {
    return fail(`"${field.label}" não tem coluna de medido.`)
  }
  switch (field.type) {
    case 'number':
      return validateNumber(field, raw)
    case 'boolean':
      if (typeof raw !== 'boolean') return fail(`"${field.label}" espera sim ou não.`)
      return ok(raw)
    case 'enum': {
      const opcoes = field.options ?? []
      if (typeof raw !== 'string' || !opcoes.some((o) => o.id === raw)) {
        return fail(`"${field.label}" aceita apenas: ${opcoes.map((o) => o.label).join(' · ')}.`)
      }
      return ok(raw)
    }
    case 'date':
      if (typeof raw !== 'string' || !ISO_DATE.test(raw) || Number.isNaN(Date.parse(raw))) {
        return fail(`"${field.label}" espera uma data no formato AAAA-MM-DD.`)
      }
      return ok(raw)
    case 'text':
    case 'longtext':
    case 'link':
      return validateText(field, raw)
  }
}

/** Mesma validação a partir do id — devolve erro claro para campo fora do catálogo. */
export function validateFieldId(
  fieldId: string,
  raw: unknown,
  kind: ValueKind = 'design',
): ValidationResult {
  const field = fieldById(fieldId)
  if (!field) return fail(`Campo "${fieldId}" não existe no catálogo da ficha.`)
  return validateValue(field, raw, kind)
}
