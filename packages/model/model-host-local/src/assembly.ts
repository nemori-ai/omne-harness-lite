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
  type ConnectRetryReport,
  type PiSendResources,
  type PiSendResourcesConfig,
} from './send-resources.ts'
import type {
  ModelMaterializationEvidenceReader,
  PiMaterializationOptions,
} from './materialization-proof.ts'

const ASSEMBLY_CLOSED: ModelFailure = Object.freeze({
  kind: 'unavailable',
  dependency: 'model-host-local',
  diagnostic: 'assembly-closed',
})

export type LocalModelConfig<P> = Readonly<{
  credentials: CredentialPort<P>
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P>
  families: PiFamilyContributions
  network: NetworkConfig
  routes: Readonly<Record<string, PiRoute>>
  transportLimits: PiTransportLimits
  maxRetainedAttempts: number
  materialization: PiMaterializationOptions
  requestDisclosure?: PiSendResourcesConfig['requestDisclosure']
  onConnectRetry?: (retry: ConnectRetryReport) => void
  preparation: Readonly<{
    maxCitedCalls: number
    supplierOf: SupplierPort<P>
  }>
}>

export type LocalModel<P> = Readonly<{
  send: ModelSendBoundary<P>
  materialization: ModelMaterializationEvidenceReader
  preparation: ModelPreparationResources<P>
  close(): Promise<void>
}>

type ClosableNetwork = Readonly<{ close(): Promise<void> }>

export type AssemblyFactories<P, N extends ClosableNetwork> = Readonly<{
  createNetwork(config: NetworkConfig): N
  createSendResources(
    config: Omit<PiSendResourcesConfig, 'network'> & { network: N },
  ): PiSendResources<P>
}>

export function assembleLocalModel<P>(config: LocalModelConfig<P>): LocalModel<P> {
  return assembleOver<P, NetworkResources>({
    config,
    factories: {
      createNetwork: createNetworkResources,
      createSendResources: createPiSendResources<P>,
    },
  })
}

function abandon<P>(network: ClosableNetwork, resources: PiSendResources<P> | undefined): void {
  const released = resources === undefined ? Promise.resolve() : resources.close()
  released.finally(() => network.close()).catch(() => undefined)
}

async function failureOf(closing: Promise<void>): Promise<readonly unknown[]> {
  const [settled] = await Promise.allSettled([closing])
  return settled?.status === 'rejected' ? [settled.reason] : []
}

export function assembleOver<P, N extends ClosableNetwork>(
  input: Readonly<{ config: LocalModelConfig<P>; factories: AssemblyFactories<P, N> }>,
): LocalModel<P> {
  const { config, factories } = input
  if (
    !config.materialization ||
    !Number.isSafeInteger(config.materialization.maxRecords) ||
    config.materialization.maxRecords <= 0 ||
    config.materialization.maxRecords < config.maxRetainedAttempts ||
    typeof config.materialization.execution !== 'function'
  )
    throw new RangeError('materialization.maxRecords must cover maxRetainedAttempts')
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
      materialization: config.materialization,
      ...(config.requestDisclosure === undefined
        ? {}
        : { requestDisclosure: config.requestDisclosure }),
      ...(config.onConnectRetry === undefined ? {} : { onConnectRetry: config.onConnectRetry }),
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
    materialization: opened.materialization,
    preparation,
    close() {
      closing ??= closeAll()
      return closing
    },
  }
}
