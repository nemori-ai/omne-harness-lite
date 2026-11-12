// Reads `.omne/skill.json` through the strict JSON reader within the caller's budget.
import type { JsonLimits } from '@omne-harness/assets'
import { readJsonBytes } from '@omne-harness/json-text'
import type { SkillDeclaration } from '../values.ts'
import { fieldsOf, readDependencies, unknownKeys, type Finding } from './shape.ts'

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
})

export type DeclarationRead =
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'read'; declaration: SkillDeclaration; findings: readonly Finding[] }>

const FIELDS = ['formatVersion', 'dependencies']

function unread(detail: string): DeclarationRead {
  return { kind: 'read', declaration: EMPTY_DECLARATION, findings: [{ code: 'malformed', detail }] }
}

/**
 * Reads the declaration. A format version other than the number written `1` stops every other
 * check. The declaration holds the parts that passed; the findings name the faults.
 */
export function readDeclaration(bytes: Uint8Array, limits: JsonLimits): DeclarationRead {
  const read = readJsonBytes(bytes, limits)
  if (read.kind !== 'ok') return unread(`.omne/skill.json is not strict JSON: ${read.kind}`)
  const fields = fieldsOf(read.value)
  if (fields === undefined) return unread('.omne/skill.json is not an object')
  const version = fields.get('formatVersion')
  // `version.kind !== 'number'` only narrows the type: another kind has no lexeme, so it fails the
  // lexeme test anyway.
  if (version === undefined || version.kind !== 'number' || version.lexeme !== '1')
    return { kind: 'unsupported' }
  const dependencies = readDependencies(fields.get('dependencies'))
  return {
    kind: 'read',
    declaration: Object.freeze({ dependencies: Object.freeze(dependencies.value) }),
    findings: [...unknownKeys(fields, FIELDS, '.omne/skill.json'), ...dependencies.findings],
  }
}
