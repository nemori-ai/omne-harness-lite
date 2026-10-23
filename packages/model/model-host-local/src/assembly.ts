// The local Model assembly: credential custody, the Model send boundary, the pi transport with the
// given families, and the injected ModelCommands. It only composes; every limit, route and proxy
// comes from the configuration.
import { createModelSendBoundary, type SendCoordinator } from '@omne-harness/model'
import type { CredentialPort, ModelCommands, ModelSendBoundary } from '@omne-harness/model-contract'
import {
  createNetworkResources,
  type NetworkConfig,
  type PiFamilyContributions,
  type PiRoute,
  type PiTransportLimits,
} from '@omne-harness/pi-ai-transport'
import { createPiSendResources, type PiSendResources } from './send-resources.ts'

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
}>

export type LocalModel<P> = Readonly<{
  send: ModelSendBoundary<P>
  /**
   * Refuses new send resources, releases the open ones, then closes the network resources and
   * waits for every exchange to stop. It does not close `commands` or `credentials`. Idempotent.
   */
  close(): Promise<void>
}>

/**
 * Composes the local Model send path. Throws `RangeError` synchronously for a configuration that
 * the network, the transport or the send boundary refuses.
 */
export function assembleLocalModel<P>(config: LocalModelConfig<P>): LocalModel<P> {
  const network = createNetworkResources(config.network)
  let resources: PiSendResources<P>
  let send: ModelSendBoundary<P>
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
  } catch (error) {
    // No exchange ever ran on this network: its close releases the pool and the capacity before
    // it returns, and the promise only waits for an empty set of exchanges.
    void network.close()
    throw error
  }
  let closing: Promise<void> | undefined
  async function closeAll(): Promise<void> {
    const released = await Promise.allSettled([resources.close()])
    await network.close()
    const failed = released.find(result => result.status === 'rejected')
    if (failed !== undefined) throw failed.reason
  }
  return {
    send,
    close() {
      closing ??= closeAll()
      return closing
    },
  }
}
