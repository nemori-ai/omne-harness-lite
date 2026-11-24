import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  needPoint,
  needProtocol,
  serviceKey,
  type KeyedPointSink,
  type PointSink,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createModelChoices, type ModelChoices } from './choices.ts'
import type { AssetPort } from './view/asset-body.ts'
import { CredentialRemedy, failedOnCredential } from './view/credential-remedy.tsx'
import { ProviderBlock } from './view/provider-block.tsx'

/** The models of a tenant, on the client tree while `model/v1` is mounted. */
export const modelChoicesKey = serviceKey<ModelChoices>('model.choices')

/** The category Model registers its providers under, the same as `MODEL_PROVIDER_CATEGORY`. */
export const PROVIDER_CATEGORY = 'model-provider'

export const CREDENTIAL_REMEDY_ID = 'model-credential'
export const PROVIDER_BLOCK_ID = 'model-provider-access'

type RunFailure = Readonly<{ session: string; cause: string; detail: string | null }>

/** What the assembly hands in: where a failed run is told, where the keys of providers are filled in, and the
 * place on the page of one provider with the port its body is read from. */
export type ModelUiOptions = Readonly<{
  runFailure?: PointSink<RunFailure>
  providers?: Readonly<{ page: string; subject: string }>
  holding?: KeyedPointSink<Readonly<{ category: string; name: string }>>
  assets?: ServiceKey<AssetPort>
}>

type UiModule = ReturnType<typeof defineUiModule>

export function createModelUiModule(options: ModelUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'model-ui',
    needs: {
      model: needProtocol<ClientOf<ModelProtocol>>(modelProtocol),
      assets: needPoint(options.assets, { optional: true }),
    },
    apply(shell, { model, assets }, provide) {
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
      options.holding?.contribute(shell, PROVIDER_CATEGORY, {
        id: PROVIDER_BLOCK_ID,
        order: 0,
        render: ({ scope, subject }) => {
          // The port comes and goes with the assets module: it is read at each drawing.
          const port = assets.get()
          return scope === undefined || port === undefined ? null : (
            <ProviderBlock
              port={port}
              tenant={scope}
              category={subject.category}
              name={subject.name}
            />
          )
        },
      })
    },
  })
}
