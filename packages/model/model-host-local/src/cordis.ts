import type { Context } from '@deepseek-ai/cordis'
import type { CredentialPort, ModelPreferencesPort } from '@omne-harness/model-contract/provider'
import type { ModelDecisionPreparation } from '@omne-harness/model-contract/provider'
import {
  ModelCredentialService,
  ModelDecisionPreparationService,
  ModelPreferencesService,
} from '@omne-harness/model-cordis-contract/cordis'

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

export function serveModelPreferences<P>(
  ctx: Context,
  port: ModelPreferencesPort<P>,
): ModelPreferencesService<P> {
  class PortPreferencesService extends ModelPreferencesService<P> {
    readonly read: ModelPreferencesPort<P>['read']

    constructor() {
      super(ctx)
      this.read = input => port.read(input)
    }
  }
  return new PortPreferencesService()
}

/** Serves the decision preparation on this context: it leaves with the scope that asked for it. */
export function serveModelDecisionPreparation<P>(
  ctx: Context,
  port: ModelDecisionPreparation<P>,
): ModelDecisionPreparationService<P> {
  class PortDecisionPreparation extends ModelDecisionPreparationService<P> {
    readonly prepare: ModelDecisionPreparation<P>['prepare']

    constructor() {
      super(ctx)
      this.prepare = input => port.prepare(input)
    }
  }
  return new PortDecisionPreparation()
}

export { ModelInstancesLocalPlugin } from './plugins/instances.ts'
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
  ModelHostDrain,
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
export { modelProviderCategoryPlugin } from './category.ts'
