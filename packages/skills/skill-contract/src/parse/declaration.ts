// Reads `.omne/skill.json` through the strict JSON reader within the caller's budget.
import type { JsonLimits } from '@omne-harness/assets'
import { readJsonBytes } from '@omne-harness/json-text'
import { isControlFile } from '../names.ts'
import type { PackagePath, SkillDeclaration } from '../values.ts'
import {
  fieldsOf,
  onlyKeys,
  readDependencies,
  readScripts,
  readSettings,
  type Findings,
} from './shape.ts'

/** The default declaration budget. A caller can give another one. */
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
  | Readonly<{ kind: 'read'; declaration: SkillDeclaration }>

const FIELDS = ['formatVersion', 'dependencies', 'scripts', 'settings']

/**
 * Reads the declaration. A format version other than the number written `1` stops every other
 * check. Other faults are added to `findings`; the declaration then holds the parts that passed.
 */
export function readDeclaration(
  bytes: Uint8Array,
  limits: JsonLimits,
  has: (path: PackagePath) => boolean,
  findings: Findings,
): DeclarationRead {
  const read = readJsonBytes(bytes, limits)
  if (read.kind !== 'ok') {
    findings.push({
      code: 'malformed',
      detail: `.omne/skill.json is not strict JSON: ${read.kind}`,
    })
    return { kind: 'read', declaration: EMPTY_DECLARATION }
  }
  const root = read.value
  if (root.kind !== 'object') {
    findings.push({ code: 'malformed', detail: '.omne/skill.json is not an object' })
    return { kind: 'read', declaration: EMPTY_DECLARATION }
  }
  const version = root.entries.find(entry => entry.key === 'formatVersion')?.value
  if (version === undefined || version.kind !== 'number' || version.lexeme !== '1')
    return { kind: 'unsupported' }
  const fields = fieldsOf(root) ?? new Map()
  onlyKeys(fields, FIELDS, '.omne/skill.json', findings)
  const scripts = readScripts(fields.get('scripts'), findings)
  for (const script of scripts)
    if (isControlFile(script.entry) || !has(script.entry))
      findings.push({
        code: 'malformed',
        detail: `script ${script.entry} is not a package resource`,
      })
  return {
    kind: 'read',
    declaration: Object.freeze({
      dependencies: Object.freeze(readDependencies(fields.get('dependencies'), findings)),
      scripts: Object.freeze(scripts),
      settings: Object.freeze(readSettings(fields.get('settings'), findings)),
    }),
  }
}
