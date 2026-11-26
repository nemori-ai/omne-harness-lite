import type { GoalStateView, GoalView } from '@omne-harness/goal-protocol'
import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'

const LIMITS: JsonLimits = {
  maxBytes: 1_000_000,
  maxDepth: 32,
  maxItems: 10_000,
  maxMembers: 1_000,
  maxStringLength: 100_000,
  maxNumberLength: 64,
}

export function treeOf(value: unknown): JsonValue | undefined {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}
const plainOf = (value: JsonValue): unknown => JSON.parse(writeJsonText(value))

type Fields = Readonly<Record<string, unknown>>
export type Entry = Fields & Readonly<{ id: string }>
export type Limit = Readonly<{ amount: number; unit: string }>
const SECTIONS = ['criteria', 'metrics', 'rules', 'exits'] as const
export const SECTION_WORDS: Readonly<Record<(typeof SECTIONS)[number], string>> = {
  criteria: '达成',
  metrics: '指标',
  rules: '守则',
  exits: '退出',
}

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const entriesOf = (value: unknown): readonly Entry[] =>
  Array.isArray(value)
    ? value.filter((one): one is Entry => isFields(one) && typeof one['id'] === 'string')
    : []
export const limitsOf = (entry: Entry): readonly Limit[] =>
  Array.isArray(entry['limits'])
    ? entry['limits'].filter(
        (one): one is Limit => isFields(one) && typeof one['amount'] === 'number',
      )
    : []

export type Body = Readonly<{
  purpose: string
  sections: readonly Readonly<{ name: (typeof SECTIONS)[number]; entries: readonly Entry[] }>[]
}>

/** The body of a goal as the panel edits it: its purpose and its numbered entries by section. Parts the panel does not know are left out of the form, never out of the goal. */
export function bodyOf(goal: GoalView): Body {
  const plain = plainOf(goal.body)
  const fields = isFields(plain) ? plain : {}
  return {
    purpose: typeof fields['purpose'] === 'string' ? fields['purpose'] : '',
    sections: SECTIONS.map(name => ({ name, entries: entriesOf(fields[name]) })),
  }
}

export type Edits = Readonly<{
  purpose: string
  statements: Readonly<Record<string, string>>
  amounts: Readonly<Record<string, string>>
}>
export const amountKey = (entry: string, index: number): string => `${entry}/${String(index)}`

export function editsOf(body: Body): Edits {
  const entries = body.sections.flatMap(section => section.entries)
  const stated = entries.filter(entry => typeof entry['statement'] === 'string')
  return {
    purpose: body.purpose,
    statements: Object.fromEntries(stated.map(entry => [entry.id, entry['statement'] as string])),
    amounts: Object.fromEntries(
      entries.flatMap(entry =>
        limitsOf(entry).map((limit, index) => [amountKey(entry.id, index), String(limit.amount)]),
      ),
    ),
  }
}

export type Changes =
  | Readonly<{ kind: 'changes'; changes: readonly unknown[] }>
  | Readonly<{ kind: 'problem'; problem: string }>

const AMOUNT = /^[1-9]\d*$/u

/** The limits of an entry as the form has them: `bad` when one is not a positive whole number, `same` when none moved. */
function editedLimits(entry: Entry, edits: Edits): readonly Limit[] | 'bad' | 'same' {
  const before = limitsOf(entry)
  const texts = before.map((_limit, index) => edits.amounts[amountKey(entry.id, index)]?.trim())
  if (texts.some(text => text !== undefined && !AMOUNT.test(text))) return 'bad'
  const after = before.map((limit, index) => ({
    ...limit,
    amount: Number(texts[index] ?? limit.amount),
  }))
  return after.some((limit, index) => limit.amount !== before[index]?.amount) ? after : 'same'
}

function replaced(entry: Entry, edits: Edits): Fields | 'unchanged' | 'bad-amount' {
  const { id, ...rest } = entry
  const limits = editedLimits(entry, edits)
  if (limits === 'bad') return 'bad-amount'
  const statement = edits.statements[id]?.trim() ?? entry['statement']
  const restated = statement !== entry['statement']
  if (!restated && limits === 'same') return 'unchanged'
  return {
    ...rest,
    ...(restated ? { statement } : {}),
    ...(limits === 'same' ? {} : { limits }),
  }
}

/** What the form changed, as a revision by number: the purpose by name, and each entry that differs replaced whole. */
export function changesOf(body: Body, edits: Edits): Changes {
  const changes: unknown[] = []
  if (edits.purpose.trim() !== body.purpose) changes.push({ op: 'purpose', text: edits.purpose })
  for (const entry of body.sections.flatMap(section => section.entries)) {
    const next = replaced(entry, edits)
    if (next === 'bad-amount') return { kind: 'problem', problem: `${entry.id} 的数要写成正整数` }
    if (next !== 'unchanged') changes.push({ op: 'replace', id: entry.id, entry: next })
  }
  return changes.length === 0
    ? { kind: 'problem', problem: '没有改动' }
    : { kind: 'changes', changes }
}

export type Standing = Readonly<{
  state: 'working' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'stopped'
  detail: string | null
}>

const VERDICT_WORDS: Readonly<Record<number, string>> = {
  5: '一条要人定的退出成立了',
  6: '遇到了正文没写到的阻碍',
  7: '连续几次没有进展',
  8: '判定答不出',
}
const ENDED: Readonly<Record<string, Standing>> = {
  achieved: { state: 'completed', detail: '达成' },
  unattainable: { state: 'failed', detail: '无法达成' },
  stalled: { state: 'failed', detail: '停滞' },
  'judge-unavailable': { state: 'failed', detail: '判定不可用' },
  aborted: { state: 'stopped', detail: '被建它的一方中止' },
  cancelled: { state: 'cancelled', detail: null },
}

function pausedFor(pause: GoalStateView['pause']): string {
  if (pause === null || pause.by === 'person') return '你停的'
  return VERDICT_WORDS[pause.row ?? 0] ?? '判定让它停下'
}

function endedBy(outcome: NonNullable<GoalStateView['outcome']>): Standing {
  if (outcome.kind !== 'exit') return ENDED[outcome.kind] ?? { state: 'stopped', detail: null }
  const succeeded = outcome.counts === 'success'
  const counted = succeeded ? '算成功' : '算没做成'
  return {
    state: succeeded ? 'completed' : 'failed',
    detail: `照退出 ${outcome.exit ?? ''} 收场，${counted}`,
  }
}

/** How a goal stands: a state of the shared table, and what is particular to goals beside it. An end by an exit never reads as achieved. */
export function standingOf(state: GoalStateView): Standing {
  if (state.status === 'active') return { state: 'working', detail: null }
  if (state.status === 'paused') return { state: 'paused', detail: pausedFor(state.pause) }
  return state.outcome === null ? { state: 'stopped', detail: null } : endedBy(state.outcome)
}

/** The exit a paused goal may be settled by: the one whose coming about paused it. */
export const settlingExit = (state: GoalStateView): string | null =>
  state.status === 'paused' && state.pause?.by === 'verdict' ? (state.pause.exit ?? null) : null

export const REFUSAL_WORDS: Readonly<Record<string, string>> = {
  'no-live-goal': '这个会话现在没有进行中的目标。',
  'goal-in-progress': '这个会话已经有一个没收场的目标。',
  'nobody-attends': '这个会话无人值守，它的目标只能由建它的一方改。',
  attended: '有人值守的会话里目标不能被中止。',
  'not-its-cause': '目标不是因为这条退出停下的，不能照它收场。',
  'another-goal': '会话已经换了一个目标，面板重读了。',
}
export const SOURCE_WORDS: Readonly<Record<string, string>> = {
  system: '系统读的',
  judge: '判定',
  agent: 'agent 自述',
}
export const VIA_WORDS = { card: '在确认卡片上确认', direct: '在面板上直接改' } as const
/** The units a limit is written in, as the body renders them; a unit the panel does not know is shown as it is kept. */
export const UNIT_WORDS: Readonly<Record<string, string>> = { rounds: '轮' }
export const unitOf = (unit: string): string => UNIT_WORDS[unit] ?? unit
export const DRAFTER_WORDS = {
  agent: 'agent 起草',
  person: '人起草',
  creator: '建立者交来',
} as const
