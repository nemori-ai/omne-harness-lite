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
  network: NetworkResources
  families: PiFamilyContributions
  routes: Readonly<Record<string, PiRoute>>
  limits: PiTransportLimits
  materialization: PiMaterializationOptions
  requestDisclosure?: RequestDisclosure
  onConnectRetry?: (retry: ConnectRetryReport) => void
}>

export type ConnectRetryReport = Readonly<{
  call: ModelCallId
  dispatch: DispatchId
  attempt: number
  delayMs: number
  reason: 'connect-failed' | 'connect-timeout'
}>

export type PiSendResources<P> = SendResources<P> &
  Readonly<{
    materialization: ModelMaterializationEvidenceReader
    close(): Promise<void>
  }>

export type SendResourceDefectReason = 'foreign-materialization' | 'resource-released'

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

const EMPTY_SLOT: PiCredentialSlot = Object.freeze({ read: () => undefined })

export function createPiSendResources<P>(config: PiSendResourcesConfig): PiSendResources<P> {
  return sendResourcesOver<P>({ config, createTransport: createPiTransport })
}

export function sendResourcesOver<P>(
  input: Readonly<{
    config: PiSendResourcesConfig
    createTransport: (config: PiTransportConfig) => PiTransport
  }>,
): PiSendResources<P> {
  const { config, createTransport } = input
  const { onConnectRetry, requestDisclosure, ...transportBase } = config
  const proofs = materializationRecords(config.materialization)
  // The probe checks the configuration once, so a bad route or limit fails the assembly, not the
  // first send. It is never used; its close is awaited by close.
  const probe = createTransport({ ...transportBase, credential: EMPTY_SLOT })
  const probeClosed: Promise<unknown> = probe.close().then(
    () => null,
    (error: unknown) => error ?? new Error('pi transport probe close failed'),
  )
  const open = new Set<SendResource>()
  let closing: Promise<void> | undefined

  function acquireOne(demand: SendDemand<P>, owner: object): SendResource {
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
