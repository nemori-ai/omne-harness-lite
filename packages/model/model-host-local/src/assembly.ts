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
import type { ModelFailure, ModelPreparationResources } from '@omne-harness/model-contract'
import type {
  CredentialPort,
  ModelCommands,
  ModelSendBoundary,
} from '@omne-harness/model-contract/provider'
import {
  createNetworkResources,
  type NetworkConfig,
  type NetworkResources,
  type PiFamilyContributions,
  type PiRoute,
  type PiTransportLimits,
} from '@omne-harness/pi-ai-transport'
import {
  createPiSendResources,
  type PiSendResources,
  type PiSendResourcesConfig,
} from './send-resources.ts'

/**
 * The refusal of a preparation lease after the assembly's `close` starts. It names the assembly,
 * not the send resources: the send resources can close on their own and keep their own name.
 */
const ASSEMBLY_CLOSED: ModelFailure = Object.freeze({
  kind: 'unavailable',
  dependency: 'model-host-local',
  diagnostic: 'assembly-closed',
})

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
   * every lease it acquires. After `close` starts, `acquire` returns `unavailable` with the
   * dependency `model-host-local` and the diagnostic `assembly-closed`. A lease acquired before
   * keeps its bindings until its own `release`.
   */
  preparation: ModelPreparationResources<P>
  /**
   * Refuses new send resources and new preparation leases, releases the open send resources, then
   * closes the network resources and waits for every exchange to stop. Both closes run to the end:
   * one failure rejects with that failure, two with one `AggregateError` of both. It does not
   * close `commands` or `credentials`, and it does not release a lease. Idempotent.
   */
  close(): Promise<void>
}>

/** What the assembly needs of the network it creates: its close. */
type ClosableNetwork = Readonly<{ close(): Promise<void> }>

/**
 * The network and the send resources over it, as factories, so a test can observe their closes.
 * `assembleLocalModel` gives the pi factories.
 */
export type AssemblyFactories<P, N extends ClosableNetwork> = Readonly<{
  createNetwork(config: NetworkConfig): N
  createSendResources(
    config: Omit<PiSendResourcesConfig, 'network'> & { network: N },
  ): PiSendResources<P>
}>

/**
 * Composes the local Model send path and the preparation resources. Throws `RangeError`
 * synchronously for a configuration that the network, the transport, the send boundary or the
 * preparation resources refuse.
 */
export function assembleLocalModel<P>(config: LocalModelConfig<P>): LocalModel<P> {
  return assembleOver<P, NetworkResources>({
    config,
    factories: {
      createNetwork: createNetworkResources,
      createSendResources: createPiSendResources<P>,
    },
  })
}

/**
 * Closes what a refused assembly opened: the send resources, if they were built, then the network.
 * No exchange ever ran on this network, so its close only ends the capacity and the idle pool. The
 * caller receives the configuration error; a failure of this close cannot change that answer, so it
 * is dropped here, on purpose, and never left as an unhandled rejection.
 */
function abandon<P>(network: ClosableNetwork, resources: PiSendResources<P> | undefined): void {
  const released = resources === undefined ? Promise.resolve() : resources.close()
  released.finally(() => network.close()).catch(() => undefined)
}

/** The rejection reason of a settled close, or nothing when it resolved. */
async function failureOf(closing: Promise<void>): Promise<readonly unknown[]> {
  const [settled] = await Promise.allSettled([closing])
  return settled?.status === 'rejected' ? [settled.reason] : []
}

/** `assembleLocalModel` over the given factories. */
export function assembleOver<P, N extends ClosableNetwork>(
  input: Readonly<{ config: LocalModelConfig<P>; factories: AssemblyFactories<P, N> }>,
): LocalModel<P> {
  const { config, factories } = input
  // What needs no network is checked and built first, so its refusal leaves nothing open.
  const options = config.preparation
  if (typeof options !== 'object' || options === null)
    throw new RangeError('preparation must be an object')
  const leases = createModelPreparationResources<P>({
    commands: config.commands,
    bindings: config.families,
    supplierOf: options.supplierOf,
    maxCitedCalls: options.maxCitedCalls,
  })
  const network = factories.createNetwork(config.network)
  let resources: PiSendResources<P> | undefined
  let send: ModelSendBoundary<P>
  try {
    resources = factories.createSendResources({
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
  } catch (error) {
    abandon(network, resources)
    throw error
  }
  const opened = resources
  let closing: Promise<void> | undefined
  const preparation: ModelPreparationResources<P> = {
    async acquire(acquireInput) {
      if (closing !== undefined) return { failure: ASSEMBLY_CLOSED }
      return leases.acquire(acquireInput)
    },
  }
  // The send resources release their transports before the network stops. Both closes run to the
  // end; one failure is thrown as it is, two as one `AggregateError`.
  async function closeAll(): Promise<void> {
    const failures = [...(await failureOf(opened.close())), ...(await failureOf(network.close()))]
    const [only, ...more] = failures
    if (more.length > 0)
      throw new AggregateError(
        failures,
        'model-host-local: the send resources and the network resources both failed to close',
      )
    if (failures.length > 0) throw only
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
