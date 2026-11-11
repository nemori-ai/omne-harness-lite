import type { Context } from '@deepseek-ai/cordis'
import type { CredentialPort } from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'

/**
 * Serves `port` as `modelCredential` on `ctx`, for the life of `ctx`. The port lives only in the
 * closures of the two methods: Cordis hands consumers a proxy of the instance, and `#private`
 * fields fail through it, so a closure is the only place that stays out of reach.
 */
export function serveModelCredential<P>(
  ctx: Context,
  port: CredentialPort<P>,
): ModelCredentialService<P> {
  class PortCredentialService extends ModelCredentialService<P> {
    readonly layerOf: CredentialPort<P>['layerOf']
    readonly resolve: CredentialPort<P>['resolve']

    constructor() {
      super(ctx)
      this.layerOf = query => port.layerOf(query)
      this.resolve = reference => port.resolve(reference)
    }
  }
  return new PortCredentialService()
}

export { ModelInstancesLocalPlugin } from './plugins/instances.ts'
export { ModelConvertersLocalPlugin } from './plugins/converters.ts'
export { createModelRequestPreparationPlugin } from './plugins/preparation.ts'
export type {
  ModelPreparationPlugin,
  ModelPreparationPluginOptions,
  ModelRequestPreparationPluginClass,
} from './plugins/preparation.ts'
export { createModelRuntimeLocalPlugin } from './plugins/host.ts'
export { createModelStreamLocalPlugin } from './plugins/stream-observation.ts'
export { createConfiguredModelRuntimeLocalPlugin } from './plugins/configured-host.ts'
export type { ConfiguredModelHostSettings } from './plugins/configured-host-config.ts'
export type {
  ConfiguredModelHostOptions,
  ConfiguredModelRuntimeLocalPluginClass,
} from './plugins/configured-host.ts'
export type {
  HostEvent,
  ModelHostPluginOptions,
  ModelRuntimeLocalPluginClass,
  ModelRuntimeLocalPluginInstance,
} from './plugins/host.ts'
export { createMemoryResultPushLedger } from './plugins/runtime.ts'
export type {
  DeliveryFailure,
  DeliveryStanding,
  HeldAccount,
  HeldDelivery,
  ResultPushLedger,
  ResultPushLimits,
  ResultPushOptions,
  ResultPushRecord,
  ResultPushRecovery,
  RuntimeEvent,
} from './plugins/runtime.ts'
export { ModelProfilesLocalPlugin } from './plugins/profiles.ts'
export { createModelSendStagePlugin } from './plugins/send-stage.ts'
export type {
  ModelSendStagePluginClass,
  ModelSendStagePluginOptions,
  ModelSendStageSettings,
} from './plugins/send-stage.ts'
