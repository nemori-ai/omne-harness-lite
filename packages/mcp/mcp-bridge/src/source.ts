import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import {
  isCorrelationKey,
  mcpEndpointGates,
  type ActionDiscovery,
  type ActionInvoker,
  type EndpointRef,
  type Millis,
  type KnownAction,
  type OperationFailure,
} from '@omne-harness/mcp-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolCommandDeclaration } from '@omne-harness/tool-contract'
import type {
  ToolEntrySource,
  ToolMessageContentBlock,
  ToolSourceCall,
  ToolSourceEntry,
  ToolSourceWithheld,
} from '@omne-harness/tool-contract/provider'
import {
  commandOf,
  commandShapeText,
  endpointTool,
  MCP_SOURCE_PREFIX,
  mcpActionExecutor,
  type BridgeShape,
} from './convert.ts'
import {
  failureText,
  notStarted,
  settle,
  unavailableText,
  type BridgeResult,
  type Settlement,
} from './outcome.ts'

export type McpBridgeDependencies<P> = Readonly<{
  /** The endpoints this asker has adopted now. The assembly adapts it from the adoption it gives MCP. */
  endpoints(access: Access<P>): Promise<Outcome<readonly EndpointRef[], 'unknown'>>
  discovery: Pick<ActionDiscovery<P>, 'current' | 'refresh'>
  invoker: Pick<ActionInvoker<P>, 'invoke' | 'cancelTask'>
  programmable(access: Access<P>, ref: EndpointRef): Promise<boolean>
  principalKey(principal: P): string
  shape: BridgeShape
  /** What one result of a tool may weigh, as the tool host checks it. */
  resultMaxBytes: number
  /** How long one listing waits for the first acquisition of an endpoint's actions. */
  acquireWaitMs: number
  /** How long a connection may take when the endpoint's own connection timeout is not set. */
  connectBound: Millis
}>

type Row =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'withheld'; withheld: ToolSourceWithheld }>
  | Readonly<{ kind: 'entry'; entry: ToolSourceEntry; ref: EndpointRef }>

type Listed = Readonly<{ entry: ToolSourceEntry; ref: EndpointRef }>

export type NamedEntry =
  | Readonly<{ kind: 'entry'; entry: ToolSourceEntry }>
  | Readonly<{ kind: 'withheld'; reason: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unreadable'; reason: string }>

export type McpEntrySource<P> = ToolEntrySource<P, ToolMessageContentBlock> &
  Readonly<{
    named(access: Access<P>, name: string): Promise<NamedEntry>
  }>

const ABSENT: NamedEntry = Object.freeze({ kind: 'absent' })
/** What a list of actions converts to: the entry, or why the endpoint is withheld. */
type Converted = ToolSourceEntry | string

const KEPT_MAX = 512
const NONE: Row = { kind: 'none' }

function contentOf(action: KnownAction): readonly string[] {
  const { availability } = action
  return [
    JSON.stringify(action.name),
    action.definitionDigest,
    availability.kind === 'unavailable' ? availability.reason : '',
  ]
}

function keep<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key)
  map.set(key, value)
  if (map.size > KEPT_MAX) map.delete(map.keys().next().value as K)
}

function tenantText<P>(access: Access<P>): string {
  const encoded = tenantCodec.encode(access.tenant)
  if (!encoded.ok) throw new TypeError('the tenant of the asker is not a minted identity')
  return encoded.value
}

function toolName(ref: EndpointRef): string {
  return `${MCP_SOURCE_PREFIX}${ref.name}`
}

function withheld(ref: EndpointRef, reason: string): Row {
  return { kind: 'withheld', withheld: { name: toolName(ref), reason } }
}

function refused(ref: EndpointRef, failure: OperationFailure): Row {
  return failure.kind === 'not-available-to-you' ? NONE : withheld(ref, failureText(failure))
}

async function waited<T>(work: Promise<T>, waitMs: number): Promise<T | 'still-running'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'still-running'>(resolve => {
    timer = setTimeout(() => resolve('still-running'), waitMs)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

function settled(rows: readonly Row[]): ReadonlyMap<string, Exclude<Row, { kind: 'none' }>> {
  const byName = new Map<string, Exclude<Row, { kind: 'none' }>>()
  for (const row of rows) {
    if (row.kind === 'none') continue
    const name = row.kind === 'entry' ? row.entry.definition.name : row.withheld.name
    const prior = byName.get(name)
    if (prior === undefined || (prior.kind === 'withheld' && row.kind === 'entry'))
      byName.set(name, row)
  }
  return byName
}

// The action the call names, as the endpoint offers it now; it must be the command the call was accepted as.
async function calling<P>(
  deps: McpBridgeDependencies<P>,
  access: Access<P>,
  ref: EndpointRef,
  declared: ToolCommandDeclaration,
): Promise<Outcome<KnownAction, string>> {
  const view = await deps.discovery.current(access, ref)
  if ('failure' in view) return fail(failureText(view.failure))
  const known =
    view.ok.kind === 'acquired'
      ? view.ok.actions.find(action => action.name === declared.name)
      : undefined
  if (known === undefined) return fail(failureText({ kind: 'action-unavailable' }))
  const now = commandOf(known, deps.shape, declared.program !== undefined)
  return 'ok' in now && commandShapeText(now.ok) === commandShapeText(declared)
    ? succeed(known)
    : fail(failureText({ kind: 'definition-changed' }))
}

async function send<P>(
  deps: McpBridgeDependencies<P>,
  call: ToolSourceCall<P>,
  ref: EndpointRef,
  declared: ToolCommandDeclaration,
): Promise<Settlement> {
  const access: Access<P> = { principal: call.principal, tenant: call.tenant }
  const known = await calling(deps, access, ref, declared)
  if ('failure' in known) return notStarted(call.name, declared.name, known.failure)
  if (!isCorrelationKey(call.invocation))
    throw new TypeError('the invocation of the call is not a correlation key')
  const result = await deps.invoker.invoke(access, {
    ref,
    action: known.ok.name,
    args: call.arguments,
    expectedDefinition: known.ok.definitionDigest,
    correlationKey: call.invocation,
    signal: call.signal,
    connectBound: deps.connectBound,
  })
  const { program } = declared.returns
  const given = call.program && program.kind === 'json' ? program : undefined
  const came = settle(call.name, declared.name, result, deps.resultMaxBytes, given)
  if (came.effect === 'unknown' && came.cancelTask !== undefined)
    await deps.invoker.cancelTask(access, { ref, ...came.cancelTask })
  return came
}

export function createMcpEntrySource<P>(deps: McpBridgeDependencies<P>): McpEntrySource<P> {
  const listed = new Map<string, ReadonlyMap<string, Listed>>()
  const converted = new Map<string, Converted>()
  const acquiring = new Map<string, Promise<Outcome<unknown, OperationFailure>>>()

  const askerKey = (access: Access<P>) =>
    `${tenantText(access)}\n${deps.principalKey(access.principal)}`

  function convert(ref: EndpointRef, actions: readonly KnownAction[], open: boolean): Converted {
    const made = endpointTool(ref.name, actions, deps.shape, open)
    if ('failure' in made)
      return made.failure === 'no-action'
        ? 'the endpoint offers no action that can be called here'
        : 'the actions of the endpoint do not make a lawful tool'
    const down = actions.find(action => action.availability.kind === 'unavailable')
    return {
      capability: { category: mcpEndpointGates.category, name: ref.name },
      definition: made.ok.definition,
      executor: mcpActionExecutor,
      availability:
        down?.availability.kind === 'unavailable'
          ? { kind: 'known-unavailable', reason: unavailableText(down.availability.reason) }
          : { kind: 'available' },
    }
  }

  async function rowOf(
    access: Access<P>,
    ref: EndpointRef,
    actions: readonly KnownAction[],
  ): Promise<Row> {
    const open = await deps.programmable(access, ref).catch(() => false)
    const content = [ref.name, String(open), ...actions.flatMap(contentOf)].join('\n')
    const kept = converted.get(content)
    const made = kept ?? convert(ref, actions, open)
    if (kept === undefined) keep(converted, content, made)
    return typeof made === 'string' ? withheld(ref, made) : { kind: 'entry', ref, entry: made }
  }

  function acquire(access: Access<P>, ref: EndpointRef) {
    const key = `${askerKey(access)}\n${ref.holding}`
    const running = acquiring.get(key)
    if (running !== undefined) return running
    const started = deps.discovery
      .refresh(access, { ref, connectBound: deps.connectBound })
      .finally(() => acquiring.delete(key))
    acquiring.set(key, started)
    return started
  }

  async function endpointRow(access: Access<P>, ref: EndpointRef): Promise<Row> {
    const first = await deps.discovery.current(access, ref)
    if ('failure' in first) return refused(ref, first.failure)
    if (first.ok.kind === 'acquired') return rowOf(access, ref, first.ok.actions)
    const refreshed = await waited(acquire(access, ref), deps.acquireWaitMs)
    if (refreshed === 'still-running')
      return withheld(ref, 'the actions of the endpoint are still being acquired')
    if ('failure' in refreshed) return refused(ref, refreshed.failure)
    const second = await deps.discovery.current(access, ref)
    if ('failure' in second) return refused(ref, second.failure)
    return second.ok.kind === 'acquired'
      ? rowOf(access, ref, second.ok.actions)
      : withheld(ref, 'the actions of the endpoint have not been acquired')
  }

  async function named(access: Access<P>, name: string): Promise<NamedEntry> {
    const adopted = await deps.endpoints(access)
    if ('failure' in adopted)
      return { kind: 'unreadable', reason: 'the adopted MCP endpoints could not be read' }
    const refs = adopted.ok.filter(ref => toolName(ref) === name)
    const row = settled(await Promise.all(refs.map(ref => endpointRow(access, ref)))).get(name)
    if (row === undefined) return ABSENT
    if (row.kind === 'withheld') return { kind: 'withheld', reason: row.withheld.reason }
    const key = askerKey(access)
    const kept = new Map(listed.get(key) ?? [])
    kept.set(name, { entry: row.entry, ref: row.ref })
    keep(listed, key, kept)
    return { kind: 'entry', entry: row.entry }
  }

  async function refOf(call: ToolSourceCall<P>): Promise<EndpointRef | undefined> {
    const known = listed.get(askerKey(call))?.get(call.name)?.ref
    if (known !== undefined) return known
    await named(call, call.name)
    return listed.get(askerKey(call))?.get(call.name)?.ref
  }

  return {
    prefix: MCP_SOURCE_PREFIX,
    named,

    async list(access) {
      const adopted = await deps.endpoints(access)
      if ('failure' in adopted)
        return fail({
          kind: 'unavailable',
          dependency: 'mcpAdoption',
          diagnostic: 'the adopted MCP endpoints could not be read',
        })
      const rows = settled(await Promise.all(adopted.ok.map(ref => endpointRow(access, ref))))
      const entries = new Map<string, Listed>()
      const held: ToolSourceWithheld[] = []
      for (const [name, row] of rows) {
        if (row.kind === 'entry') entries.set(name, { entry: row.entry, ref: row.ref })
        else held.push(row.withheld)
      }
      keep(listed, askerKey(access), entries)
      return succeed({ entries: [...entries.values()].map(kept => kept.entry), withheld: held })
    },

    select: (access, name) => listed.get(askerKey(access))?.get(name)?.entry,

    async execute(call): Promise<BridgeResult> {
      const ref = call.declared === null ? undefined : await refOf(call)
      const outcome =
        ref === undefined || call.declared === null
          ? notStarted(call.name, call.command ?? '', failureText({ kind: 'not-available-to-you' }))
          : await send(deps, call, ref, call.declared)
      if (outcome.effect === 'happened') return outcome.result
      throw new Error(outcome.message)
    },
  }
}
