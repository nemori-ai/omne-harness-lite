// The send stage part of the local host: `ModelSendStagePlugin`, the provider of `modelSendBoundary`.
//
// It is the local send path of `assembleLocalModel` (the Model send boundary over the pi transport,
// the families and the network) given a Cordis life. The plugin adds no send rule of its own:
// - `modelCredential` and `modelCommands` are its static injections. The credential service is the
//   only source of the secret, and it is handed to the boundary through a port that this plugin
//   can withdraw. Nothing else of the plugin ever holds a secret.
// - The objects that are not serialisable (families, coordinator, network, routes, limits) come from
//   the assembly that creates the plugin class, like the options of the host plugin.
//
// What an exit means. The send path closes: no new send resource is given, the open ones are
// released and the network stops its exchanges. The credential port is withdrawn first, so a send
// that was between two steps at the exit cannot resolve a credential any more: it ends as
// not-started, and its transport is never started. A dispatch that already started stays what the
// send protocol says: the boundary object keeps answering for it by its retained attempt, a
// successor plugin has no attempt for it and reads `unknown` from the dispatch record. The unload
// does not take back a request that is on the wire.
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialPort, ModelSendBoundary } from '@omne-harness/model-contract/provider'
import {
  ModelCredentialService,
  ModelSendBoundaryService,
  modelCommandsKey,
  modelCredentialKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { assembleLocalModel, type LocalModel, type LocalModelConfig } from '../assembly.ts'
import { fieldOf, isIntegerAtLeast } from '../fields.ts'

/**
 * What the plugin needs besides its injected services and its configuration: the assembly of the
 * local send path. `preparation` is required because `assembleLocalModel` builds the preparation
 * leases in the same call; this plugin does not use them.
 */
export type ModelSendStagePluginOptions = Readonly<
  Omit<LocalModelConfig<unknown>, 'credentials' | 'commands' | 'maxRetainedAttempts'>
>

/** The one bound of the send stage. It is required, and the plugin gives it no default. */
export type ModelSendStageSettings = Readonly<{
  /** The most send attempts the boundary retains, as `assembleLocalModel` takes it. */
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

export type ModelSendStagePluginClass = {
  new (ctx: Context, settings: ModelSendStageSettings): ModelSendBoundaryService<unknown>
  readonly inject: string[]
  readonly Config: typeof modelSendStageConfigSchema
}

/** The credential port of one plugin life: the injected service until the exit withdraws it. */
function withdrawablePort(service: ModelCredentialService): {
  readonly port: CredentialPort
  withdraw(): void
} {
  let held: ModelCredentialService | undefined = service
  return {
    port: {
      present: reference => held?.present(reference) ?? { kind: 'unavailable' },
      resolve: (reference, face) => held?.resolve(reference, face) ?? { kind: 'unavailable' },
    },
    withdraw() {
      held = undefined
    },
  }
}

/**
 * The plugin class over an assembly function. `createModelSendStagePlugin` gives the real one; the
 * package tests give one over observable network and send resources.
 */
export function sendStagePluginOver(
  input: Readonly<{
    options: ModelSendStagePluginOptions
    assemble: (config: LocalModelConfig<unknown>) => LocalModel<unknown>
  }>,
): ModelSendStagePluginClass {
  const { options, assemble } = input
  return class ModelSendStagePlugin extends ModelSendBoundaryService<unknown> {
    static readonly inject = [modelCredentialKey, modelCommandsKey]
    static readonly Config = modelSendStageConfigSchema

    readonly send: ModelSendBoundary<unknown>['send']

    constructor(ctx: Context, settings: ModelSendStageSettings) {
      super(ctx)
      const credential = ctx.modelCredential
      if (!(credential instanceof ModelCredentialService))
        throw new TypeError('the injected modelCredential is not a ModelCredentialService')
      const credentials = withdrawablePort(credential)
      // The assembly refuses a configuration with a RangeError before it opens anything.
      const local = assemble({
        ...options,
        credentials: credentials.port,
        commands: ctx.modelCommands,
        maxRetainedAttempts: settings.maxRetainedAttempts,
      })
      // The send path lives in these closures: any property of the instance is reachable by every
      // plugin that can read `ctx.modelSendBoundary`.
      this.send = (demand, signal) => local.send.send(demand, signal)
      ctx.fiber.effect(() => async () => {
        credentials.withdraw()
        try {
          await local.close()
        } catch {
          // The text names no cause: a close failure may carry a path or a URL of the route.
          ctx.logger.warn('model send stage: the send path did not close cleanly')
        }
      })
    }
  }
}

/** The send stage plugin class over the production send path. */
export function createModelSendStagePlugin(
  options: ModelSendStagePluginOptions,
): ModelSendStagePluginClass {
  return sendStagePluginOver({ options, assemble: assembleLocalModel })
}
