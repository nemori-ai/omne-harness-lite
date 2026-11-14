import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type { ModelInitialExecution } from '@omne-harness/model/commands'
import type { CredentialPort, ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  ModelCredentialService,
  ModelSendBoundaryService,
  modelCommandsKey,
  modelCredentialKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { assembleLocalModel, type LocalModel, type LocalModelConfig } from '../assembly.ts'
import { fieldOf, isIntegerAtLeast } from '../fields.ts'
import type { ModelMaterializationEvidenceReader } from '../materialization-proof.ts'

export type ModelSendStagePluginOptions<P = unknown> = Readonly<
  Omit<
    LocalModelConfig<P>,
    'credentials' | 'commands' | 'maxRetainedAttempts' | 'onConnectRetry'
  > & {
    executionChannel?(): ReturnType<ModelInitialExecution<P>['openHost']>
    installMaterialization?(reader: ModelMaterializationEvidenceReader): () => void
  }
>

export type ModelSendStageSettings = Readonly<{
  maxRetainedAttempts: number
}>

type Issue = { message: string }
type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

function parseSettings(value: unknown): Parsed<ModelSendStageSettings> {
  const maxRetainedAttempts = fieldOf(value, 'maxRetainedAttempts')
  if (!isIntegerAtLeast(maxRetainedAttempts, 1))
    return { issues: [{ message: 'maxRetainedAttempts must be a positive safe integer' }] }
  return { value: { maxRetainedAttempts } }
}

export const modelSendStageConfigSchema = {
  '~standard': { version: 1 as const, vendor: 'model-host-local', validate: parseSettings },
}

export type ModelSendStagePluginClass<P = unknown> = {
  new (ctx: Context, settings: ModelSendStageSettings): ModelSendBoundaryService<P>
  readonly inject: string[]
  readonly Config: typeof modelSendStageConfigSchema
}

function withdrawablePort<P>(service: ModelCredentialService<P>): {
  readonly port: CredentialPort<P>
  withdraw(): void
} {
  let held: ModelCredentialService<P> | undefined = service
  return {
    port: {
      layerOf: query => held?.layerOf(query) ?? fail({ kind: 'unavailable' }),
      resolve: reference => held?.resolve(reference) ?? fail({ kind: 'unavailable' }),
    },
    withdraw() {
      held = undefined
    },
  }
}

export function sendStagePluginOver<P>(
  input: Readonly<{
    options: ModelSendStagePluginOptions<P>
    assemble: (config: LocalModelConfig<P>) => LocalModel<P>
  }>,
): ModelSendStagePluginClass<P> {
  const { options, assemble } = input
  return class ModelSendStagePlugin extends ModelSendBoundaryService<P> {
    static readonly inject = [modelCredentialKey, modelCommandsKey]
    static readonly Config = modelSendStageConfigSchema

    readonly send: ModelSendBoundary<P>['send']

    constructor(ctx: Context, settings: ModelSendStageSettings) {
      super(ctx)
      const credential = ctx.modelCredential
      if (!(credential instanceof ModelCredentialService))
        throw new TypeError('the injected modelCredential is not a ModelCredentialService')
      const credentials = withdrawablePort(credential)
      const captured = options.executionChannel?.()
      if (captured !== undefined && 'failure' in captured)
        throw new Error(
          `model send stage: execution channel unavailable (${captured.failure.kind})`,
        )
      const channel = captured?.ok
      if (channel !== undefined && channel.coordinator === null)
        throw new Error('model send stage: execution channel has no coordinator')
      const local = assemble({
        ...options,
        credentials: credentials.port,
        commands: channel?.commands ?? ctx.modelCommands,
        coordinator: channel?.coordinator ?? options.coordinator,
        materialization: {
          ...options.materialization,
          execution: channel?.qualifyExecution ?? options.materialization.execution,
        },
        maxRetainedAttempts: settings.maxRetainedAttempts,
        onConnectRetry: retry =>
          ctx.logger.warn(
            `model send: connect retry (call ${retry.call}, dispatch ${retry.dispatch}, retry ${retry.attempt}, delay ${retry.delayMs} ms, reason ${retry.reason})`,
          ),
      })
      let withdrawMaterialization: (() => void) | undefined
      try {
        withdrawMaterialization = options.installMaterialization?.(local.materialization)
      } catch (error) {
        credentials.withdraw()
        void local
          .close()
          .catch(() => ctx.logger.warn('model send stage: abandoned send path did not close'))
        throw error
      }
      this.send = (demand, signal) => local.send.send(demand, signal)
      ctx.fiber.effect(() => async () => {
        credentials.withdraw()
        try {
          withdrawMaterialization?.()
        } catch {
          ctx.logger.warn('model send stage: materialization reader withdrawal failed')
        }
        try {
          await local.close()
        } catch {
          ctx.logger.warn('model send stage: the send path did not close cleanly')
        }
      })
    }
  }
}

export function createModelSendStagePlugin<P>(
  options: ModelSendStagePluginOptions<P>,
): ModelSendStagePluginClass<P> {
  return sendStagePluginOver({ options, assemble: assembleLocalModel })
}
