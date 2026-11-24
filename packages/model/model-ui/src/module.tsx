import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, serviceKey, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createModelChoices, type ModelChoices } from './choices.ts'
import { CredentialRemedy, failedOnCredential } from './view/credential-remedy.tsx'

/** The models of a tenant, on the client tree while `model/v1` is mounted. */
export const modelChoicesKey = serviceKey<ModelChoices>('model.choices')

/** The category Model registers its providers under, the same as `MODEL_PROVIDER_CATEGORY`. */
export const PROVIDER_CATEGORY = 'model-provider'

export const CREDENTIAL_REMEDY_ID = 'model-credential'

type RunFailure = Readonly<{ session: string; cause: string; detail: string | null }>

/** What the assembly hands in: where a failed run is told, and where the keys of providers are filled in. */
export type ModelUiOptions = Readonly<{
  runFailure?: PointSink<RunFailure>
  providers?: Readonly<{ page: string; subject: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>

export function createModelUiModule(options: ModelUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'model-ui',
    needs: { model: needProtocol<ClientOf<ModelProtocol>>(modelProtocol) },
    apply(shell, { model }, provide) {
      provide(modelChoicesKey, createModelChoices(model))
      const { providers } = options
      const fill =
        providers === undefined
          ? undefined
          : () => shell.navigate(providers.page, providers.subject)
      options.runFailure?.contribute(shell, {
        id: CREDENTIAL_REMEDY_ID,
        order: 0,
        render: ({ subject }) =>
          failedOnCredential(subject.detail) ? <CredentialRemedy fill={fill} /> : null,
      })
    },
  })
}
