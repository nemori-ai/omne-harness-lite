// The default compaction strategy: which entries stay as originals, the summary instruction and
// the trimmer's threshold. The numbers are configuration fields; the values here are initial
// values, and the SPEC marks three of them for re-check against this project's counting basis.
//
// Retention works on units, not on single entries. A tool call and the results that answer it
// are one unit, because a compaction that keeps one side only is illegal (CM-03 pairing). A unit
// whose result lies after the window, or that holds open work, is the floor: it is kept before
// anything is ranked.
import { judgeBlockIdentity } from '@omne-harness/content-block'
import type {
  CompactionContext,
  CoveredEntry,
  Message,
  RecordEntryRef,
} from '@omne-harness/message'
import {
  compactionPolicySchema,
  type Adoption,
  type CompactionPlanDraft,
  type CompactionPolicy,
  type CompactionPolicyPort,
  type RetentionMeasurement,
} from '@omne-harness/request-context-contract'
import { adoptionDigest, digest } from './digest.ts'
import { decodeByteCount, decodeParameters } from './policy-input.ts'
import { trimMaterial } from './trimmer.ts'

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = Object.freeze({
  retainBudget: Object.freeze({ kind: 'ratio', retainRatio: '0.16' } as const),
  retainPreference: 'newest-first',
  triggerPercent: '80',
  headroomTokens: null,
  trimFirst: true,
  stepBound: '3',
})
/** The initial threshold for a tool result block in the material of a summary step. */
export const DEFAULT_TRIM_BYTES = '65536'

export type DefaultCompactionOptions = Readonly<{
  /** Replaces the named fields of the initial configuration. */
  config?: Partial<CompactionPolicy>
  /** The trimmer's threshold in bytes per text block; a caller's smaller limit wins. */
  maxBlockBytes?: string
}>

const INSTRUCTION =
  'Summarize the conversation so far for a later request. Keep the user goals, decisions, ' +
  'facts, file names and open questions. Do not invent anything that is not in the material.'

type Unit = {
  readonly indexes: number[]
  results: number
  forced: boolean
  blocked: boolean
}
type Failure = Exclude<Awaited<ReturnType<CompactionPolicyPort['plan']>>, CompactionPlanDraft>

function readable(message: Message | null): message is Message {
  return (
    message !== null &&
    message.role !== 'tool_internal' &&
    message.blocks.some(part => part.visibility.toModel)
  )
}
function callIds(message: Message | null, kinds: readonly string[]): string[] {
  if (message === null) return []
  return message.blocks.flatMap(part =>
    kinds.includes(part.kind) && 'callId' in part ? [part.callId] : [],
  )
}
/** Result entry to the entry of the call it answers, or null when the call is outside the window. */
function pairingsOf(context: CompactionContext): Map<RecordEntryRef, RecordEntryRef | null> {
  const pairs = new Map<RecordEntryRef, RecordEntryRef | null>()
  if (context.base.kind === 'previous') {
    for (const witness of context.base.pairings) pairs.set(witness.result, witness.call)
    return pairs
  }
  const nearest = new Map<string, RecordEntryRef>()
  for (const { ref, message } of [...context.covered, ...context.after]) {
    for (const id of callIds(message, ['tool_call', 'tool_call_unparsed'])) nearest.set(id, ref)
    for (const id of callIds(message, ['tool_result'])) pairs.set(ref, nearest.get(id) ?? null)
  }
  return pairs
}

/** Units of the covered entries, with the floor and the units no draft may keep. */
function unitsOf(context: CompactionContext): Unit[] {
  const index = new Map(context.covered.map((entry, at) => [entry.ref, at] as const))
  const inView = new Set(
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
  const answered = new Map<number, number>()
  for (const [result, call] of pairingsOf(context)) {
    const at = index.get(result)
    const callAt = call === null ? undefined : index.get(call)
    if (at !== undefined && callAt !== undefined) {
      parent[find(at)] = find(callAt)
      answered.set(callAt, (answered.get(callAt) ?? 0) + 1)
    } else if (at === undefined && callAt !== undefined) {
      // The result stays in view after the window, so the call must stay with it.
      forced.add(callAt)
    } else if (
      at !== undefined &&
      context.base.kind === 'previous' &&
      call !== null &&
      !inView.has(call)
    ) {
      // After a compaction, a covered result whose call is not in view cannot be kept alone.
      blocked.add(at)
    }
  }
  for (const ref of context.open) {
    const at = index.get(ref)
    if (at !== undefined) forced.add(at)
  }
  const units = new Map<number, Unit>()
  for (const [at, entry] of context.covered.entries()) {
    const root = find(at)
    const unit = units.get(root) ?? { indexes: [], results: 0, forced: false, blocked: false }
    unit.indexes.push(at)
    unit.results += answered.get(at) ?? 0
    unit.forced ||= forced.has(at)
    unit.blocked ||= blocked.has(at) || !readable(entry.message)
    units.set(root, unit)
  }
  return [...units.values()]
}

function limitOf(policy: CompactionPolicy, windowTokens: string): bigint | null {
  if (!/^(0|[1-9][0-9]*)$/u.test(windowTokens)) return null
  const { retainBudget } = policy
  if (retainBudget.kind === 'tokens') return BigInt(retainBudget.retainTokens)
  const [whole = '0', fraction = ''] = retainBudget.retainRatio.split('.')
  return (BigInt(windowTokens) * BigInt(whole + fraction)) / 10n ** BigInt(fraction.length)
}
function refsOf(entries: readonly CoveredEntry[], indexes: Iterable<number>): RecordEntryRef[] {
  return [...new Set(indexes)]
    .sort((a, b) => a - b)
    .flatMap(at => (entries[at] === undefined ? [] : [entries[at].ref]))
}
function failureOf(measured: Exclude<RetentionMeasurement, { kind: 'measured' }>): Failure {
  return measured.kind === 'unknown'
    ? { kind: 'unknown', source: 'read', diagnostic: measured.diagnostic }
    : measured
}

export function createDefaultCompactionPolicy(
  options: DefaultCompactionOptions = {},
): CompactionPolicyPort {
  const config = decodeParameters(
    compactionPolicySchema,
    { ...DEFAULT_COMPACTION_POLICY, ...options.config },
    'The compaction strategy configuration',
  )
  const maxBlockBytes = decodeByteCount(
    options.maxBlockBytes ?? DEFAULT_TRIM_BYTES,
    'The trim threshold',
  )
  const parameters = { config, maxBlockBytes: maxBlockBytes.toString() }
  const identity: Adoption = {
    owner: 'request-context',
    name: 'default-compaction',
    revision: '1',
    digest: adoptionDigest({ strategy: 'default-compaction', revision: '1' }),
  }
  const instruction = judgeBlockIdentity({
    id: `rq_${digest({ strategy: 'default-compaction', block: 'instruction' })}`,
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in instruction) throw new TypeError('The instruction block identity is invalid')

  return {
    identity,
    config,
    configDigest: () => digest(parameters),
    async plan({ context, measure, windowTokens }) {
      const last = context.covered.at(-1)
      if (last === undefined)
        return { kind: 'invalid', field: 'context.covered', reason: 'missing-input' }
      const limit = limitOf(config, windowTokens)
      if (limit === null)
        return { kind: 'invalid', field: 'windowTokens', reason: 'unsupported-format' }
      const units = unitsOf(context)
      const kept = new Set(units.filter(unit => unit.forced).flatMap(unit => unit.indexes))
      const measured = async (indexes: ReadonlySet<number>): Promise<RetentionMeasurement> =>
        indexes.size === 0
          ? { kind: 'measured', tokens: '0' }
          : measure(refsOf(context.covered, indexes))
      const floor = await measured(kept)
      if (floor.kind !== 'measured') return failureOf(floor)
      if (BigInt(floor.tokens) > limit)
        return {
          kind: 'floor-exceeds-budget',
          floor: refsOf(context.covered, kept),
          budget: limit.toString(),
        }
      const newest = (unit: Unit) => Math.max(...unit.indexes)
      const ranked = units
        .filter(unit => !unit.forced && !unit.blocked)
        .sort((a, b) =>
          config.retainPreference === 'most-referenced' && a.results !== b.results
            ? b.results - a.results
            : newest(b) - newest(a),
        )
      for (const unit of ranked) {
        const result = await measured(new Set([...kept, ...unit.indexes]))
        if (result.kind !== 'measured') return failureOf(result)
        if (BigInt(result.tokens) <= limit) for (const at of unit.indexes) kept.add(at)
      }
      return {
        kind: 'draft',
        coverTo: last.ref,
        retained: refsOf(context.covered, kept),
        bound: config.stepBound,
        shape: { kind: 'summarize', trimFirst: config.trimFirst },
      }
    },
    trim(material, limits) {
      const caller = BigInt(limits.maxBlockBytes)
      return trimMaterial(material, caller < maxBlockBytes ? caller : maxBlockBytes)
    },
    summaryInstruction: () => [{ kind: 'text', ...instruction.ok, text: INSTRUCTION }],
  }
}
