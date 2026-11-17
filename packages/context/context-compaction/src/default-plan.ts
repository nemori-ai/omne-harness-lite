import type {
  CompactionInput,
  CompactionOutcome,
  CompactionReply,
} from '@omne-harness/agent-contract'
import {
  judgeMessage,
  type CompactionContext,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'
import { succeed } from '@omne-harness/operation-result'
import {
  DEFAULT_COMPACTION_CONFIGURATION,
  type DefaultCompactionConfiguration,
} from './default-configuration.ts'

export type DefaultCompactionPlan = Readonly<{
  kind: 'planned'
  coverTo: RecordEntryRef
  retained: readonly RecordEntryRef[]
  messages: readonly Message[]
  trimmed: readonly Readonly<{
    message: string
    block: string
    originalBytes: string
    keptBytes: string
  }>[]
}>
type CannotFit = Extract<CompactionOutcome, { kind: 'cannot-fit' }>
type Unit = { indexes: number[]; forced: boolean; blocked: boolean }
const floor = (diagnostic: string): CannotFit => ({
  kind: 'cannot-fit',
  reason: 'protected-floor',
  diagnostic,
})

// Migrated from the default Request Context policy: calls and results form one retention unit.
function unitsOf(context: CompactionContext): Unit[] {
  const index = new Map(context.covered.map((entry, at) => [entry.ref, at]))
  const visible = new Set(
    [...context.covered, ...context.after].filter(e => e.message !== null).map(e => e.ref),
  )
  const parent = context.covered.map((_, at) => at)
  const find = (at: number): number => {
    let root = at
    while (parent[root] !== root) root = parent[root] ?? root
    return root
  }
  const forced = new Set<number>()
  const blocked = new Set<number>()
  for (const { result, call } of context.base.pairings) {
    const at = index.get(result)
    const callAt = call === null ? undefined : index.get(call)
    if (at !== undefined && callAt !== undefined) parent[find(at)] = find(callAt)
    else if (at === undefined && callAt !== undefined) forced.add(callAt)
    else if (at !== undefined && call !== null && !visible.has(call)) blocked.add(at)
  }
  for (const ref of context.open) {
    const at = index.get(ref)
    if (at !== undefined) forced.add(at)
  }
  const units = new Map<number, Unit>()
  for (const [at, entry] of context.covered.entries()) {
    const root = find(at)
    const unit = units.get(root) ?? { indexes: [], forced: false, blocked: false }
    unit.indexes.push(at)
    unit.forced ||= forced.has(at)
    unit.blocked ||= blocked.has(at) || entry.message === null
    units.set(root, unit)
  }
  return [...units.values()]
}

function trim(
  messages: readonly Message[],
  configuration: DefaultCompactionConfiguration,
): Pick<DefaultCompactionPlan, 'messages' | 'trimmed'> {
  if (!configuration.trimToolText) return { messages, trimmed: [] }
  const trimmed: DefaultCompactionPlan['trimmed'][number][] = []
  const projected = messages.map(message => {
    if (message.role !== 'tool') return message
    const blocks = message.blocks.map(block => {
      if (block.kind !== 'text' || Buffer.byteLength(block.text) <= configuration.maxToolTextBytes)
        return block
      let bytes = 0
      let end = 0
      for (const char of block.text) {
        const size = Buffer.byteLength(char)
        if (bytes + size > configuration.maxToolTextBytes) break
        bytes += size
        end += char.length
      }
      trimmed.push({
        message: message.id,
        block: block.id,
        originalBytes: String(Buffer.byteLength(block.text)),
        keptBytes: String(bytes),
      })
      return { ...block, text: block.text.slice(0, end) }
    })
    const judged = judgeMessage({ ...message, blocks })
    if ('rejected' in judged)
      throw new TypeError(`invalid trimmed summary material: ${judged.rejected}`)
    return judged.ok
  })
  return { messages: projected, trimmed }
}

export async function planDefaultCompaction(
  input: CompactionInput,
  measure: (retained: readonly RecordEntryRef[]) => CompactionReply<string>,
  configuration: DefaultCompactionConfiguration = DEFAULT_COMPACTION_CONFIGURATION,
): CompactionReply<DefaultCompactionPlan | CannotFit> {
  const history = input.history
  const barrier = new Set(history.barriers)
  const boundary = history.logOrder.findIndex(ref => barrier.has(ref))
  const limitAt = boundary < 0 ? history.logOrder.length : boundary
  const refs = history.logOrder.slice(0, limitAt)
  const last = refs.at(-1)
  if (
    last === undefined ||
    (history.base.kind === 'previous' && !refs.includes(history.base.record))
  )
    return succeed(floor('no complete prefix before the current work barrier'))
  const byRef = new Map(history.entries.map(entry => [entry.ref, entry]))
  const ordered = history.logOrder.map(ref => ({ ref, message: byRef.get(ref)?.message ?? null }))
  const context: CompactionContext = {
    origin: history.origin,
    base: history.base,
    covered: ordered.slice(0, limitAt),
    after: ordered.slice(limitAt),
    open: history.protected,
  }
  const units = unitsOf(context)
  if (units.some(unit => unit.forced && unit.blocked))
    return succeed(floor('a protected retention unit has no model-visible representation'))
  const kept = new Set(units.filter(unit => unit.forced).flatMap(unit => unit.indexes))
  const retained = (indexes: ReadonlySet<number>) => refs.filter((_, index) => indexes.has(index))
  const measured = (indexes: ReadonlySet<number>) =>
    indexes.size === 0 ? Promise.resolve(succeed('0')) : measure(retained(indexes))
  const budget =
    (BigInt(input.target.profile.profile.definition.context.window.provided) *
      BigInt(configuration.retainPercent)) /
    100n
  const minimum = await measured(kept)
  if ('failure' in minimum) return minimum
  if (BigInt(minimum.ok) > budget)
    return succeed(floor('protected retention exceeds the configured window share'))
  const ranked = units
    .filter(unit => !unit.forced && !unit.blocked)
    .sort((a, b) => (b.indexes.at(-1) ?? 0) - (a.indexes.at(-1) ?? 0))
  for (const unit of ranked) {
    const candidate = new Set([...kept, ...unit.indexes])
    const result = await measured(candidate)
    if ('failure' in result) return result
    if (BigInt(result.ok) <= budget) for (const at of unit.indexes) kept.add(at)
  }
  const remaining = new Set(refs.filter((_, i) => !kept.has(i)))
  const messages = history.entries
    .filter(entry => remaining.has(entry.ref))
    .flatMap(entry => entry.represented)
  if (messages.length === 0)
    return succeed({
      kind: 'cannot-fit',
      reason: 'after-compaction',
      diagnostic: 'the retention policy leaves no material to summarize',
    })
  return succeed({
    kind: 'planned',
    coverTo: last,
    retained: retained(kept),
    ...trim(messages, configuration),
  })
}
