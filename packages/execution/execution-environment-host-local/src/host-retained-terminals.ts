import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  FacilityReason,
  FacilityResult,
  ManagedResource,
  ProcessHandle,
  ProviderAcquireInput,
  RetainedTerminalLedger,
  ResourceLedger,
  TerminalFacility,
  TerminalInformation,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import type { HostTerminals } from './host-terminal.ts'

type CreateRequest = Parameters<TerminalFacility<unknown>['create']>[0]
type ExecuteRequest = Parameters<TerminalFacility<unknown>['execute']>[0]
type TerminalRequest = Parameters<TerminalFacility<unknown>['close']>[0]
type StopStatus = 'confirmed' | 'unconfirmed'

/** A reservation has a recovery identity before start performs any asynchronous work. */
export type RetainedTerminalBackend = Readonly<{
  terminal: TerminalRef
  resource: ManagedResource
  start(): Promise<FacilityResult<{ readonly terminal: TerminalRef }>>
  execute(request: ExecuteRequest): Promise<FacilityResult<ProcessHandle>>
  information(): TerminalInformation
  stop(): Promise<StopStatus>
}>

export type RetainedTerminalFactory = (
  input: Readonly<{
    request: CreateRequest
    ledger: RetainedTerminalLedger
    scope: ScopeRef
    closed(): boolean
  }>,
) => RetainedTerminalBackend | undefined

type Leg = {
  readonly owner: object
  readonly resource: ManagedResource
  readonly ledger: ResourceLedger
  execution: { kind: 'notSent' } | { kind: 'sent'; handle: ProcessHandle | undefined }
  starting: boolean
  stopped: boolean
  recorded: boolean
  cancelled: boolean
}
type Entry = {
  readonly key: string
  readonly generation: string
  readonly scope: ScopeRef
  readonly backend: RetainedTerminalBackend
  readonly closed: () => boolean
  readonly legs: Set<Leg>
  state: 'starting' | 'live' | 'closing' | 'closed'
  running: Leg | undefined
  stopping: Promise<StopStatus> | undefined
}

const reject = (requestId: string, reason: FacilityReason): FacilityResult<never> => ({
  kind: 'rejected',
  requestId,
  reason,
})
const chain = (scope: ScopeRef): readonly string[] => {
  const result: string[] = []
  for (let current: ScopeRef | undefined = scope; current !== undefined; current = current.parent)
    result.push(current.ref)
  return result
}

/** The nested shell coordinate is only for cold cleanup, never for reattachment. */
export function retainedLegShell(resource: ManagedResource): ManagedResource | undefined {
  const reference = resource.reference
  if (reference.kind !== 'object' || reference.entries.length !== 3) return undefined
  const [kind, key, shell] = reference.entries
  if (kind?.key !== 'kind' || kind.value.kind !== 'string' || kind.value.value !== 'retained-leg')
    return undefined
  if (key?.key !== 'shellKey' || key.value.kind !== 'string' || shell?.key !== 'shell')
    return undefined
  return { key: key.value.value, provider: resource.provider, reference: shell.value }
}

async function recordStop(leg: Leg, status: StopStatus): Promise<StopStatus> {
  if (status === 'confirmed') leg.stopped = true
  try {
    leg.recorded = (await leg.ledger.stopped(leg.resource.key, status)) === 'recorded'
  } catch {
    leg.recorded = false
  }
  return leg.stopped && leg.recorded ? 'confirmed' : 'unconfirmed'
}

async function stopLeg(entry: Entry, leg: Leg): Promise<StopStatus> {
  leg.cancelled = true
  if (leg.starting) return 'unconfirmed'
  if (leg.stopped || leg.execution.kind === 'notSent') return recordStop(leg, 'confirmed')
  try {
    const status = await (leg.execution.handle === undefined
      ? entry.backend.stop()
      : leg.execution.handle.stop('forced'))
    const recorded = await recordStop(leg, status)
    if (status === 'confirmed' && entry.running === leg) entry.running = undefined
    return recorded
  } catch {
    return 'unconfirmed'
  }
}

export function createRetainedTerminalIndex() {
  const entries = new Map<string, Entry>()
  const retired = new Set<string>()

  const close = (entry: Entry): Promise<StopStatus> => {
    if (entry.state === 'closed') return Promise.resolve('confirmed')
    entry.state = 'closing'
    entry.stopping ??= (async () => {
      let status: StopStatus
      try {
        status = await entry.backend.stop()
      } catch {
        return 'unconfirmed'
      }
      if (status !== 'confirmed') return status
      for (const leg of entry.legs) {
        if (leg.starting) return 'unconfirmed'
        if ((await recordStop(leg, 'confirmed')) !== 'confirmed') return 'unconfirmed'
      }
      entry.state = 'closed'
      return 'confirmed'
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }

  return Object.freeze({
    resources(scope: ScopeRef): readonly ManagedResource[] {
      return [...entries.values()]
        .filter(entry => entry.scope.ref === scope.ref && entry.state !== 'closed')
        .map(entry => entry.backend.resource)
    },
    async recover(resource: ManagedResource): Promise<StopStatus | undefined> {
      for (const entry of entries.values()) {
        if (
          entry.backend.resource.key === resource.key &&
          JSON.stringify(entry.backend.resource) === JSON.stringify(resource)
        )
          return close(entry)
        for (const leg of entry.legs)
          if (
            leg.resource.key === resource.key &&
            JSON.stringify(leg.resource) === JSON.stringify(resource)
          )
            return stopLeg(entry, leg)
      }
      return undefined
    },
    async retire(generation: string): Promise<readonly ManagedResource[]> {
      retired.add(generation)
      const own = [...entries.values()].filter(entry => entry.generation === generation)
      await Promise.all(own.map(close))
      return own.filter(entry => entry.state !== 'closed').map(entry => entry.backend.resource)
    },
    async maintain(): Promise<number> {
      const pending = [...entries.values()].filter(
        entry => entry.state === 'closing' || (entry.state !== 'closed' && entry.closed()),
      )
      await Promise.all(pending.map(close))
      return pending.filter(entry => entry.state !== 'closed').length
    },
    facade(
      input: Readonly<{
        acquisition: ProviderAcquireInput
        instance: string
        generation: string
        capacity: number
        ordinary: HostTerminals
        reserve: RetainedTerminalFactory
      }>,
    ): HostTerminals {
      const { acquisition, ordinary } = input
      const retention = acquisition.retention
      const tenant = tenantCodec.encode(acquisition.tenant)
      const key =
        retention === undefined || !tenant.ok
          ? undefined
          : JSON.stringify([
              tenant.value,
              chain(retention.scope),
              acquisition.placement.quotaDomain,
              [
                acquisition.placement.provider.name,
                acquisition.placement.provider.generation,
                acquisition.placement.provider.version,
              ],
              input.instance,
            ])
      const owner = {}
      const attached = new Map<string, Entry>()
      const detached = new Set<string>()
      const inFlight = new Set<Promise<unknown>>()
      let sealed = false
      const closed = () =>
        sealed ||
        acquisition.ledger.closed.aborted ||
        retired.has(input.generation) ||
        (retention !== undefined && (retention.released.aborted || retention.ledger.closed.aborted))
      const track = <T>(running: Promise<T>): Promise<T> => {
        inFlight.add(running)
        return running.finally(() => {
          inFlight.delete(running)
        })
      }
      const find = (ref: TerminalRef) => {
        const entry = entries.get(ref.id)
        return entry !== undefined &&
          key !== undefined &&
          entry.key === key &&
          entry.backend.terminal.generation === ref.generation
          ? entry
          : undefined
      }
      const ownLegs = (entry: Entry) => [...entry.legs].filter(leg => leg.owner === owner)
      const pending = () =>
        [...attached.values()].flatMap(entry =>
          ownLegs(entry)
            .filter(leg => !leg.stopped || !leg.recorded)
            .map(leg => leg.resource),
        )
      const detach = async (entry: Entry): Promise<StopStatus> => {
        detached.add(entry.backend.terminal.id)
        const statuses = await Promise.all(ownLegs(entry).map(leg => stopLeg(entry, leg)))
        return statuses.every(status => status === 'confirmed') ? 'confirmed' : 'unconfirmed'
      }
      const create = async (
        request: CreateRequest,
      ): Promise<FacilityResult<{ terminal: TerminalRef }>> => {
        if (closed()) return reject(request.requestId, 'closed')
        if (request.retain !== 'session') return ordinary.facility.create(request)
        if (retention === undefined || key === undefined)
          return reject(request.requestId, 'unsupported')
        const count = [...entries.values()].filter(entry => entry.state !== 'closed').length
        if (count >= input.capacity) return reject(request.requestId, 'busy')
        let entry: Entry | undefined
        const backend = input.reserve({
          request,
          ledger: retention.ledger,
          scope: retention.scope,
          closed: () =>
            entry === undefined || entry.state === 'starting'
              ? closed()
              : entry.closed() || entry.state === 'closing' || entry.state === 'closed',
        })
        if (backend === undefined) return reject(request.requestId, 'unavailable')
        entry = {
          key,
          generation: input.generation,
          scope: retention.scope,
          backend,
          closed: () =>
            retention.released.aborted ||
            retention.ledger.closed.aborted ||
            retired.has(input.generation),
          legs: new Set(),
          state: 'starting',
          running: undefined,
          stopping: undefined,
        }
        entries.set(backend.terminal.id, entry)
        attached.set(backend.terminal.id, entry)
        const answer = await backend.start()
        if (closed() || entry.state !== 'starting') {
          await close(entry)
          return reject(request.requestId, 'closed')
        }
        if (answer.kind === 'done') entry.state = 'live'
        else await close(entry)
        return answer
      }
      const execute = async (request: ExecuteRequest): Promise<FacilityResult<ProcessHandle>> => {
        if (closed()) return reject(request.requestId, 'closed')
        const entry = find(request.terminal)
        if (entry === undefined) return ordinary.facility.execute(request)
        if (!attached.has(request.terminal.id)) return reject(request.requestId, 'notFound')
        if (detached.has(request.terminal.id)) return reject(request.requestId, 'closed')
        if (entry.state !== 'live' || entry.closed()) return reject(request.requestId, 'closed')
        if (entry.backend.information().state === 'invalid')
          return reject(request.requestId, 'unavailable')
        if (entry.running !== undefined) return reject(request.requestId, 'busy')
        const resource: ManagedResource = {
          key: randomUUID(),
          provider: entry.backend.resource.provider,
          reference: {
            kind: 'object',
            entries: [
              { key: 'kind', value: { kind: 'string', value: 'retained-leg' } },
              { key: 'shellKey', value: { kind: 'string', value: entry.backend.resource.key } },
              { key: 'shell', value: entry.backend.resource.reference },
            ],
          },
        }
        const leg: Leg = {
          owner,
          resource,
          ledger: acquisition.ledger,
          execution: { kind: 'notSent' },
          starting: true,
          stopped: false,
          recorded: false,
          cancelled: false,
        }
        entry.running = leg
        entry.legs.add(leg)
        const cancelled = () =>
          closed() ||
          entry.closed() ||
          entry.state !== 'live' ||
          leg.cancelled ||
          detached.has(request.terminal.id)
        try {
          const planned = await leg.ledger.plan(resource)
          if (planned !== 'recorded') {
            leg.stopped = true
            leg.recorded = planned !== 'unavailable'
            return reject(request.requestId, planned)
          }
          if (cancelled()) {
            await recordStop(leg, 'confirmed')
            return reject(request.requestId, 'closed')
          }
          const permit = await leg.ledger.permit(resource.key)
          if (permit !== 'confirmed' || cancelled()) {
            await recordStop(leg, 'confirmed')
            return reject(
              request.requestId,
              cancelled() ? 'closed' : permit === 'confirmed' ? 'unavailable' : permit,
            )
          }
          leg.execution = { kind: 'sent', handle: undefined }
          const answer = await entry.backend.execute(request)
          if (answer.kind !== 'done') {
            if (answer.kind !== 'unknown') await recordStop(leg, 'confirmed')
            return answer
          }
          leg.execution = { kind: 'sent', handle: answer.value }
          leg.starting = false
          const result = answer.value.result.then(async outcome => {
            if (outcome.kind === 'completed') await recordStop(leg, 'confirmed')
            if (entry.running === leg) entry.running = undefined
            return outcome
          })
          if (cancelled()) {
            await stopLeg(entry, leg)
            return reject(request.requestId, 'closed')
          }
          return {
            ...answer,
            value: Object.freeze({
              ...answer.value,
              result,
              async stop(mode: 'graceful' | 'forced') {
                if (leg.stopped) return recordStop(leg, 'confirmed')
                const status = await answer.value.stop(mode)
                const recorded = await recordStop(leg, status)
                if (status === 'confirmed' && entry.running === leg) entry.running = undefined
                return recorded
              },
            }),
          }
        } catch {
          if (leg.execution.kind === 'notSent') await recordStop(leg, 'confirmed')
          return { kind: 'unknown', requestId: request.requestId }
        } finally {
          leg.starting = false
          if (leg.stopped && entry.running === leg) entry.running = undefined
        }
      }
      const facility: TerminalFacility<unknown> = {
        create: request =>
          track(
            create({
              ...request,
              env: { ...request.env },
              ...(request.geometry === undefined ? {} : { geometry: { ...request.geometry } }),
            }),
          ),
        execute: request =>
          track(
            execute({
              ...request,
              terminal: { ...request.terminal },
              ...(request.env === undefined ? {} : { env: { ...request.env } }),
              ...(request.stdin === undefined ? {} : { stdin: request.stdin.slice() }),
            }),
          ),
        async attach(request) {
          if (closed()) return reject(request.requestId, 'closed')
          const entry = find(request.terminal)
          if (entry === undefined) return reject(request.requestId, 'notFound')
          if (detached.has(request.terminal.id) || entry.state !== 'live')
            return reject(request.requestId, 'closed')
          if (entry.closed()) return reject(request.requestId, 'closed')
          if (entry.backend.information().state === 'invalid')
            return reject(request.requestId, 'unavailable')
          attached.set(request.terminal.id, entry)
          return {
            kind: 'done',
            requestId: request.requestId,
            value: { terminal: entry.backend.terminal },
          }
        },
        detach(request: TerminalRequest) {
          if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
          const entry = find(request.terminal)
          if (entry === undefined || !attached.has(request.terminal.id))
            return Promise.resolve(reject(request.requestId, 'notFound'))
          return track(
            detach(entry).then(status => ({
              kind: 'done',
              requestId: request.requestId,
              value: { status },
            })),
          )
        },
        close(request) {
          if (closed()) return Promise.resolve(reject(request.requestId, 'closed'))
          const entry = find(request.terminal)
          if (entry === undefined) return ordinary.facility.close(request)
          return track(
            close(entry).then(status => ({
              kind: 'done',
              requestId: request.requestId,
              value: { status },
            })),
          )
        },
        async list(request) {
          if (closed()) return reject(request.requestId, 'closed')
          const listed = await ordinary.facility.list(request)
          if (closed()) return reject(request.requestId, 'closed')
          if (listed.kind !== 'done') return listed
          return {
            ...listed,
            value: [
              ...listed.value,
              ...[...attached.values()]
                .filter(entry => !detached.has(entry.backend.terminal.id))
                .map(entry => ({
                  ...entry.backend.information(),
                  ...(entry.state === 'closed' ? { state: 'closed' as const } : {}),
                })),
            ],
          }
        },
      }
      return Object.freeze({
        facility,
        seal() {
          sealed = true
          ordinary.seal()
        },
        inFlight: () => inFlight.size + ordinary.inFlight(),
        settled: () => Promise.allSettled([...inFlight, ordinary.settled()]).then(() => undefined),
        async stopAll() {
          await Promise.all([...attached.values()].map(detach))
          return [...(await ordinary.stopAll()), ...pending()]
        },
        unconfirmed: () => [...ordinary.unconfirmed(), ...pending()],
      })
    },
  })
}

export type RetainedTerminalIndex = ReturnType<typeof createRetainedTerminalIndex>
