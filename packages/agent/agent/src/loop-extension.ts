import { z } from 'zod'
import { checkJson, closeCheckDomain, copyPlain, openCheckDomain } from './check.ts'
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

const ceiling: Record<Position, readonly Power[]> = {
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
}

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
  if (path.includes('position')) return 'unknown-position'
  if (path.includes('power')) return 'unknown-power'
  if (path.includes('dimension') && isRecord(value)) {
    const needsDimension = value.position === 'after_model_call' || value.position === 'after_action'
    if (!needsDimension) return 'dimension-not-allowed'
    const dimension = value.dimension
    if (!isRecord(dimension) || Object.keys(dimension).length === 0) return 'dimension-missing'
    if (value.position === 'after_model_call' && !('ending' in dimension)) return 'dimension-missing'
    if (value.position === 'after_action' && !('scope' in dimension)) return 'dimension-missing'
    return 'dimension-not-allowed'
  }
  return 'malformed'
}

function shape(value: Parsed): Judgment<LoopExtensionDeclaration> {
  const allowed = value.source === 'workspace' ? (['observe'] as const) : ceiling[value.position]
  if (!allowed.includes(value.power)) return refused('power-above-ceiling')
  if (value.position === 'after_model_call') {
    if (value.dimension === undefined || !('ending' in value.dimension)) {
      return refused('dimension-missing')
    }
    return {
      kind: 'accepted',
      value: {
        name: value.name,
        position: value.position,
        power: value.power,
        dimension: { ending: value.dimension.ending },
      },
    }
  }
  if (value.position === 'after_action') {
    if (value.dimension === undefined || !('scope' in value.dimension)) {
      return refused('dimension-missing')
    }
    return {
      kind: 'accepted',
      value: {
        name: value.name,
        position: value.position,
        power: value.power,
        dimension: { scope: value.dimension.scope },
      },
    }
  }
  if (value.dimension !== undefined) return refused('dimension-not-allowed')
  return {
    kind: 'accepted',
    value: { name: value.name, position: value.position, power: value.power },
  }
}

export async function judgeLoopExtension(
  value: unknown,
  domain?: ReturnType<typeof openCheckDomain>,
): Promise<Judgment<LoopExtensionDeclaration>> {
  const checked = await checkJson<Parsed>('agent.loop-extension', declaration, value, domain)
  if (checked.kind === 'local-refusal') return refused(checked.reason)
  if (checked.kind !== 'valid') {
    if (checked.kind === 'invalid') return refused(issueReason(checked.issues[0].path, value))
    return refused('malformed')
  }
  return shape(checked.value)
}

export async function judgeLoopExtensions(
  value: unknown,
): Promise<BatchJudgment<LoopExtensionDeclaration>> {
  const copied = copyPlain(value)
  if (!copied.ok) return { kind: 'refused', reason: copied.reason, index: copied.index }
  if (!Array.isArray(copied.value)) return { kind: 'refused', reason: 'malformed', index: 0 }
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
