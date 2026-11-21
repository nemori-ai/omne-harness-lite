import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createModelChoices, type ModelChoices } from './choices.ts'

export const modelClientService = protocolServiceName({
  name: modelProtocol.name,
  major: modelProtocol.major,
})

/** The models of a tenant, on the client tree while `model/v1` is mounted. */
export const modelChoicesKey = serviceKey<ModelChoices>('model.choices')

// The module places nothing in the shell: it gives other modules a list to choose from.
export const modelUiModule = defineUiModule<Record<string, ClientOf<ModelProtocol>>>({
  name: 'model-ui',
  inject: [modelClientService],
  apply(_shell, services, provide) {
    provide(modelChoicesKey, createModelChoices(services[modelClientService]!))
  },
})
