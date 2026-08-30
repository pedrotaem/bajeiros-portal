#!/usr/bin/env node
// Guarda de iconografia (fase 0, passo 0.8; processo do design-system §8.9).
//
// Falha em: glifo sem entrada no registro, entrada sem glifo, teto de 24 formas
// estourado, dois papéis de status no mesmo componente, doador diferente de Lucide,
// e — o mais importante — geometria com cor literal, `fill`, `opacity`, `<g>` ou
// `url()`, que quebraria o contrato do primitivo de §8.1.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, 'apps', 'web', 'src', 'icons')
const errors = []

const glyphs = readFileSync(path.join(dir, 'glyphs.tsx'), 'utf8')
const registry = readFileSync(path.join(dir, 'registry.ts'), 'utf8')
const statusIcon = readFileSync(path.join(dir, 'statusIcon.tsx'), 'utf8')

const CEILING = 24
const exported = [...glyphs.matchAll(/export const (Icon\w+)\s*=/g)].map((m) => m[1])
const registered = [...registry.matchAll(/name: '(Icon\w+)'/g)].map((m) => m[1])

for (const name of exported) {
  if (!registered.includes(name)) errors.push(`${name} desenhado mas ausente do registro`)
}
for (const name of registered) {
  if (!exported.includes(name)) errors.push(`${name} registrado mas sem geometria em glyphs.tsx`)
}
if (registered.length > CEILING) {
  errors.push(`inventário com ${registered.length} formas — o teto é ${CEILING} (§8.5)`)
}
if (new Set(registered).size !== registered.length) {
  errors.push('nome duplicado no registro')
}

// doador único: nenhuma outra origem entra (nem Tabler, nem Apache 2.0, nem CC BY)
if (!/ICON_DONOR = \{ name: 'lucide'/.test(registry)) {
  errors.push("doador precisa ser 'lucide' (§8.9, doador único)")
}

// um papel de status = um componente; nenhum glifo em dois papéis
const roles = [...statusIcon.matchAll(/^\s{2}(\w+): (Icon\w+),$/gm)].map((m) => m[2])
if (new Set(roles).size !== roles.length) {
  errors.push('o mesmo glifo aparece em dois papéis de status (§8.7 proíbe)')
}
if (roles.length !== 5) errors.push(`statusIcon precisa mapear 5 papéis, mapeia ${roles.length}`)
for (const name of roles) {
  const entry = registry.match(new RegExp(`name: '${name}'[^}]*role: '(\\w+)'`))
  if (entry && entry[1] !== 'status') {
    errors.push(`${name} é usado como status mas está registrado como '${entry[1]}'`)
  }
}

// contrato do primitivo: a geometria não carrega estilo próprio
const FORBIDDEN = [
  [/\sfill="(?!none)/, 'fill literal'],
  [/#[0-9a-fA-F]{3,8}\b/, 'cor literal'],
  [/\sopacity=/, 'opacity'],
  [/strokeDasharray|stroke-dasharray/, 'stroke-dasharray'],
  [/\sstrokeWidth=/, 'stroke-width no glifo (mora no primitivo)'],
  [/<g[\s>]/, 'grupo <g>'],
  [/url\(/, 'url()'],
]
for (const [re, what] of FORBIDDEN) {
  if (re.test(glyphs)) errors.push(`glyphs.tsx contém ${what} — proibido por §8.10`)
}

// regra de build que dois glifos dependem para existir
if (!/strokeLinecap="round"/.test(readFileSync(path.join(dir, 'Svg.tsx'), 'utf8'))) {
  errors.push(
    'Svg.tsx sem strokeLinecap="round": `M12 17h.01` e `M12 8h.01` têm comprimento ~0 e ' +
      'somem sem o cap redondo (o ponto do triangle-alert e o pingo do info)',
  )
}

if (errors.length) {
  console.error(`✖ ${errors.length} problema(s) na iconografia:`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  `✓ ${registered.length}/${CEILING} formas registradas, 5 papéis de status, doador único`,
)
