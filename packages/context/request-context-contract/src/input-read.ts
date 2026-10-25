// The stable read of the seven groups (RQ-13): count, source, count; two attempts per group.
import type { ContextTarget, GroupToken, PrincipalKey } from './refs.js'
import { decodeGroupToken } from './refs.js'
import { digest } from './internal.js'
import { readHistory } from './history-read.js'
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
}>
export type InputReadOptions = Readonly<{
  /** Also read the CM-02 judgment window inside the history group (planCompaction). */
  window?: boolean
  /** The principal key of this call; carried rows are reused only for the same key. */
  principal?: PrincipalKey
  /** The source set generation; carried rows are reused only within one generation. */
  generation?: PreparedInputKey['generation']
}>

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
  const carried = control.value.previous?.carried
  let rows: readonly HistoryRow[] = []
  let window: CompactionContext | null = null
  const history = await stableGroup(
    'history',
    [() => g.history.readCount(call)],
    async (before): Promise<Got<InputGroups<P>['history']> | Failure | Retry> => {
      const read0 = await sourceValue(g.history.readSource(call), 'history')
      if (read0.kind !== 'got') return read0
      const value = read0.value
      // Unsaved new input is rejected before any history page is read.
      if (value.inputs.saved === null)
        return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
      const token = before[0]
      if (
        carried !== undefined &&
        !options.window &&
        carried.candidate === call.candidate &&
        options.principal !== undefined &&
        carried.preparation.key.principal === options.principal &&
        carried.preparation.key.generation === (options.generation ?? null) &&
        token !== undefined &&
        carried.preparation.key.tokens.history === token
      ) {
        rows = carried.preparation.rows
        return got(value)
      }
      const read = await readHistory(call.access, value.evidence, sources.history)
      if (read.kind === 'epoch-changed') return { kind: 'retry' }
      if (read.kind !== 'history') return read
      rows = read.rows
      if (options.window) {
        const last = rows.at(-1)
        if (last === undefined)
          return { kind: 'invalid', field: 'history.evidence.upper', reason: 'missing-input' }
        const context = await readWindow(call, value.evidence, last.entry, sources)
        if (context.kind !== 'got') return context
        window = context.value
      }
      return got(value)
    },
  )
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
