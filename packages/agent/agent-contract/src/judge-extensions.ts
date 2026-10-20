import { z } from 'zod'
import {
  checkJson,
  closeCheckDomain,
  copyPlain,
  isRecord,
  jsonTextWithinBudget,
  openCheckDomain,
} from './check.ts'
import {
  POSITIONS,
  POWERS,
  type Dimension,
  type ErrorPolicy,
  type ExtensionImplementationDeclaration,
  type LoopExtensionDeclaration,
  type Position,
  type Power,
} from './extensions.ts'
import { refused, type BatchJudgment, type Judgment, type RefusalReason } from './judgment.ts'

/** ISO 8601 duration text. The text is checked, never converted to a number. */
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/

/** The positions that run before the protected state change. The other positions run after. */
const BEFORE_POSITIONS: readonly Position[] = [
  'before_compaction',
  'before_model_call',
  'before_action',
  'before_terminal',
]

/** `onError` values by power at a before position. A position after the change allows only `ignore`. */
const ERROR_POLICIES = {
  observe: ['ignore'],
  rewrite: ['ignore', 'record'],
  veto: ['ignore', 'record', 'treat_as_veto'],
} as const satisfies Record<Power, readonly ErrorPolicy[]>

const text = z.string().min(1)

const dimension = z.union([
  z.strictObject({ ending: z.enum(['complete_reply', 'failure']) }),
  z.strictObject({ scope: z.enum(['each', 'batch']) }),
])

const implementation = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), builtinName: text }),
  z.strictObject({
    kind: z.literal('command'),
    host: z.enum(['claude_code', 'codex']),
    dialect: text,
    event: text,
    command: text,
    matcher: text.optional(),
    timeout: z.string().regex(ISO_DURATION).optional(),
  }),
])

const declaration = z.strictObject({
  name: text,
  position: z.enum(POSITIONS),
  power: z.enum(POWERS),
  source: z.enum(['workspace', 'author']).optional(),
  dimension: dimension.optional(),
  needs: z.array(text).nonempty().optional(),
  implementation,
  onError: z.enum(['ignore', 'record', 'treat_as_veto']).optional(),
  unavailability: z.enum(['skip', 'veto']).optional(),
})

type Parsed = z.output<typeof declaration>

function dimensionReason(value: unknown): RefusalReason {
  if (!isRecord(value)) return 'malformed'
  if (value.position !== 'after_model_call' && value.position !== 'after_action')
    return 'dimension-not-allowed'
  if (!isRecord(value.dimension)) return 'malformed'
  if (Reflect.ownKeys(value.dimension).length === 0) return 'dimension-missing'
  return 'malformed'
}

/** A missing `implementation` has its own reason. Any other fault of it is a malformed shape. */
function implementationReason(path: readonly (string | number)[], value: unknown): RefusalReason {
  const missing = path.length === 1 && isRecord(value) && !Object.hasOwn(value, 'implementation')
  return missing ? 'implementation-missing' : 'malformed'
}

/** The reason for the first schema issue. A field that the schema names maps to its own reason. */
function issueReason(path: readonly (string | number)[], value: unknown): RefusalReason {
  switch (path[0]) {
    case 'position':
      return 'unknown-position'
    case 'power':
      return 'unknown-power'
    case 'needs':
      return 'needs-not-allowed'
    case 'onError':
      return 'error-policy-not-allowed'
    case 'unavailability':
      return 'unavailability-not-allowed'
    case 'implementation':
      return implementationReason(path, value)
    case 'dimension':
      return dimensionReason(value)
    default:
      return 'malformed'
  }
}

function dimensionRefusal(value: Parsed): RefusalReason | undefined {
  const field = value.dimension
  switch (value.position) {
    case 'after_model_call':
      return field === undefined || !('ending' in field) ? 'dimension-missing' : undefined
    case 'after_action':
      return field === undefined || !('scope' in field) ? 'dimension-missing' : undefined
    default:
      return field === undefined ? undefined : 'dimension-not-allowed'
  }
}

function needsRefusal(value: Parsed): RefusalReason | undefined {
  const needs = value.needs
  if (needs === undefined || new Set(needs).size === needs.length) return undefined
  return 'needs-not-allowed'
}

function errorPolicyRefusal(value: Parsed): RefusalReason | undefined {
  const policy = value.onError
  if (policy === undefined) return undefined
  const allowed: readonly ErrorPolicy[] = BEFORE_POSITIONS.includes(value.position)
    ? ERROR_POLICIES[value.power]
    : ['ignore']
  return allowed.includes(policy) ? undefined : 'error-policy-not-allowed'
}

function unavailabilityRefusal(value: Parsed): RefusalReason | undefined {
  if (value.unavailability !== 'veto') return undefined
  return value.power === 'veto' && BEFORE_POSITIONS.includes(value.position)
    ? undefined
    : 'unavailability-not-allowed'
}

/** The combination rules of one declaration, in the order of the declaration table. */
function combinationRefusal(value: Parsed): RefusalReason | undefined {
  if (value.source === 'workspace' && value.power !== 'observe') return 'power-above-ceiling'
  return (
    dimensionRefusal(value) ??
    needsRefusal(value) ??
    errorPolicyRefusal(value) ??
    unavailabilityRefusal(value)
  )
}

function copyDimension(field: NonNullable<Parsed['dimension']>): Dimension {
  return Object.freeze('ending' in field ? { ending: field.ending } : { scope: field.scope })
}

function copyImplementation(field: Parsed['implementation']): ExtensionImplementationDeclaration {
  if (field.kind === 'builtin')
    return Object.freeze({ kind: 'builtin', builtinName: field.builtinName })
  return Object.freeze({
    kind: 'command',
    host: field.host,
    dialect: field.dialect,
    event: field.event,
    command: field.command,
    ...(field.matcher === undefined ? {} : { matcher: field.matcher }),
    ...(field.timeout === undefined ? {} : { timeout: field.timeout }),
  })
}

/** The `needs` member of the accepted value: present only when the declaration listed names. */
function needsMember(
  needs: readonly string[] | undefined,
): Pick<LoopExtensionDeclaration, 'needs'> {
  const [first, ...rest] = needs ?? []
  return first === undefined ? {} : { needs: Object.freeze([first, ...rest]) }
}

/**
 * The accepted value: frozen plain data that shares nothing with the input. An omitted optional
 * field stays omitted, because the contract fills no default.
 */
function acceptedValue(value: Parsed): LoopExtensionDeclaration {
  return Object.freeze({
    name: value.name,
    position: value.position,
    ...(value.dimension === undefined ? {} : { dimension: copyDimension(value.dimension) }),
    power: value.power,
    ...needsMember(value.needs),
    implementation: copyImplementation(value.implementation),
    ...(value.onError === undefined ? {} : { onError: value.onError }),
    ...(value.unavailability === undefined ? {} : { unavailability: value.unavailability }),
  })
}

function shape(value: Parsed): Judgment<LoopExtensionDeclaration> {
  const reason = combinationRefusal(value)
  if (reason !== undefined) return refused(reason)
  return { kind: 'accepted', value: acceptedValue(value) }
}

async function judgeLoopExtension(
  value: unknown,
  domain?: ReturnType<typeof openCheckDomain>,
): Promise<Judgment<LoopExtensionDeclaration>> {
  const checked = await checkJson<Parsed>('agent.loop-extension', declaration, value, domain)
  switch (checked.kind) {
    case 'local-refusal':
      return refused(checked.reason)
    case 'invalid':
      return refused(issueReason(checked.issues[0].path, value))
    case 'valid':
      return shape(checked.value)
    default: {
      const unreachable: never = checked
      return unreachable
    }
  }
}

export async function judgeLoopExtensions(
  value: unknown,
): Promise<BatchJudgment<LoopExtensionDeclaration>> {
  const copied = copyPlain(value)
  if (!copied.ok) return { kind: 'refused', reason: copied.reason, index: copied.index }
  if (!Array.isArray(copied.value)) return { kind: 'refused', reason: 'malformed', index: 0 }
  if (!jsonTextWithinBudget(copied.value)) return { kind: 'refused', reason: 'malformed', index: 0 }
  const items = copied.value
  const domain = openCheckDomain()
  try {
    const accepted: LoopExtensionDeclaration[] = []
    for (let index = 0; index < items.length; index += 1) {
      const judged = await judgeLoopExtension(items[index], domain)
      if (judged.kind === 'refused') return { kind: 'refused', reason: judged.reason, index }
      accepted.push(judged.value)
    }
    return { kind: 'accepted', value: Object.freeze(accepted) }
  } finally {
    closeCheckDomain(domain)
  }
}
