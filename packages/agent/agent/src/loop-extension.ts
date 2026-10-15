import { z } from 'zod'
import { checkJson } from './check.ts'
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

const declaration = z.strictObject({
  name: z.string().min(1),
  position: z.enum(POSITIONS),
  power: z.enum(POWERS),
  source: z.enum(['workspace', 'author']).optional(),
  dimension: z
    .strictObject({
      ending: z.enum(['complete_reply', 'failure']).optional(),
      scope: z.enum(['each', 'batch']).optional(),
    })
    .optional(),
})

type Parsed = z.output<typeof declaration>

function issueReason(path: readonly (string | number)[]): RefusalReason {
  if (path.includes('position')) return 'unknown-position'
  if (path.includes('power')) return 'unknown-power'
  return 'malformed'
}

function shape(value: Parsed): Judgment<LoopExtensionDeclaration> {
  const allowed = value.source === 'workspace' ? (['observe'] as const) : ceiling[value.position]
  if (!allowed.includes(value.power)) return refused('power-above-ceiling')
  if (value.position === 'after_model_call') {
    if (value.dimension?.ending === undefined || value.dimension.scope !== undefined) {
      return refused(value.dimension === undefined ? 'dimension-missing' : 'dimension-not-allowed')
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
    if (value.dimension?.scope === undefined || value.dimension.ending !== undefined) {
      return refused(value.dimension === undefined ? 'dimension-missing' : 'dimension-not-allowed')
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

export async function judgeLoopExtension(value: unknown): Promise<Judgment<LoopExtensionDeclaration>> {
  const checked = await checkJson<Parsed>('agent.loop-extension', declaration, value)
  if (checked.kind === 'local-refusal') return refused(checked.reason)
  if (checked.kind !== 'valid') {
    if (checked.kind === 'invalid') return refused(issueReason(checked.issues[0].path))
    return refused('malformed')
  }
  return shape(checked.value)
}

export async function judgeLoopExtensions(
  value: unknown,
): Promise<BatchJudgment<LoopExtensionDeclaration>> {
  if (!Array.isArray(value)) return { kind: 'refused', reason: 'malformed', index: 0 }
  const accepted: LoopExtensionDeclaration[] = []
  for (let index = 0; index < value.length; index += 1) {
    const judged = await judgeLoopExtension(value[index])
    if (judged.kind === 'refused') return { kind: 'refused', reason: judged.reason, index }
    accepted.push(judged.value)
  }
  return { kind: 'accepted', value: accepted }
}
