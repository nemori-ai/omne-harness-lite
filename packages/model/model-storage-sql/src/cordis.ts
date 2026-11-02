import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { SendCoordinator } from '@omne-harness/model'
import type { ModelSendSource } from '@omne-harness/model/commands'
import { ModelCommandsService, modelCommandsKey } from '@omne-harness/model-cordis-contract/cordis'
import { createSqlModelCommands, type SqlModelCommandsOptions } from './commands.ts'
import { sqlModelRecordsConfigSchema, type SqlModelRecordsConfig } from './cordis-config.ts'

export type { SqlModelRecordsConfig } from './cordis-config.ts'

/** Live dependencies resolved anew for each activation, outside the data config. */
export type SqlModelRecordsDependencies<P> = Readonly<
  Pick<SqlModelCommandsOptions<P>, 'storage' | 'domains' | 'authority' | 'evidence' | 'clock'> & {
    manifestDigest: string
    sources: readonly ModelSendSource<P>[]
  }
>

export type SqlModelRecordsPluginOptions<P, C> = Readonly<{
  /** Complete static dependency list of resolve; must exclude modelCommands. */
  inject: readonly string[]
  resolve(ctx: Context, config: SqlModelRecordsConfig): SqlModelRecordsDependencies<P>
  sendStage(coordinator: SendCoordinator<P>): Readonly<{ plugin: Plugin<C>; config: C }>
}>

export type SqlModelRecordsPluginClass<P> = {
  new (ctx: Context, config: SqlModelRecordsConfig): ModelCommandsService<P>
  readonly inject: string[]
  readonly Config: typeof sqlModelRecordsConfigSchema
}

/** Publishes the SQL commands and owns a separate send child, including while it is PENDING. */
export function createSqlModelRecordsPlugin<P, C>(
  options: SqlModelRecordsPluginOptions<P, C>,
): SqlModelRecordsPluginClass<P> {
  if (options.inject.includes(modelCommandsKey))
    throw new TypeError('modelCommands cannot be a dependency of its own records provider')

  return class SqlModelRecordsPlugin extends ModelCommandsService<P> {
    static readonly inject = [...options.inject]
    static readonly Config = sqlModelRecordsConfigSchema

    readonly admit
    readonly recall
    readonly scanPending
    readonly loadRecovery
    readonly claim
    readonly prepareDispatch
    readonly recordMaterialization
    readonly recordSend
    readonly openReceiveWindow
    readonly preserve
    readonly recordLateFact
    readonly prepareRetry
    readonly decideRetry
    readonly settle
    readonly control
    readonly acquireRead
    readonly nextRead
    readonly endRead
    readonly handoff
    readonly advanceCleanup
    readonly query
    readonly dispatches

    constructor(ctx: Context, config: SqlModelRecordsConfig) {
      super(ctx)
      const dependencies = options.resolve(ctx, config)
      const { commands, coordinator } = createSqlModelCommands({
        ...config,
        ...dependencies,
        combination: {
          combinationVersion: config.combinationVersion,
          manifestDigest: dependencies.manifestDigest,
        },
        send: { ...config.send, sources: dependencies.sources },
      })
      this.admit = commands.admit
      this.recall = commands.recall
      this.scanPending = commands.scanPending
      this.loadRecovery = commands.loadRecovery
      this.claim = commands.claim
      this.prepareDispatch = commands.prepareDispatch
      this.recordMaterialization = commands.recordMaterialization
      this.recordSend = commands.recordSend
      this.openReceiveWindow = commands.openReceiveWindow
      this.preserve = commands.preserve
      this.recordLateFact = commands.recordLateFact
      this.prepareRetry = commands.prepareRetry
      this.decideRetry = commands.decideRetry
      this.settle = commands.settle
      this.control = commands.control
      this.acquireRead = commands.acquireRead
      this.nextRead = commands.nextRead
      this.endRead = commands.endRead
      this.handoff = commands.handoff
      this.advanceCleanup = commands.advanceCleanup
      this.query = commands.query
      this.dispatches = commands.dispatches
      if (coordinator === null) throw new TypeError('records requires the send coordinator')
      const send = options.sendStage(coordinator)
      ctx.plugin(send.plugin, send.config)
    }
  }
}
