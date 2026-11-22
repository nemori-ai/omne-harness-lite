import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createModelChoices, type ModelChoices } from './choices.ts'

/** The models of a tenant, on the client tree while `model/v1` is mounted. */
export const modelChoicesKey = serviceKey<ModelChoices>('model.choices')

// The module places nothing in the shell: it gives other modules a list to choose from.
export const modelUiModule = defineUiModule({
  name: 'model-ui',
  needs: { model: needProtocol<ClientOf<ModelProtocol>>(modelProtocol) },
  apply(_shell, { model }, provide) {
    provide(modelChoicesKey, createModelChoices(model))
  },
})
