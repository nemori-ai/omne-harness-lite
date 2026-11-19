import type {
  FixedModelRequest,
  ReplayDeclaration,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
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
import type { PiFamilyBinding } from './family.ts'
import { lookupGenerationCost } from './cost-lookup.ts'
import { materialize, type MaterializedHandle } from './materialized.ts'

export type PiTransport = Readonly<{
  transport: ModelTransport
  /** Asks the route what one earlier request cost; only an OpenRouter route can answer. */
  lookupCost(supplier: Supplier, request: string, signal: AbortSignal): Promise<CostLookupAnswer>
  close(): Promise<void>
}>

type PreparedPhase =
  | Readonly<{ kind: 'open'; binding: PiFamilyBinding }>
  | Readonly<{
      kind: 'materializing'
      binding: PiFamilyBinding
      settled: Promise<MaterializedHandle | null>
    }>
  | Readonly<{ kind: 'materialized'; binding: PiFamilyBinding; child: MaterializedHandle | null }>
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
    const declaration = declarationOf(request, supplier)
    if (declaration === null) return { failure: NOT_IN_REQUEST }
    const acquired = await checked.families.acquire(supplier, closing.signal)
    if (!('ok' in acquired)) return acquired
    if (phase.kind !== 'open') {
      await acquired.ok.release()
      return { failure: TRANSPORT_CLOSED }
    }
    const route = routeFor(provider, acquired.ok.endpoint)
    if (route === undefined) {
      await acquired.ok.release()
      const adapter = acquired.ok.adoption
      return { failure: { kind: 'unsupported', field: 'route.endpoint', adapter } }
    }
    const prepared = createPrepared({
      config: checked,
      route,
      request,
      supplier,
      declaration,
      resent: Object.freeze([...dispatch.resent]),
      binding: acquired.ok,
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

  function lookupCost(
    supplier: Supplier,
    request: string,
    signal: AbortSignal,
  ): Promise<CostLookupAnswer> {
    const provider = checked.routes.get(supplier.provider)
    const endpoint = provider?.endpoints.values().next().value
    if (
      provider === undefined ||
      endpoint === undefined ||
      provider.accounting.place !== 'openrouter'
    )
      return Promise.resolve({ kind: 'unsupported' })
    const secret =
      provider.auth === null ? undefined : checked.credential.read()?.get(provider.auth.item)
    if (phase.kind !== 'open' || secret === undefined)
      return Promise.resolve({ kind: 'unavailable', diagnostic: 'credential-missing' })
    const input = {
      url: new URL('/api/v1/generation', endpoint.url.origin),
      request,
      secret,
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

const NOT_IN_REQUEST: TransportFailure = Object.freeze({
  kind: 'invalid',
  field: 'supplier',
  reason: 'not-in-request',
})

function sameSupplier(left: Supplier, right: Supplier): boolean {
  return (
    left.credential.layer === right.credential.layer &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.adoption.owner === right.adoption.owner &&
    left.adoption.name === right.adoption.name &&
    left.adoption.revision === right.adoption.revision &&
    left.adoption.digest === right.adoption.digest
  )
}

function declarationOf(request: FixedModelRequest, supplier: Supplier): ReplayDeclaration | null {
  const index = request.suppliers.findIndex(item => sameSupplier(item, supplier))
  return index < 0 ? null : (request.declarations[index] ?? null)
}

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
    request: FixedModelRequest
    supplier: Supplier
    declaration: ReplayDeclaration
    resent: TransportDispatch['resent']
    binding: PiFamilyBinding
    onClosed: () => void
  }>,
): PreparedTransport {
  const { config, route, request, supplier, declaration, resent, onClosed } = input
  const closing = new AbortController()
  let phase: PreparedPhase = { kind: 'open', binding: input.binding }

  async function runMaterialize(
    binding: PiFamilyBinding,
    signal: AbortSignal,
  ): Promise<Outcome<MaterializedHandle, TransportFailure>> {
    return materialize({
      config,
      route,
      request,
      supplier,
      declaration,
      resent,
      binding,
      signal: AbortSignal.any([signal, closing.signal]),
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
      await from.binding.release()
    }
  }

  return {
    async materialize(signal) {
      const current = phase
      if (current.kind === 'closing' || current.kind === 'closed')
        return { failure: PREPARED_CLOSED }
      if (current.kind !== 'open') return { failure: REPEATED_MATERIALIZE }
      const running = runMaterialize(current.binding, signal)
      const settled = running.then(
        outcome => ('ok' in outcome ? outcome.ok : null),
        () => null,
      )
      phase = { kind: 'materializing', binding: current.binding, settled }
      const outcome = await running
      if (phase.kind !== 'materializing') return { failure: PREPARED_CLOSED }
      phase = {
        kind: 'materialized',
        binding: current.binding,
        child: 'ok' in outcome ? outcome.ok : null,
      }
      return outcome
    },
    close,
  }
}

async function childOf(
  phase: Exclude<PreparedPhase, Readonly<{ kind: 'closing' | 'closed' }>>,
): Promise<MaterializedHandle | null> {
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
