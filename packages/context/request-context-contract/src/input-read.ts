// The stable read of the seven groups (RQ-13): count, source, count; two attempts per group.
import type { ContextTarget, GroupToken, PrincipalKey } from './refs.js'
import { decodeGroupToken } from './refs.js'
import { digest } from './internal.js'
import { readHistory, type HistoryReadMode } from './history-read.js'
import { materialBelongs, type CachedAssemblyMaterial } from './reuse.js'
import type { HistoryRow } from './ports.js'
import type { CompactionContext } from '@omne-harness/message'
import type {
  AssemblyCall,
  AssemblyFailure,
  AssemblyInput,
  AssemblyUnknown,
  GroupName,
  InputGroups,
  PreparedInputKey,
  RequestCandidate,
} from './values.js'
import type { ContextSources, SourceRead } from './sources.js'

/** Attempts per group: the first read and one re-read. */
export const GROUP_READ_ATTEMPTS = 2
type Failure = AssemblyFailure | AssemblyUnknown
type Retry = Readonly<{ kind: 'retry' }>
type Got<T> = Readonly<{ kind: 'got'; value: T }>
const got = <T>(value: T): Got<T> => ({ kind: 'got', value })
type Tokens = PreparedInputKey['tokens']

export function sourceFailure(
  read: Exclude<SourceRead<unknown>, { kind: 'value' }>,
  field: string,
  action: 'read-inputs' | 'read-accounts' = 'read-inputs',
): Failure {
  switch (read.kind) {
    case 'denied':
      return { kind: 'denied', action, diagnostic: `${field} refused access` }
    case 'invalid':
      return { kind: 'invalid', field: `${field}.${read.field}`, reason: read.reason }
    case 'unknown':
      return { kind: 'unknown', source: 'read', diagnostic: `${field} outcome unknown` }
    case 'unavailable':
      return { kind: 'unavailable', owner: 'input-source', diagnostic: read.diagnostic }
  }
}
function isFailure<T>(value: Got<T> | Failure | Retry): value is Failure {
  return value.kind !== 'got' && value.kind !== 'retry'
}
/** Combines several source counts into one opaque token of a group. */
export function combinedToken(parts: readonly GroupToken[]): GroupToken {
  const token = decodeGroupToken(`t_${digest(parts)}`)
  if ('failure' in token) throw new Error('Combined group token is invalid')
  return token.ok
}

/**
 * Runs the fixed order of one group: all before counts, the value, all after counts. A changed
 * count discards the group and its dependent reads; a second change is `unstable-input:<group>`.
 */
export async function stableGroup<T>(
  name: string,
  counts: readonly (() => Promise<SourceRead<GroupToken>>)[],
  value: (before: readonly GroupToken[]) => Promise<Got<T> | Failure | Retry>,
): Promise<Readonly<{ kind: 'stable'; token: GroupToken; value: T }> | Failure> {
  for (let attempt = 0; attempt < GROUP_READ_ATTEMPTS; attempt++) {
    const before: GroupToken[] = []
    for (const count of counts) {
      const read = await count()
      if (read.kind !== 'value') return sourceFailure(read, name)
      before.push(read.value)
    }
    const material = await value(before)
    if (isFailure(material)) return material
    const after: GroupToken[] = []
    for (const count of counts) {
      const read = await count()
      if (read.kind !== 'value') return sourceFailure(read, name)
      after.push(read.value)
    }
    if (material.kind === 'got' && before.every((token, index) => token === after[index]))
      return {
        kind: 'stable',
        token: before.length === 1 && before[0] !== undefined ? before[0] : combinedToken(before),
        value: material.value,
      }
  }
  return { kind: 'unavailable', owner: 'input-source', diagnostic: `unstable-input:${name}` }
}

async function sourceValue<T>(
  read: Promise<SourceRead<T>>,
  name: string,
): Promise<Got<T> | Failure> {
  const result = await read
  return result.kind === 'value' ? got(result.value) : sourceFailure(result, name)
}

export type StableInputs<P> = Readonly<{
  kind: 'inputs'
  input: AssemblyInput<P>
  tokens: Tokens
  rows: readonly HistoryRow[]
  /** The incremental judgment window under the same evidence, when it was asked for. */
  window: CompactionContext | null
  /** How the rows were obtained, and the cached material of this position they continue. */
  historyRead: Readonly<{
    mode: HistoryReadMode | 'carried'
    added: readonly HistoryRow[]
    cached: CachedAssemblyMaterial | null
  }>
}>
export type InputReadOptions = Readonly<{
  /** Also read the CM-02 judgment window inside the history group (planCompaction). */
  window?: boolean
  /** The principal key of this call; carried rows are reused only for the same key. */
  principal?: PrincipalKey
  /** The source set generation; carried rows are reused only within one generation. */
  generation?: PreparedInputKey['generation']
  /**
   * Material derived earlier for the same principal, generation, target and position. It only
   * shortens the history read; every group is still read and checked in this call.
   */
  cached?: CachedAssemblyMaterial | null
}>

/** The cached material, when it belongs to exactly this call and the call does not ask a window. */
function usableMaterial<P>(
  call: AssemblyCall<P>,
  target: ContextTarget,
  options: InputReadOptions,
): CachedAssemblyMaterial | null {
  const { cached } = options
  if (cached === undefined || cached === null || options.window) return null
  const belongs = materialBelongs(cached, {
    principal: options.principal,
    generation: options.generation,
    purpose: call.purpose,
    position: call.position,
    target,
  })
  return belongs ? cached : null
}
/** The rows of a carried candidate prepared under the same candidate, principal, generation and token. */
function carriedRows<P>(
  call: AssemblyCall<P>,
  options: InputReadOptions,
  carried: RequestCandidate | undefined,
  token: GroupToken | undefined,
): readonly HistoryRow[] | null {
  if (carried === undefined || options.window || token === undefined) return null
  const key = carried.preparation.key
  const same =
    carried.candidate === call.candidate &&
    options.principal !== undefined &&
    key.principal === options.principal &&
    key.generation === (options.generation ?? null) &&
    key.tokens.history === token
  return same ? carried.preparation.rows : null
}
type HistoryAttempt = {
  rows: readonly HistoryRow[]
  window: CompactionContext | null
  historyRead: StableInputs<unknown>['historyRead']
}
/** One attempt of the history group: the rows of the group value, from carried, cached or source. */
async function readHistoryValue<P>(
  call: AssemblyCall<P>,
  sources: ContextSources<P>,
  options: InputReadOptions,
  state: Readonly<{
    value: InputGroups<P>['history']
    token: GroupToken | undefined
    carried: RequestCandidate | undefined
    attempt: HistoryAttempt
  }>,
): Promise<Got<InputGroups<P>['history']> | Failure | Retry> {
  const { value, attempt } = state
  const cached = attempt.historyRead.cached
  // Unsaved new input is rejected before any history page is read.
  if (value.inputs.saved === null)
    return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
  const reused = carriedRows(call, options, state.carried, state.token)
  if (reused !== null) {
    attempt.rows = reused
    attempt.historyRead = { mode: 'carried', added: [], cached }
    return got(value)
  }
  const prefix =
    cached === null ? undefined : { evidence: cached.history.evidence, rows: cached.history.rows }
  const read = await readHistory(call.access, value.evidence, sources.history, prefix)
  if (read.kind === 'epoch-changed') return { kind: 'retry' }
  if (read.kind !== 'history') return read
  attempt.rows = read.rows
  attempt.historyRead = { mode: read.mode, added: read.added, cached }
  if (!options.window) return got(value)
  const last = read.rows.at(-1)
  if (last === undefined)
    return { kind: 'invalid', field: 'history.evidence.upper', reason: 'missing-input' }
  const context = await readWindow(call, value.evidence, last.entry, sources)
  if (context.kind !== 'got') return context
  attempt.window = context.value
  return got(value)
}

/** Reads the six source groups of one call; the identity group is the call itself. */
export async function readInputs<P>(
  call: AssemblyCall<P>,
  target: ContextTarget,
  sources: ContextSources<P>,
  options: InputReadOptions = {},
): Promise<StableInputs<P> | Failure> {
  const g = sources.groups
  const simple = async <K extends Exclude<GroupName, 'identity' | 'history' | 'context'>>(
    name: K,
  ) =>
    stableGroup(name, [() => g[name].readCount(call)], () =>
      sourceValue(g[name].readSource(call) as Promise<SourceRead<InputGroups<P>[K]>>, name),
    )
  const control = await simple('control')
  if (control.kind !== 'stable') return control
  const cached = usableMaterial(call, target, options)
  // What the final attempt of the group read; a retried attempt never publishes an earlier one.
  const attempt: HistoryAttempt = {
    rows: [],
    window: null,
    historyRead: { mode: 'full', added: [], cached },
  }
  const history = await stableGroup('history', [() => g.history.readCount(call)], async before => {
    const read0 = await sourceValue(g.history.readSource(call), 'history')
    if (read0.kind !== 'got') return read0
    return readHistoryValue(call, sources, options, {
      value: read0.value,
      token: before[0],
      carried: control.value.previous?.carried,
      attempt,
    })
  })
  const { rows, window, historyRead } = attempt
  if (history.kind !== 'stable') return history
  const adoptedRead = { access: call.access, target }
  const context = await stableGroup(
    'context',
    [() => g.context.readCount(call), () => sources.adopted.readCount(adoptedRead)],
    async (): Promise<Got<InputGroups<P>['context']> | Failure> => {
      const value = await sourceValue(g.context.readSource(call), 'context')
      if (value.kind !== 'got') return value
      const adopted = await sourceValue(sources.adopted.readSource(adoptedRead), 'adopted')
      if (adopted.kind !== 'got') return adopted
      return got({ ...value.value, adopted: adopted.value })
    },
  )
  if (context.kind !== 'stable') return context
  const prompt = await simple('prompt')
  if (prompt.kind !== 'stable') return prompt
  const model = await simple('model')
  if (model.kind !== 'stable') return model
  const tools = await simple('tools')
  if (tools.kind !== 'stable') return tools
  return {
    kind: 'inputs',
    rows,
    window,
    historyRead,
    tokens: {
      history: history.token,
      context: context.token,
      prompt: prompt.token,
      model: model.token,
      tools: tools.token,
      control: control.token,
    },
    input: {
      target,
      identity: {
        access: call.access,
        purpose: call.purpose,
        position: call.position,
        candidate: call.candidate,
      },
      history: history.value.evidence,
      inputs: history.value.inputs,
      contextRead: context.value.contextRead,
      adopted: context.value.adopted,
      transition: context.value.transition,
      promptContributions: prompt.value.promptContributions,
      assembleContext: prompt.value.assembleContext,
      selection: model.value,
      tools: tools.value,
      conditions: control.value.conditions,
      previous: control.value.previous,
      alterations: control.value.alterations,
      beforeModelCall: control.value.beforeModelCall,
    },
  }
}

async function readWindow<P>(
  call: AssemblyCall<P>,
  evidence: InputGroups<P>['history']['evidence'],
  coverTo: import('@omne-harness/message').RecordEntryRef,
  sources: ContextSources<P>,
): Promise<Got<CompactionContext> | Failure | Retry> {
  const result = await sources.history.compactionContext({ access: call.access, evidence, coverTo })
  switch (result.kind) {
    case 'context':
      return digest(result.evidence) === digest(evidence)
        ? got(result.value)
        : {
            kind: 'invalid',
            field: 'history.compactionContext.evidence',
            reason: 'source-evidence-conflict',
          }
    case 'epoch-changed':
      return { kind: 'retry' }
    case 'denied':
      return { kind: 'denied', action: 'read-history', diagnostic: 'Compaction window refused' }
    case 'invalid':
      return {
        kind: 'invalid',
        field: `history.compactionContext.${result.field}`,
        reason: result.reason,
      }
    case 'unknown':
      return { kind: 'unknown', source: 'read', diagnostic: 'Compaction window unknown' }
    case 'unavailable':
      return { kind: 'unavailable', owner: 'history-source', diagnostic: result.diagnostic }
  }
}

/** Reads only the model selection group, for `deriveStep`. */
export async function readModelGroup<P>(call: AssemblyCall<P>, sources: ContextSources<P>) {
  return stableGroup('model', [() => sources.groups.model.readCount(call)], () =>
    sourceValue(sources.groups.model.readSource(call), 'model'),
  )
}
