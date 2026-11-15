import {
  judgeJsonValue,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type * as M from '@omne-harness/model-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { z } from 'zod'
import { adoptionShape, copyPlain, isRecord } from './check.ts'
import {
  POSITIONS,
  POWERS,
  type CardOption,
  type DecisionCardDraft,
  type Dimension,
  type ExtensionOutput,
  type Position,
  type Power,
} from './extensions.ts'
import { decodeActionId, type ActionId, type Adoption, type UtcInstantText } from './identity.ts'
import type { CardRequest, Subject } from './passages.ts'
import type { Judgment, OutputRefusalReason } from './judgment.ts'

type OutputKind = ExtensionOutput['kind']

type SplitPosition = 'before_model_call' | 'after_model_call' | 'after_action'
type Ending = Extract<Dimension, { ending: unknown }>['ending']
type Scope = Extract<Dimension, { scope: unknown }>['scope']

export type PositionOutputKey =
  | Exclude<Position, SplitPosition>
  | `before_model_call/${NonNullable<ExtensionOutputJudgeInput['purpose']>}`
  | `after_model_call/${Ending}`
  | `after_action/${Scope}`

export type PositionOutputs = Readonly<{
  allowed: readonly OutputKind[]
  rewritable: readonly (readonly string[])[]
}>

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

export const POSITION_OUTPUTS: Readonly<Record<PositionOutputKey, PositionOutputs>> = freezeDeep({
  execution_started: { allowed: ['observed', 'inject', 'stop', 'ask'], rewritable: [] },
  before_compaction: { allowed: ['observed', 'inject', 'veto', 'stop', 'ask'], rewritable: [] },
  after_compaction: { allowed: ['observed', 'inject', 'stop', 'ask'], rewritable: [] },
  'before_model_call/main': {
    allowed: ['observed', 'inject', 'rewrite', 'select_model', 'veto', 'stop', 'ask'],
    rewritable: [
      ['preparation', 'input', 'system'],
      ['preparation', 'input', 'messages'],
      ['preparation', 'input', 'tools'],
      ['preparation', 'input', 'toolChoice'],
      ['preparation', 'input', 'parameters'],
    ],
  },
  'before_model_call/compaction': { allowed: ['observed', 'veto', 'stop', 'ask'], rewritable: [] },
  'after_model_call/complete_reply': {
    allowed: ['observed', 'inject', 'stop', 'ask'],
    rewritable: [],
  },
  'after_model_call/failure': {
    allowed: ['observed', 'inject', 'stop', 'retry', 'ask'],
    rewritable: [],
  },
  before_action: {
    allowed: ['observed', 'inject', 'rewrite', 'veto', 'stop', 'ask'],
    rewritable: [['effectiveArguments']],
  },
  'after_action/each': {
    allowed: ['observed', 'inject', 'rewrite', 'stop', 'ask'],
    rewritable: [['candidate', 'blocks']],
  },
  'after_action/batch': { allowed: ['observed', 'inject', 'stop', 'ask'], rewritable: [] },
  before_terminal: { allowed: ['observed', 'inject', 'veto', 'stop', 'ask'], rewritable: [] },
  after_terminal: { allowed: ['observed'], rewritable: [] },
})

const POWER_OUTPUTS: Readonly<Record<Power, readonly OutputKind[]>> = {
  observe: ['observed'],
  rewrite: ['observed', 'inject', 'rewrite', 'select_model', 'retry'],
  veto: ['observed', 'inject', 'rewrite', 'select_model', 'veto', 'stop', 'retry', 'ask'],
}

export type ExtensionOutputJudgeInput = Readonly<{
  position: Position
  dimension: Dimension | null
  purpose: 'main' | 'compaction' | null
  power: Power
  trigger: 'first-content' | 'final' | null
  subject: Subject
  output: unknown
}>

type Refusal = Readonly<{ kind: 'refused'; reason: OutputRefusalReason }>
type Located = Readonly<{ kind: 'located'; row: PositionOutputKey }> | Refusal

function refuse(reason: OutputRefusalReason): Refusal {
  return { kind: 'refused', reason }
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return list.some(item => item === value)
}

function located(row: PositionOutputKey): Located {
  return { kind: 'located', row }
}

function afterModelCallRow(dimension: Dimension | null): Located {
  const ending = dimension !== null && 'ending' in dimension ? dimension.ending : undefined
  if (ending === 'complete_reply') return located('after_model_call/complete_reply')
  if (ending === 'failure') return located('after_model_call/failure')
  return refuse('dimension_missing')
}

function afterActionRow(dimension: Dimension | null): Located {
  const scope = dimension !== null && 'scope' in dimension ? dimension.scope : undefined
  if (scope === 'each') return located('after_action/each')
  if (scope === 'batch') return located('after_action/batch')
  return refuse('dimension_missing')
}

function undimensionedRow(
  position: Exclude<Position, 'after_model_call' | 'after_action'>,
  purpose: ExtensionOutputJudgeInput['purpose'],
): PositionOutputKey {
  if (position !== 'before_model_call') return position
  return purpose === 'main' ? 'before_model_call/main' : 'before_model_call/compaction'
}

function locate(input: ExtensionOutputJudgeInput): Located {
  const { position, dimension } = input
  if (!oneOf(POSITIONS, position)) return refuse('position_unknown')
  if (!oneOf(POWERS, input.power)) return refuse('power_unknown')
  switch (position) {
    case 'after_model_call':
      return afterModelCallRow(dimension)
    case 'after_action':
      return afterActionRow(dimension)
    default:
      if (dimension !== null) return refuse('dimension_not_allowed')
      return located(undimensionedRow(position, input.purpose))
  }
}

type MessageShape = Readonly<{ id: string; role: string; blocks: readonly unknown[] }>
type InjectedMessage = Extract<ExtensionOutput, { kind: 'inject' }>['message']

function isReminder(message: MessageShape): boolean {
  return message.role === 'system_reminder'
}

function asOwnerTyped<T>(value: unknown): T {
  return value as T
}

const OUTPUT_LIMITS: JsonLimits = {
  maxDepth: 64,
  maxMembers: 10_000,
  maxItems: 1_000_000,
  maxStringLength: 10_000_000,
  maxNumberLength: 100,
  maxBytes: 50_000_000,
}

const text = z.string().min(1)
const data = z.record(z.string(), z.unknown())
const jsonValue = z.custom<JsonValue>(value => 'ok' in judgeJsonValue(value))
const actionId = z.custom<ActionId>(value => 'ok' in decodeActionId(value))
// Only the verdict of `parseInstant` is used: the parsed `Instant` is a class and must not enter
// the output, which has to stay JSON data.
const utcInstantText = z.custom<UtcInstantText>(
  value => typeof value === 'string' && parseInstant(value).ok,
)

const option = z.strictObject({ id: text, label: z.string(), effect: jsonValue.optional() })

const card = z
  .strictObject({
    explanation: z.string(),
    options: z.tuple([option], option),
    about: z.strictObject({ position: z.enum(POSITIONS), action: actionId.optional() }),
    proposedRewrite: z.strictObject({ option: text, effectiveArguments: z.string() }).optional(),
  })
  .refine(draft => new Set(draft.options.map(entry => entry.id)).size === draft.options.length)
  .refine(
    draft =>
      draft.proposedRewrite === undefined ||
      draft.options.some(entry => entry.id === draft.proposedRewrite?.option),
  )

const outputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('observed') }),
  z.strictObject({
    kind: z.literal('inject'),
    message: z.strictObject({ id: z.string(), role: z.string(), blocks: z.array(z.unknown()) }),
  }),
  z.strictObject({ kind: z.literal('rewrite'), subject: data }),
  z.strictObject({ kind: z.literal('select_model'), route: text, reason: z.string().optional() }),
  z.strictObject({ kind: z.literal('veto'), reason: text }),
  z.strictObject({
    kind: z.literal('stop'),
    terminal: z.enum(['cancelled', 'failed']).optional(),
    reason: text,
  }),
  z.strictObject({
    kind: z.literal('retry'),
    plan: z.strictObject({
      supplier: data,
      notBefore: utcInstantText.nullable(),
      basis: adoptionShape,
    }),
  }),
  z.strictObject({ kind: z.literal('ask'), card }),
])

type Parsed = z.output<typeof outputSchema>

function parseOutput(value: unknown): Parsed | undefined {
  const copied = copyPlain(value, OUTPUT_LIMITS)
  if (!copied.ok) return undefined
  const parsed = outputSchema.safeParse(copied.value)
  return parsed.success ? parsed.data : undefined
}

function copyOption(entry: z.output<typeof option>): CardOption {
  return {
    id: entry.id,
    label: entry.label,
    ...(entry.effect === undefined ? {} : { effect: entry.effect }),
  }
}

function copyCard(draft: Extract<Parsed, { kind: 'ask' }>['card']): DecisionCardDraft {
  const [first, ...rest] = draft.options
  return {
    explanation: draft.explanation,
    options: [copyOption(first), ...rest.map(copyOption)],
    about: {
      position: draft.about.position,
      ...(draft.about.action === undefined ? {} : { action: draft.about.action }),
    },
    ...(draft.proposedRewrite === undefined ? {} : { proposedRewrite: draft.proposedRewrite }),
  }
}

function buildInject(parsed: Extract<Parsed, { kind: 'inject' }>): ExtensionOutput {
  return { kind: 'inject', message: asOwnerTyped<InjectedMessage>(parsed.message) }
}

function buildRewrite(parsed: Extract<Parsed, { kind: 'rewrite' }>): ExtensionOutput {
  return { kind: 'rewrite', subject: asOwnerTyped<Subject>(parsed.subject) }
}

function buildSelectModel(parsed: Extract<Parsed, { kind: 'select_model' }>): ExtensionOutput {
  return {
    kind: 'select_model',
    route: parsed.route,
    ...(parsed.reason === undefined ? {} : { reason: parsed.reason }),
  }
}

function buildStop(parsed: Extract<Parsed, { kind: 'stop' }>): ExtensionOutput {
  return {
    kind: 'stop',
    ...(parsed.terminal === undefined ? {} : { terminal: parsed.terminal }),
    reason: parsed.reason,
  }
}

function buildRetry(parsed: Extract<Parsed, { kind: 'retry' }>): ExtensionOutput {
  const { supplier, notBefore, basis } = parsed.plan
  return {
    kind: 'retry',
    plan: { supplier: asOwnerTyped<M.Supplier>(supplier), notBefore, basis },
  }
}

function build(parsed: Parsed): ExtensionOutput {
  switch (parsed.kind) {
    case 'observed':
      return { kind: 'observed' }
    case 'inject':
      return buildInject(parsed)
    case 'rewrite':
      return buildRewrite(parsed)
    case 'select_model':
      return buildSelectModel(parsed)
    case 'veto':
      return { kind: 'veto', reason: parsed.reason }
    case 'stop':
      return buildStop(parsed)
    case 'retry':
      return buildRetry(parsed)
    case 'ask':
      return { kind: 'ask', card: copyCard(parsed.card) }
    default: {
      const unreachable: never = parsed
      return unreachable
    }
  }
}

function ownValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function definedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).filter(key => record[key] !== undefined)
}

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameData(item, right[index]))
    )
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = definedKeys(left)
  return (
    keys.length === definedKeys(right).length &&
    keys.every(key => sameData(left[key], ownValue(right, key)))
  )
}

function withoutPath(value: unknown, path: readonly string[]): unknown {
  const [head, ...rest] = path
  if (head === undefined || !isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]): [string, unknown][] => {
      if (key !== head) return [[key, child]]
      return rest.length === 0 ? [] : [[key, withoutPath(child, rest)]]
    }),
  )
}

function rewriteRefusal(
  parsed: Parsed,
  row: PositionOutputKey,
  subject: Subject,
): OutputRefusalReason | undefined {
  if (parsed.kind !== 'rewrite') return undefined
  const fixed = (value: unknown): unknown =>
    POSITION_OUTPUTS[row].rewritable.reduce(withoutPath, value)
  return sameData(fixed(parsed.subject), fixed(subject)) ? undefined : 'rewrite_touches_immutable'
}

function positionRefusal(
  parsed: Parsed,
  row: PositionOutputKey,
  trigger: ExtensionOutputJudgeInput['trigger'],
): OutputRefusalReason | undefined {
  const allowed = POSITION_OUTPUTS[row].allowed
  if (parsed.kind === 'ask' && !allowed.includes('ask')) return 'ask_at_forbidden_position'
  if (!allowed.includes(parsed.kind)) return 'output_not_allowed_at_position'
  if (parsed.kind === 'retry' && trigger !== 'first-content')
    return 'output_not_allowed_at_position'
  return undefined
}

function outputRefusal(
  parsed: Parsed,
  row: PositionOutputKey,
  input: ExtensionOutputJudgeInput,
): OutputRefusalReason | undefined {
  if (parsed.kind === 'inject' && !isReminder(parsed.message)) return 'inject_source_mismatch'
  return (
    positionRefusal(parsed, row, input.trigger) ??
    (POWER_OUTPUTS[input.power].includes(parsed.kind)
      ? undefined
      : 'output_not_allowed_for_power') ??
    rewriteRefusal(parsed, row, input.subject)
  )
}

export function judgeExtensionOutput(
  input: ExtensionOutputJudgeInput,
): Judgment<ExtensionOutput, OutputRefusalReason> {
  const located = locate(input)
  if (located.kind === 'refused') return located
  const parsed = parseOutput(input.output)
  if (parsed === undefined) return refuse('malformed')
  const reason = outputRefusal(parsed, located.row, input)
  if (reason !== undefined) return refuse(reason)
  return { kind: 'accepted', value: freezeDeep(build(parsed)) }
}

export const DECISION_CARD_DRAFT_SCHEMA: Adoption = Object.freeze({
  owner: 'agent',
  name: 'decision-card-draft',
  revision: '1',
  digest: 'agent:decision-card-draft/1',
})

function treeOf(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as object)
      .filter(([, member]) => member !== undefined)
      .map(([key, member]) => ({ key, value: treeOf(member) })),
  }
}

export function cardRequestOf(identity: string, draft: DecisionCardDraft): CardRequest {
  return { identity, schema: DECISION_CARD_DRAFT_SCHEMA, value: treeOf(draft) }
}

export function cardDraftOf(request: CardRequest): DecisionCardDraft | null {
  const { owner, name, revision, digest } = DECISION_CARD_DRAFT_SCHEMA
  const { schema } = request
  if (
    schema.owner !== owner ||
    schema.name !== name ||
    schema.revision !== revision ||
    schema.digest !== digest
  )
    return null
  const parsed = card.safeParse(JSON.parse(writeJsonText(request.value)))
  return parsed.success ? copyCard(parsed.data) : null
}
