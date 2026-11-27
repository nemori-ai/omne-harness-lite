import { modelProtocol, type ModelProtocol } from '@omne-harness/model-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  needPoint,
  needProtocol,
  serviceKey,
  type PointContributor,
  type PointItem,
  type PointSink,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { createModelChoices, type ModelChoices } from './choices.ts'
import type { AssetPort } from './view/asset-body.ts'
import { modelParts } from './parts.ts'
import { RunFailureRemedy, type RunFault } from './view/run-failure-remedy.tsx'
import { MODEL_REASONING_EFFORTS, MODEL_SWITCHES } from './view/models-table.ts'
import { ModelsBlock } from './view/models-block.tsx'
import { ProviderBlock } from './view/provider-block.tsx'

/** The models of a tenant, on the client tree while `model/v1` is mounted. */
export const modelChoicesKey = serviceKey<ModelChoices>('model.choices')

/** The category Model registers its providers under, the same as `MODEL_PROVIDER_CATEGORY`. */
export const PROVIDER_CATEGORY = 'model-provider'

export const CREDENTIAL_REMEDY_ID = 'model-credential'
export const PROVIDER_BLOCK_ID = 'model-provider-access'
export const MODELS_BLOCK_ID = 'model-provider-models'

type Holding = Readonly<{ category: string; name: string }>

/** The place on the page of one asset; an item of it may claim settings of the asset it draws itself. */
export type HoldingSink = Readonly<{
  name: string
  contribute: (
    shell: PointContributor,
    key: string,
    item: PointItem<Holding> & Readonly<{ claims?: readonly string[] }>,
  ) => void
}>

type RunFailure = Readonly<{
  session: string
  cause: string
  detail: string | null
  fault: RunFault | null
}>

type ModelChooser = Readonly<{ open(session: string): void }>

/** What the assembly hands in: where a failed run is told, where the keys of providers are filled in, and the
 * place on the page of one provider with the port its body is read from. */
export type ModelUiOptions = Readonly<{
  runFailure?: PointSink<RunFailure>
  providers?: Readonly<{ page: string; subject: string }>
  holding?: HoldingSink
  assets?: ServiceKey<AssetPort>
  modelChoice?: ServiceKey<ModelChooser>
}>

type UiModule = ReturnType<typeof defineUiModule>

export function createModelUiModule(options: ModelUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'model-ui',
    needs: {
      model: needProtocol<ClientOf<ModelProtocol>>(modelProtocol),
      assets: needPoint(options.assets, { optional: true }),
      modelChoice: needPoint(options.modelChoice, { optional: true }),
    },
    apply(shell, { model, assets, modelChoice }, provide) {
      provide(modelChoicesKey, createModelChoices(model))
      const { providers } = options
      const fill =
        providers === undefined
          ? undefined
          : () => shell.navigate(providers.page, providers.subject)
      options.runFailure?.contribute(shell, {
        id: CREDENTIAL_REMEDY_ID,
        order: 0,
        render: ({ scope, subject }) => {
          const chooser = modelChoice.get()
          return scope === undefined ? null : (
            <RunFailureRemedy
              port={assets.get()}
              tenant={scope}
              category={PROVIDER_CATEGORY}
              fault={subject.fault}
              fill={fill}
              choose={chooser === undefined ? undefined : () => chooser.open(subject.session)}
            />
          )
        },
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
      for (const part of modelParts) part.declare(shell)
      options.holding?.contribute(shell, PROVIDER_CATEGORY, {
        id: MODELS_BLOCK_ID,
        order: 1,
        claims: [MODEL_SWITCHES, MODEL_REASONING_EFFORTS],
        render: ({ scope, subject }) => {
          const port = assets.get()
          return scope === undefined || port === undefined ? null : (
            <ModelsBlock
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
