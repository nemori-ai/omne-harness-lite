// The pi transport: `createPiTransport` returns a `ModelTransport` that prepares through a family
// binding, materializes one payload under a capacity reservation and starts one exchange. This
// module owns the outer lifecycle and the prepared transports; materialized.ts owns one send.
import type {
  FixedModelRequest,
  ModelTransport,
  PreparedTransport,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { checkConfig, type CheckedConfig, type PiTransportConfig } from './config.ts'
import type { PiFamilyBinding } from './family.ts'
import { materialize, type MaterializedHandle } from './materialized.ts'

export type PiTransport = Readonly<{
  transport: ModelTransport
  /**
   * Refuses new prepares, closes every prepared and materialized transport that is still open,
   * and resolves after their exchanges stopped physically and their family bindings were
   * released. It does not close the network resources. Idempotent.
   */
  close(): Promise<void>
}>

/**
 * `open`: holds the family binding. `materializing`: one materialize runs; the binding is held.
 * `materialized`: the one materialization was handed out. `closing`: the close runs. `closed`:
 * the binding is released.
 */
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

/**
 * Builds a pi transport over injected network resources, family contributions and credential
 * slot. Throws `RangeError` synchronously for a configuration out of its rules.
 */
export function createPiTransport(config: PiTransportConfig): PiTransport {
  const checked = checkConfig(config)
  /** Ends the family acquires that are still running when the transport closes. */
  const closing = new AbortController()
  const open = new Set<PreparedTransport>()
  let phase: TransportPhase = { kind: 'open' }

  async function prepare(
    request: FixedModelRequest,
    supplier: Supplier,
  ): Promise<Outcome<PreparedTransport, TransportFailure>> {
    if (phase.kind !== 'open') return { failure: TRANSPORT_CLOSED }
    if (!checked.routes.has(supplier.recipient))
      return {
        failure: { kind: 'unsupported', field: 'supplier.recipient', adapter: supplier.adoption },
      }
    const acquired = await checked.families.acquire(supplier, closing.signal)
    if (!('ok' in acquired)) return acquired
    if (phase.kind !== 'open') {
      await acquired.ok.release()
      return { failure: TRANSPORT_CLOSED }
    }
    const prepared = createPrepared({
      config: checked,
      request,
      supplier,
      binding: acquired.ok,
      onClosed: () => open.delete(prepared),
    })
    open.add(prepared)
    return { ok: prepared }
  }

  async function drain(): Promise<void> {
    closing.abort()
    await Promise.all([...open].map(prepared => prepared.close()))
  }

  return {
    transport: { prepare },
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
    request: FixedModelRequest
    supplier: Supplier
    binding: PiFamilyBinding
    onClosed: () => void
  }>,
): PreparedTransport {
  const { config, request, supplier, onClosed } = input
  /** Ends a materialize that still waits for capacity when this prepared transport closes. */
  const closing = new AbortController()
  let phase: PreparedPhase = { kind: 'open', binding: input.binding }

  async function runMaterialize(
    binding: PiFamilyBinding,
    signal: AbortSignal,
  ): Promise<Outcome<MaterializedHandle, TransportFailure>> {
    const route = config.routes.get(supplier.recipient)
    if (route === undefined) throw new Error('the route of a prepared transport is missing')
    return materialize({
      config,
      route,
      request,
      supplier,
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

  /** Ends the materialization first, then releases the binding. */
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
      // A close that started meanwhile waits for `settled` and closes the child itself.
      if (phase.kind === 'materializing')
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

/** The materialization of a prepared transport, once any running materialize has settled. */
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
