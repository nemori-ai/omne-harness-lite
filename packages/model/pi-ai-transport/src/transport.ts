import type { FixedModelRequest, Supplier, TransportFailure } from '@omne-harness/model-contract'
import type {
  MaterializedLiveTransport,
  MaterializeFailure,
  CostLookupAnswer,
  ModelTransport,
  PreparedTransport,
  TransportDispatch,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  checkConfig,
  routeFor,
  type CheckedConfig,
  type CheckedRoute,
  type PiTransportConfig,
} from './config.ts'
import { isLiveSend, NOT_IN_REQUEST, sendOf, supplierIndex, type PiSend } from './send.ts'
import { materializeLive } from './live/materialize.ts'
import { lookupGenerationCost } from './cost-lookup.ts'
import { materialize, type MaterializedHandle } from './materialized.ts'

export type PiTransport = Readonly<{
  transport: ModelTransport
  /** Asks the route what one earlier request cost; only a route whose accounting states it can answer. */
  lookupCost(supplier: Supplier, request: string, signal: AbortSignal): Promise<CostLookupAnswer>
  close(): Promise<void>
}>

type Child = MaterializedHandle | MaterializedLiveTransport
type PreparedPhase =
  | Readonly<{ kind: 'open'; send: PiSend }>
  | Readonly<{ kind: 'materializing'; send: PiSend; settled: Promise<Child | null> }>
  | Readonly<{ kind: 'materialized'; send: PiSend; child: Child | null }>
  | Readonly<{ kind: 'closing'; done: Promise<void> }>
  | Readonly<{ kind: 'closed'; done: Promise<void> }>

type TransportPhase =
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'closing'; done: Promise<void> }>

export function createPiTransport(config: PiTransportConfig): PiTransport {
  const checked = checkConfig(config)
  const closing = new AbortController()
  const open = new Set<PreparedTransport>()
  let phase: TransportPhase = { kind: 'open' }

  async function prepare(
    request: FixedModelRequest,
    supplier: Supplier,
    dispatch: TransportDispatch,
  ): Promise<Outcome<PreparedTransport, TransportFailure>> {
    if (phase.kind !== 'open') return { failure: TRANSPORT_CLOSED }
    const provider = checked.routes.get(supplier.provider)
    if (provider === undefined)
      return {
        failure: { kind: 'unsupported', field: 'supplier.provider', adapter: supplier.adoption },
      }
    const index = supplierIndex(request, supplier)
    if (index < 0) return { failure: NOT_IN_REQUEST }
    const acquired = await checked.families.acquire(supplier, closing.signal)
    if (!('ok' in acquired)) return acquired
    if (phase.kind !== 'open') {
      await acquired.ok.release()
      return { failure: TRANSPORT_CLOSED }
    }
    const paired = sendOf(acquired.ok, request, index, {
      maxDecisionBytes: checked.limits.maxDecisionBytes,
      json: checked.limits.json,
    })
    if (!('ok' in paired)) {
      await acquired.ok.release()
      return paired
    }
    const send = paired.ok
    const route = routeFor(provider, send.endpoint)
    if (route === undefined) {
      await send.release()
      return { failure: { kind: 'unsupported', field: 'route.endpoint', adapter: send.adoption } }
    }
    const prepared = createPrepared({
      config: checked,
      route,
      supplier,
      resent: Object.freeze([...dispatch.resent]),
      send,
      onClosed: () => open.delete(prepared),
    })
    open.add(prepared)
    return { ok: prepared }
  }

  async function drain(): Promise<void> {
    closing.abort()
    const closes = await Promise.allSettled([...open].map(prepared => prepared.close()))
    const failed = closes.find(close => close.status === 'rejected')
    if (failed !== undefined) throw failed.reason
  }

  function generationOf(supplier: Supplier) {
    const provider = checked.routes.get(supplier.provider)
    if (provider?.accounting.generation === undefined) return undefined
    const [endpoint] = provider.endpoints.values()
    if (endpoint === undefined) return undefined
    return { provider, url: new URL(provider.accounting.generation.path, endpoint.url.origin) }
  }

  function lookupCost(
    supplier: Supplier,
    request: string,
    signal: AbortSignal,
  ): Promise<CostLookupAnswer> {
    const asked = generationOf(supplier)
    if (asked === undefined) return Promise.resolve({ kind: 'unsupported' })
    const { provider, url } = asked
    const secret =
      provider.auth === null ? undefined : checked.credential.read()?.get(provider.auth.item)
    if (phase.kind !== 'open' || secret === undefined)
      return Promise.resolve({ kind: 'unavailable', diagnostic: 'credential-missing' })
    const input = {
      url,
      request,
      secret,
      place: provider.accounting.place,
      costUnit: provider.accounting.costUnit,
      timeoutMs: checked.limits.connectTimeoutMs ?? 30_000,
      maxBodyBytes: checked.limits.maxErrorBodyBytes,
    }
    return lookupGenerationCost(checked.network, input, signal)
  }

  return {
    transport: { prepare },
    lookupCost,
    close() {
      if (phase.kind === 'open') phase = { kind: 'closing', done: drain() }
      return phase.done
    },
  }
}

const TRANSPORT_CLOSED: TransportFailure = Object.freeze({
  kind: 'unavailable',
  dependency: 'pi-transport',
  diagnostic: 'transport-closed',
})

const PREPARED_CLOSED: TransportFailure = Object.freeze({
  kind: 'unavailable',
  dependency: 'pi-transport',
  diagnostic: 'prepared-closed',
})

const REPEATED_MATERIALIZE: TransportFailure = Object.freeze({
  kind: 'invalid',
  field: 'materialize',
  reason: 'repeated',
})

function createPrepared(
  input: Readonly<{
    config: CheckedConfig
    route: CheckedRoute
    supplier: Supplier
    resent: TransportDispatch['resent']
    send: PiSend
    onClosed: () => void
  }>,
): PreparedTransport {
  const { config, route, supplier, resent, onClosed } = input
  const closing = new AbortController()
  let phase: PreparedPhase = { kind: 'open', send: input.send }

  async function runMaterialize(
    send: PiSend,
    signal: AbortSignal,
  ): Promise<Outcome<Child, MaterializeFailure>> {
    const either = AbortSignal.any([signal, closing.signal])
    if (isLiveSend(send)) return materializeLive({ config, route, supplier, send, signal: either })
    const { framing } = route
    if (framing === 'socket')
      return { failure: { kind: 'unsupported', field: 'route.endpoint', adapter: send.adoption } }
    return materialize({
      config,
      route: { ...route, framing },
      supplier,
      resent,
      send,
      signal: either,
    })
  }

  async function close(): Promise<void> {
    const current = phase
    switch (current.kind) {
      case 'closing':
      case 'closed':
        return current.done
      case 'open':
      case 'materializing':
      case 'materialized': {
        const done = closeFrom(current)
        phase = { kind: 'closing', done }
        await done
        phase = { kind: 'closed', done }
        return
      }
      default: {
        const _exhaustive: never = current
        return _exhaustive
      }
    }
  }

  async function closeFrom(
    from: Exclude<PreparedPhase, Readonly<{ kind: 'closing' | 'closed' }>>,
  ): Promise<void> {
    closing.abort()
    try {
      const child = await childOf(from)
      if (child !== null) await child.close()
    } finally {
      onClosed()
      await from.send.release()
    }
  }

  return {
    async materialize(signal) {
      const current = phase
      if (current.kind === 'closing' || current.kind === 'closed')
        return { failure: PREPARED_CLOSED }
      if (current.kind !== 'open') return { failure: REPEATED_MATERIALIZE }
      const running = runMaterialize(current.send, signal)
      const settled = running.then(
        outcome => ('ok' in outcome ? outcome.ok : null),
        () => null,
      )
      phase = { kind: 'materializing', send: current.send, settled }
      const outcome = await running
      if (phase.kind !== 'materializing') return { failure: PREPARED_CLOSED }
      phase = {
        kind: 'materialized',
        send: current.send,
        child: 'ok' in outcome ? outcome.ok : null,
      }
      return outcome
    },
    close,
  }
}

async function childOf(
  phase: Exclude<PreparedPhase, Readonly<{ kind: 'closing' | 'closed' }>>,
): Promise<Child | null> {
  switch (phase.kind) {
    case 'open':
      return null
    case 'materializing':
      return phase.settled
    case 'materialized':
      return phase.child
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}
