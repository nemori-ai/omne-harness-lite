import type { ContextTarget, GroupToken, PrincipalKey } from './refs.js'
import { decodeGroupToken } from './refs.js'
import { digest } from './internal.js'
import { readHistory, type HistoryReadMode } from './history-read.js'
import { materialBelongs, type CachedAssemblyMaterial } from './reuse.js'
import type { HistoryRow } from './ports.js'
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
export function combinedToken(parts: readonly GroupToken[]): GroupToken {
  const token = decodeGroupToken(`t_${digest(parts)}`)
  if ('failure' in token) throw new Error('Combined group token is invalid')
  return token.ok
}

function groupToken(before: readonly GroupToken[]): GroupToken {
  return before.length === 1 && before[0] !== undefined ? before[0] : combinedToken(before)
}

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
        token: groupToken(before),
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
  historyRead: Readonly<{
    mode: HistoryReadMode | 'carried'
    added: readonly HistoryRow[]
    cached: CachedAssemblyMaterial | null
  }>
}>
export type InputReadOptions = Readonly<{
  principal?: PrincipalKey
  generation?: PreparedInputKey['generation']
  cached?: CachedAssemblyMaterial | null
}>

function usableMaterial<P>(
  call: AssemblyCall<P>,
  target: ContextTarget,
  options: InputReadOptions,
): CachedAssemblyMaterial | null {
  const { cached } = options
  if (cached === undefined || cached === null) return null
  const belongs = materialBelongs(cached, {
    principal: options.principal,
    generation: options.generation,
    purpose: call.purpose,
    target,
  })
  return belongs ? cached : null
}
function carriedRows<P>(
  call: AssemblyCall<P>,
  options: InputReadOptions,
  carried: RequestCandidate | undefined,
  token: GroupToken | undefined,
): readonly HistoryRow[] | null {
  if (carried === undefined || token === undefined) return null
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
  historyRead: StableInputs<unknown>['historyRead']
}
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
  return got(value)
}

export async function readInputs<P>(
  call: AssemblyCall<P>,
  target: ContextTarget,
  sources: ContextSources<P>,
  options: InputReadOptions = {},
): Promise<StableInputs<P> | Failure> {
  const g = sources.groups
  const simple = async <K extends Exclude<GroupName, 'identity' | 'history'>>(name: K) =>
    stableGroup(name, [() => g[name].readCount(call)], () =>
      sourceValue(g[name].readSource(call) as Promise<SourceRead<InputGroups<P>[K]>>, name),
    )
  const control = await simple('control')
  if (control.kind !== 'stable') return control
  const cached = usableMaterial(call, target, options)
  const attempt: HistoryAttempt = {
    rows: [],
    historyRead: { mode: 'full', added: [], cached },
  }
  const adoptedRead = { access: call.access, target }
  const history = await stableGroup(
    'history',
    [() => g.history.readCount(call), () => sources.adopted.readCount(adoptedRead)],
    async before => {
      const read0 = await sourceValue(g.history.readSource(call), 'history')
      if (read0.kind !== 'got') return read0
      const adopted = await sourceValue(sources.adopted.readSource(adoptedRead), 'adopted')
      if (adopted.kind !== 'got') return adopted
      return readHistoryValue(call, sources, options, {
        value: { ...read0.value, adopted: adopted.value },
        token: groupToken(before),
        carried: control.value.previous?.carried,
        attempt,
      })
    },
  )
  const { rows, historyRead } = attempt
  if (history.kind !== 'stable') return history
  const prompt = await simple('prompt')
  if (prompt.kind !== 'stable') return prompt
  const model = await simple('model')
  if (model.kind !== 'stable') return model
  const tools = await simple('tools')
  if (tools.kind !== 'stable') return tools
  return {
    kind: 'inputs',
    rows,
    historyRead,
    tokens: {
      history: history.token,
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
      adopted: history.value.adopted,
      transition: history.value.transition,
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
