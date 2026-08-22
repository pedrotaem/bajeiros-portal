// Valida os contratos ODCS de contracts/*.odcs.yaml:
// estrutura mínima + convenção LGPD (pii => legalBasis + retention). Ver contracts/README.md.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const dir = new URL('../contracts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const files = readdirSync(dir).filter((f) => f.endsWith('.odcs.yaml'))
const errors = []

const SEMVER = /^\d+\.\d+\.\d+$/
const REQUIRED_TOP = ['apiVersion', 'kind', 'id', 'name', 'version', 'status', 'schema']
const LEGAL_BASES = ['contrato-art7-V', 'obrigacao-legal', 'consentimento', 'legitimo-interesse']

for (const file of files) {
  const doc = parse(readFileSync(join(dir, file), 'utf8'))
  const err = (msg) => errors.push(`${file}: ${msg}`)

  for (const key of REQUIRED_TOP) if (doc[key] == null) err(`falta campo obrigatório '${key}'`)
  if (doc.kind !== 'DataContract') err(`kind deve ser 'DataContract' (é '${doc.kind}')`)
  if (doc.apiVersion && !String(doc.apiVersion).startsWith('v3.')) {
    err(`apiVersion deve ser ODCS v3.x (é '${doc.apiVersion}')`)
  }
  if (doc.version && !SEMVER.test(doc.version)) err(`version '${doc.version}' não é semver`)

  for (const obj of doc.schema ?? []) {
    for (const prop of obj.properties ?? []) {
      const where = `${obj.name}.${prop.name}`
      if (prop.classification === 'pii') {
        const custom = Object.fromEntries(
          (prop.customProperties ?? []).map((c) => [c.property, c.value]),
        )
        if (!custom.legalBasis) err(`${where}: pii sem customProperties.legalBasis`)
        else if (!LEGAL_BASES.includes(custom.legalBasis)) {
          err(`${where}: legalBasis '${custom.legalBasis}' fora do vocabulário ${LEGAL_BASES}`)
        }
        if (!custom.retention) err(`${where}: pii sem customProperties.retention`)
      }
    }
  }
}

if (errors.length) {
  console.error(`✖ ${errors.length} problema(s) nos contratos:`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`✓ ${files.length} contrato(s) ODCS válidos (estrutura + convenção LGPD)`)
