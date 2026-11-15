import type { JsonLimits } from '@omne-harness/assets'
import { readJsonBytes } from '@omne-harness/json-text'
import { isControlFile } from '../names.ts'
import type { PackagePath, SkillDeclaration } from '../values.ts'
import {
  fieldsOf,
  readDependencies,
  readScripts,
  readSettings,
  unknownKeys,
  type Finding,
} from './shape.ts'

export const DECLARATION_LIMITS: JsonLimits = Object.freeze({
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 4096,
  maxNumberLength: 32,
})

export const EMPTY_DECLARATION: SkillDeclaration = Object.freeze({
  dependencies: Object.freeze([]),
  scripts: Object.freeze([]),
  settings: Object.freeze([]),
})

export type DeclarationRead =
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'read'; declaration: SkillDeclaration; findings: readonly Finding[] }>

const FIELDS = ['formatVersion', 'dependencies', 'scripts', 'settings']

function unread(detail: string): DeclarationRead {
  return { kind: 'read', declaration: EMPTY_DECLARATION, findings: [{ code: 'malformed', detail }] }
}

export function readDeclaration(
  bytes: Uint8Array,
  limits: JsonLimits,
  has: (path: PackagePath) => boolean,
): DeclarationRead {
  const read = readJsonBytes(bytes, limits)
  if (read.kind !== 'ok') return unread(`.omne/skill.json is not strict JSON: ${read.kind}`)
  const fields = fieldsOf(read.value)
  if (fields === undefined) return unread('.omne/skill.json is not an object')
  const version = fields.get('formatVersion')
  if (version === undefined || version.kind !== 'number' || version.lexeme !== '1')
    return { kind: 'unsupported' }
  const scripts = readScripts(fields.get('scripts'), { normalized: false })
  const dependencies = readDependencies(fields.get('dependencies'))
  const settings = readSettings(fields.get('settings'))
  const missing = scripts.value
    .filter(script => isControlFile(script.entry) || !has(script.entry))
    .map((script): Finding => ({
      code: 'malformed',
      detail: `script ${script.entry} is not a package resource`,
    }))
  return {
    kind: 'read',
    declaration: Object.freeze({
      dependencies: Object.freeze(dependencies.value),
      scripts: Object.freeze(scripts.value),
      settings: Object.freeze(settings.value),
    }),
    findings: [
      ...unknownKeys(fields, FIELDS, '.omne/skill.json'),
      ...scripts.findings,
      ...missing,
      ...dependencies.findings,
      ...settings.findings,
    ],
  }
}
