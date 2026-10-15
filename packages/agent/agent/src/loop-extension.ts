import { z } from 'zod'
import { checkJson, closeCheckDomain, copyPlain, jsonTextWithinBudget, openCheckDomain } from './check.ts'
import {
  POSITIONS,
  POWERS,
  refused,
  type BatchJudgment,
  type Judgment,
  type LoopExtensionDeclaration,
  type Position,
  type Power,
  type RefusalReason,
} from './types.ts'

const ceiling = {
  attempt_started: ['observe', 'rewrite'],
  before_persist_message: ['observe', 'rewrite', 'veto'],
  after_persist_message: ['observe', 'rewrite'],
  before_compaction: ['observe', 'rewrite', 'veto'],
  after_compaction: ['observe', 'rewrite'],
  before_model_call: ['observe', 'rewrite', 'veto'],
  after_model_call: ['observe', 'rewrite'],
  before_action: ['observe', 'rewrite', 'veto'],
  after_action: ['observe', 'rewrite'],
  before_terminal: ['observe', 'rewrite', 'veto'],
  after_terminal: ['observe'],
} as const satisfies Record<Position, readonly Power[]>

const dimension = z.union([
  z.strictObject({ ending: z.enum(['complete_reply', 'failure']) }),
  z.strictObject({ scope: z.enum(['each', 'batch']) }),
])

const declaration = z.strictObject({
  name: z.string().min(1),
  position: z.enum(POSITIONS),
  power: z.enum(POWERS),
  source: z.enum(['workspace', 'author']).optional(),
  dimension: dimension.optional(),
})

type Parsed = z.output<typeof declaration>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issueReason(path: readonly (string | number)[], value: unknown): RefusalReason {
  if (path[0] === 'position') return 'unknown-position'
  if (path[0] === 'power') return 'unknown-power'
  if (!path.includes('dimension') || !isRecord(value)) return 'malformed'
  if (value.position !== 'after_model_call' && value.position !== 'after_action') return 'dimension-not-allowed'
  if (!isRecord(value.dimension)) return 'malformed'
  if (Reflect.ownKeys(value.dimension).length === 0) return 'dimension-missing'
  return 'malformed'
}

function allows<const Allowed extends readonly Power[]>(allowed: Allowed, power: Power): power is Allowed[number] {
  for (const candidate of allowed) {
    if (candidate === power) return true
  }
  return false
}

function withinCeiling<const Allowed extends readonly Power[]>(
  allowed: Allowed,
  power: Power,
  source: Parsed['source'],
): power is Allowed[number] {
  if (!allows(allowed, power)) return false
  return source !== 'workspace' || power === 'observe'
}

function shape(value: Parsed): Judgment<LoopExtensionDeclaration> {
  switch (value.position) {
    case 'after_model_call': {
      const power = value.power
      if (!withinCeiling(ceiling.after_model_call, power, value.source)) return refused('power-above-ceiling')
      const field = value.dimension
      if (field === undefined || !('ending' in field)) return refused('dimension-missing')
      return {
        kind: 'accepted',
        value: {
          name: value.name,
          position: value.position,
          power,
          dimension: { ending: field.ending },
        },
      }
    }
    case 'after_action': {
      const power = value.power
      if (!withinCeiling(ceiling.after_action, power, value.source)) return refused('power-above-ceiling')
      const field = value.dimension
      if (field === undefined || !('scope' in field)) return refused('dimension-missing')
      return {
        kind: 'accepted',
        value: {
          name: value.name,
          position: value.position,
          power,
          dimension: { scope: field.scope },
        },
      }
    }
    case 'after_terminal': {
      const power = value.power
      if (!withinCeiling(ceiling.after_terminal, power, value.source)) return refused('power-above-ceiling')
      if (value.dimension !== undefined) return refused('dimension-not-allowed')
      return { kind: 'accepted', value: { name: value.name, position: value.position, power } }
    }
    case 'attempt_started':
    case 'after_persist_message':
    case 'after_compaction': {
      const power = value.power
      if (!withinCeiling(ceiling[value.position], power, value.source)) return refused('power-above-ceiling')
      if (value.dimension !== undefined) return refused('dimension-not-allowed')
      return { kind: 'accepted', value: { name: value.name, position: value.position, power } }
    }
    case 'before_persist_message':
    case 'before_compaction':
    case 'before_model_call':
    case 'before_action':
    case 'before_terminal': {
      const power = value.power
      if (!withinCeiling(ceiling[value.position], power, value.source)) return refused('power-above-ceiling')
      if (value.dimension !== undefined) return refused('dimension-not-allowed')
      return { kind: 'accepted', value: { name: value.name, position: value.position, power } }
    }
    default: {
      const unreachable: never = value.position
      return unreachable
    }
  }
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
    return { kind: 'accepted', value: accepted }
  } finally {
    closeCheckDomain(domain)
  }
}
