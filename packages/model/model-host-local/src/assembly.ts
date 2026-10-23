// The local Model assembly: credential custody, the Model send boundary, the pi transport with the
// given families, the injected ModelCommands, and the preparation resources over the same families
// and Commands. It only composes; every limit, route, proxy and margin comes from the configuration.
// Its `close` is the one end of both parts: after it starts, neither gives out a new resource.
import {
  createModelPreparationResources,
  createModelSendBoundary,
  type SendCoordinator,
  type SupplierPort,
} from '@omne-harness/model'
import type {
  CredentialPort,
  ModelCommands,
  ModelPreparationResources,
  ModelSendBoundary,
} from '@omne-harness/model-contract'
import {
  createNetworkResources,
  type NetworkConfig,
  type PiFamilyContributions,
  type PiRoute,
  type PiTransportLimits,
} from '@omne-harness/pi-ai-transport'
import {
  createPiSendResources,
  SEND_RESOURCES_CLOSED,
  type PiSendResources,
} from './send-resources.ts'

export type LocalModelConfig<P> = Readonly<{
  /** The credential custody, e.g. a local custodian. The send boundary resolves through it. */
  credentials: CredentialPort
  /** The authority of calls, dispatches and accounts. The caller owns it and keeps it open. */
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P>
  /** The composed family contributions, e.g. `composeFamilies([openAi, anthropic])`. */
  families: PiFamilyContributions
  /** The assembly creates the network resources from this and closes them in `close`. */
  network: NetworkConfig
  /** Every recipient and its URL, e.g. `openrouter`. The package holds no URL. */
  routes: Readonly<Record<string, PiRoute>>
  transportLimits: PiTransportLimits
  maxRetainedAttempts: number
  /**
   * The preparation resources: the leases read call facts from `commands` and take bindings from
   * `families`. The margin is the family's own configuration; this package adds no default.
   */
  preparation: Readonly<{
    /** The most distinct calls one lineage may name. */
    maxCitedCalls: number
    /** Completes a profile supplier with its credential reference, as request preparation does. */
    supplierOf: SupplierPort<P>
  }>
}>

export type LocalModel<P> = Readonly<{
  send: ModelSendBoundary<P>
  /**
   * The production `ModelPreparationResources` over `families` and `commands`. The caller releases
   * every lease it acquires. After `close` starts, `acquire` returns the same `unavailable` failure
   * as the send resources. A lease acquired before keeps its bindings until its own `release`.
   */
  preparation: ModelPreparationResources<P>
  /**
   * Refuses new send resources and new preparation leases, releases the open send resources, then
   * closes the network resources and waits for every exchange to stop. It does not close
   * `commands` or `credentials`, and it does not release a lease. Idempotent.
   */
  close(): Promise<void>
}>

/**
 * Composes the local Model send path and the preparation resources. Throws `RangeError`
 * synchronously for a configuration that the network, the transport, the send boundary or the
 * preparation resources refuse.
 */
export function assembleLocalModel<P>(config: LocalModelConfig<P>): LocalModel<P> {
  const network = createNetworkResources(config.network)
  let resources: PiSendResources<P>
  let send: ModelSendBoundary<P>
  let leases: ModelPreparationResources<P>
  try {
    resources = createPiSendResources<P>({
      network,
      families: config.families,
      routes: config.routes,
      limits: config.transportLimits,
    })
    send = createModelSendBoundary<P>({
      commands: config.commands,
      coordinator: config.coordinator,
      credentials: config.credentials,
      resources,
      maxRetainedAttempts: config.maxRetainedAttempts,
    })
    const options = config.preparation
    if (typeof options !== 'object' || options === null)
      throw new RangeError('preparation must be an object')
    leases = createModelPreparationResources<P>({
      commands: config.commands,
      bindings: config.families,
      supplierOf: options.supplierOf,
      maxCitedCalls: options.maxCitedCalls,
    })
  } catch (error) {
    // No exchange ever ran on this network: its close releases the pool and the capacity before
    // it returns, and the promise only waits for an empty set of exchanges.
    void network.close()
    throw error
  }
  let closing: Promise<void> | undefined
  const preparation: ModelPreparationResources<P> = {
    async acquire(input) {
      if (closing !== undefined) return { failure: SEND_RESOURCES_CLOSED }
      return leases.acquire(input)
    },
  }
  async function closeAll(): Promise<void> {
    const released = await Promise.allSettled([resources.close()])
    await network.close()
    const failed = released.find(result => result.status === 'rejected')
    if (failed !== undefined) throw failed.reason
  }
  return {
    send,
    preparation,
    close() {
      closing ??= closeAll()
      return closing
    },
  }
}
