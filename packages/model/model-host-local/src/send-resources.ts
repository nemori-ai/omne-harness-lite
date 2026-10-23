// The production send resources of the local host. Each acquire builds one pi transport over a
// credential slot that only that resource can fill. The network resources and the family
// contributions are shared and injected; this module never closes the network.
import type { SendResource, SendResources } from '@omne-harness/model'
import type {
  MaterializedTransport,
  ModelFailure,
  ModelTransport,
  PreparedTransport,
} from '@omne-harness/model-contract'
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

export type PiSendResourcesConfig = Readonly<{
  /** Created and closed by the caller. Every transport of these resources shares it. */
  network: NetworkResources
  families: PiFamilyContributions
  /** Looked up by `supplier.recipient`, e.g. `openrouter`. The caller gives every URL. */
  routes: Readonly<Record<string, PiRoute>>
  limits: PiTransportLimits
}>

/** Production `SendResources` and the close of every resource that is still open. */
export type PiSendResources<P> = SendResources<P> &
  Readonly<{
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
  // The probe checks the configuration once, here, so a bad route or limit fails the assembly
  // and not the first send. It is never used; its close is awaited by `close`.
  const probe = createTransport({ ...config, credential: EMPTY_SLOT })
  const probeClosed: Promise<unknown> = probe.close().then(
    () => null,
    (error: unknown) => error ?? new Error('pi transport probe close failed'),
  )
  const open = new Set<SendResource>()
  let closing: Promise<void> | undefined

  function acquireOne(): SendResource {
    // The secret of the send that is starting. It holds a value only inside startWithCredential.
    let secret: string | undefined
    const produced = new WeakSet<MaterializedTransport>()
    let released: Promise<void> | undefined
    const pi = createTransport({ ...config, credential: { read: () => secret } })
    const transport: ModelTransport = {
      async prepare(request, supplier, dispatch) {
        const prepared = await pi.transport.prepare(request, supplier, dispatch)
        if (!('ok' in prepared)) return prepared
        return { ok: recordingPrepared(prepared.ok, produced) }
      },
    }
    const resource: SendResource = {
      transport,
      startWithCredential(materialized, value, signal) {
        if (released !== undefined) throw new SendResourceDefect('resource-released')
        if (!produced.has(materialized)) throw new SendResourceDefect('foreign-materialization')
        secret = value
        try {
          // The pi transport reads the slot once, inside this synchronous call.
          return materialized.start(signal)
        } finally {
          secret = undefined
        }
      },
      release() {
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
    async acquire(): Promise<AcquireResult> {
      if (closing !== undefined) return { failure: CLOSED }
      return { ok: acquireOne() }
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
): PreparedTransport {
  return {
    async materialize(signal) {
      const materialized = await prepared.materialize(signal)
      if ('ok' in materialized) produced.add(materialized.ok)
      return materialized
    },
    close: () => prepared.close(),
  }
}
