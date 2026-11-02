import { Service, type Context } from '@deepseek-ai/cordis'
import { createModelRuntime } from '@omne-harness/model'
import type { ModelRetryPolicy, ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  modelClockKey,
  modelCommandsKey,
  modelHostAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  configuredModelHostConfigSchema,
  type ConfiguredModelHostSettings,
} from './configured-host-config.ts'
import {
  createModelRuntimeLocalPlugin,
  type ModelHostPluginOptions,
  type ModelRuntimeLocalPluginInstance,
} from './host.ts'
import type { ResultPushLedger } from './runtime.ts'

export type ConfiguredModelHostOptions = Pick<
  ModelHostPluginOptions,
  'qualifyObservation' | 'executionChannel' | 'releaseExecution' | 'observation'
> &
  Readonly<{
    /** The stage bridge owns the send boundary and its resources. */
    send: ModelSendBoundary<unknown>
    /** The assembly retains this ledger for a successor host. */
    ledger: ResultPushLedger
  }>

export type ConfiguredModelRuntimeLocalPluginClass = {
  new (ctx: Context, settings: ConfiguredModelHostSettings): ModelRuntimeLocalPluginInstance
  readonly inject: string[]
  readonly Config: typeof configuredModelHostConfigSchema
}

const unavailableRetry: ModelRetryPolicy<unknown> = {
  inspect: async () => ({
    failure: {
      kind: 'unavailable',
      dependency: 'model-retry-policy',
      diagnostic: 'not-configured',
    },
  }),
  decide: async () => ({
    failure: {
      kind: 'unavailable',
      dependency: 'model-retry-policy',
      diagnostic: 'not-configured',
    },
  }),
}

/** Builds the configured runtime through the existing host's bind and shutdown lifecycle. */
export function createConfiguredModelRuntimeLocalPlugin(
  options: ConfiguredModelHostOptions,
): ConfiguredModelRuntimeLocalPluginClass {
  return class ConfiguredModelRuntimeLocalPlugin {
    static readonly inject = [modelCommandsKey, modelClockKey, modelHostAuthorityKey]
    static readonly Config = configuredModelHostConfigSchema
    declare readonly [Service.init]: () => Promise<void>

    constructor(ctx: Context, settings: ConfiguredModelHostSettings) {
      const Plugin = createModelRuntimeLocalPlugin({
        ...(options.executionChannel !== undefined && {
          executionChannel: options.executionChannel,
        }),
        ...(options.releaseExecution !== undefined && {
          releaseExecution: options.releaseExecution,
        }),
        ...(options.observation !== undefined && { observation: options.observation }),
        qualifyObservation: options.qualifyObservation,
        results: { ledger: options.ledger, limits: settings.results },
        provider: ({ host, commands, clock }) =>
          createModelRuntime(
            {
              commands,
              clock,
              instances: host,
              send: options.send,
              retry: unavailableRetry,
            },
            settings.runtime,
          ),
      })
      return new Plugin(ctx, settings.host)
    }
  }
}
