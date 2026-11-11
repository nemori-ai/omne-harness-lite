// The production send resources of the local host. Each acquire builds one pi transport over a
// credential slot that only that resource can fill. The network resources and the family
// contributions are shared and injected; this module never closes the network.
import type { SendResource, SendResources } from '@omne-harness/model'
import { isDeepStrictEqual } from 'node:util'
import type {
  DispatchId,
  FixedModelRequest,
  ModelCallId,
  ModelFailure,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  MaterializedTransport,
  ModelTransport,
  PreparedTransport,
  SendDemand,
} from '@omne-harness/model-contract/provider'
import {
  createPiTransport,
  type NetworkResources,
  type PiCredentialSlot,
  type PiFamilyContributions,
  type PiRoute,
  type PiTransport,
  type PiTransportConfig,
  type PiTransportLimits,
} from '@omne-harness/pi-ai-transport'
import {
  materializationRecords,
  SOURCE_UNAVAILABLE,
  type PiMaterializationOptions,
  type ModelMaterializationEvidenceReader,
} from './materialization-proof.ts'

export type RequestDisclosure = (request: FixedModelRequest) => TransportFailure | null

export type PiSendResourcesConfig = Readonly<{
  /** Created and closed by the caller. Every transport of these resources shares it. */
  network: NetworkResources
  families: PiFamilyContributions
  /** Looked up by `supplier.provider`, e.g. `openrouter`. The caller gives every URL. */
  routes: Readonly<Record<string, PiRoute>>
  limits: PiTransportLimits
  materialization: PiMaterializationOptions
  /** Fixed for this activation. A refusal leaves the request unchanged and prevents encoding. */
  requestDisclosure?: RequestDisclosure
  /**
   * Told before each retry of a send whose request bytes had not left (`limits.connectRetry`), with
   * the call and the dispatch that retries. A throw is dropped. Absent: nobody is told.
   */
  onConnectRetry?: (retry: ConnectRetryReport) => void
}>

/** One retry of one send: who retries, which retry it is, the wait before it and why. */
export type ConnectRetryReport = Readonly<{
  call: ModelCallId
  dispatch: DispatchId
  attempt: number
  delayMs: number
  reason: 'connect-failed' | 'connect-timeout'
}>

/** Production `SendResources` and the close of every resource that is still open. */
export type PiSendResources<P> = SendResources<P> &
  Readonly<{
    materialization: ModelMaterializationEvidenceReader
    /**
     * Refuses new acquires, releases every open resource and waits for the release. It does not
     * close the network resources. Idempotent.
     */
    close(): Promise<void>
  }>

/** Why a send resource refused a call that only a program defect can make. */
export type SendResourceDefectReason = 'foreign-materialization' | 'resource-released'

/**
 * A program defect at the send resource: the caller gave a materialized transport that this
 * resource did not produce, or used the resource after its release. The message names the reason
 * only; it never holds a credential value.
 */
export class SendResourceDefect extends Error {
  readonly reason: SendResourceDefectReason
  constructor(reason: SendResourceDefectReason) {
    super(`model-host-local send resource: ${reason}`)
    this.name = 'SendResourceDefect'
    this.reason = reason
  }
}

type AcquireResult = Awaited<ReturnType<SendResources<unknown>['acquire']>>

const CLOSED: ModelFailure = Object.freeze({
  kind: 'unavailable',
  dependency: 'pi-send-resources',
  diagnostic: 'send-resources-closed',
})

/** The slot of the configuration probe: it never holds a value. */
const EMPTY_SLOT: PiCredentialSlot = Object.freeze({ read: () => undefined })

/**
 * Builds production send resources over the pi transport. Throws `RangeError` synchronously when
 * the transport refuses the configuration.
 */
export function createPiSendResources<P>(config: PiSendResourcesConfig): PiSendResources<P> {
  return sendResourcesOver<P>({ config, createTransport: createPiTransport })
}

/**
 * The send resources over a transport factory. `createPiSendResources` gives the pi factory; the
 * package tests give one that observes the credential slot.
 */
export function sendResourcesOver<P>(
  input: Readonly<{
    config: PiSendResourcesConfig
    createTransport: (config: PiTransportConfig) => PiTransport
  }>,
): PiSendResources<P> {
  const { config, createTransport } = input
  // The report hook is the send resources' own: the transport gets one per send, below.
  const { onConnectRetry, requestDisclosure, ...transportBase } = config
  const proofs = materializationRecords(config.materialization)
  // The probe checks the configuration once, here, so a bad route or limit fails the assembly
  // and not the first send. It is never used; its close is awaited by `close`.
  const probe = createTransport({ ...transportBase, credential: EMPTY_SLOT })
  const probeClosed: Promise<unknown> = probe.close().then(
    () => null,
    (error: unknown) => error ?? new Error('pi transport probe close failed'),
  )
  const open = new Set<SendResource>()
  let closing: Promise<void> | undefined

  function acquireOne(demand: SendDemand<P>, owner: object): SendResource {
    // The secrets of the send that is starting, by credential item. They are held only inside
    // startWithCredential.
    let secrets: ReadonlyMap<string, string> | undefined
    const produced = new WeakSet<MaterializedTransport>()
    let released: Promise<void> | undefined
    let inactive = false
    let preparation: ReturnType<ModelTransport['prepare']> | undefined
    const pi = createTransport({
      ...transportBase,
      credential: { read: () => secrets },
      ...(onConnectRetry === undefined
        ? {}
        : {
            onConnectRetry: event =>
              onConnectRetry({
                call: demand.call,
                dispatch: demand.dispatch,
                attempt: event.attempt,
                delayMs: event.delayMs,
                reason: event.reason,
              }),
          }),
    })
    const transport: ModelTransport = {
      prepare(request, supplier, dispatch) {
        if (inactive) return Promise.resolve({ failure: SOURCE_UNAVAILABLE })
        if (
          !isDeepStrictEqual(request, demand.request) ||
          !isDeepStrictEqual(supplier, demand.supplier) ||
          dispatch.resent.length !== 0
        )
          return Promise.resolve({
            failure: { kind: 'invalid', field: 'demand', reason: 'binding' },
          })
        preparation ??= (async () => {
          const refusal = requestDisclosure?.(request)
          if (refusal !== undefined && refusal !== null) return { failure: refusal }
          const prepared = await pi.transport.prepare(request, supplier, dispatch)
          if (!('ok' in prepared)) return prepared
          if (inactive) {
            await prepared.ok.close()
            return { failure: SOURCE_UNAVAILABLE }
          }
          return {
            ok: recordingPrepared(prepared.ok, produced, materialized => {
              if (inactive) return SOURCE_UNAVAILABLE
              return proofs.record(owner, demand, materialized.receipt)
            }),
          }
        })()
        return preparation
      },
    }
    const resource: SendResource = {
      transport,
      startWithCredential(materialized, value, signal) {
        if (inactive) throw new SendResourceDefect('resource-released')
        if (!produced.has(materialized)) throw new SendResourceDefect('foreign-materialization')
        secrets = value
        try {
          // The pi transport reads the slot once, inside this synchronous call.
          return materialized.start(signal)
        } finally {
          secrets = undefined
        }
      },
      release() {
        inactive = true
        proofs.release(owner, demand)
        released ??= (async () => {
          open.delete(resource)
          await pi.close()
        })()
        return released
      },
    }
    open.add(resource)
    return resource
  }

  async function closeAll(): Promise<void> {
    const releases = await Promise.allSettled([...open].map(resource => resource.release()))
    const probeFailure = await probeClosed
    const failed = releases.find(release => release.status === 'rejected')
    if (failed !== undefined) throw failed.reason
    if (probeFailure !== null) throw probeFailure
  }

  return {
    materialization: proofs.reader,
    async acquire(input): Promise<AcquireResult> {
      if (closing !== undefined) return { failure: CLOSED }
      const qualification = config.materialization.execution(input.execution)
      if ('failure' in qualification) return qualification
      const { principal, tenant, execution, ...binding } = input
      const demand = { ...structuredClone(binding), principal, tenant, execution: { ...execution } }
      const owner = {}
      const failure = proofs.reserve(owner, demand)
      if (failure !== null) return { failure }
      try {
        return { ok: acquireOne(demand, owner) }
      } catch (error) {
        proofs.release(owner, demand)
        throw error
      }
    },
    close() {
      closing ??= closeAll()
      return closing
    },
  }
}

/** Delegates to the prepared transport and records each materialized transport it hands out. */
function recordingPrepared(
  prepared: PreparedTransport,
  produced: WeakSet<MaterializedTransport>,
  record: (materialized: MaterializedTransport) => TransportFailure | null,
): PreparedTransport {
  let result: ReturnType<PreparedTransport['materialize']> | undefined
  return {
    materialize(signal) {
      result ??= (async () => {
        const materialized = await prepared.materialize(signal)
        if ('failure' in materialized) return materialized
        const failure = record(materialized.ok)
        if (failure !== null) {
          await materialized.ok.close()
          return { failure }
        }
        produced.add(materialized.ok)
        return materialized
      })()
      return result
    },
    close: () => prepared.close(),
  }
}
