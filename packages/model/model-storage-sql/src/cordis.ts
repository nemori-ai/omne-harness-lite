import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { SendCoordinator } from '@omne-harness/model'
import type {
  ModelInitialExecution,
  ModelInitialRun,
  ModelObservationSource,
  ModelObservationTiming,
  ModelSendSource,
} from '@omne-harness/model/commands'
import type { Adoption } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  ModelCommandsService,
  ModelDiagnosticsService,
  modelCommandsKey,
  modelDiagnosticsKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { createSqlModelCommands, type SqlModelCommandsOptions } from './commands.ts'
import { sqlModelRecordsConfigSchema, type SqlModelRecordsConfig } from './cordis-config.ts'
import {
  createSqlModelDiagnostics,
  type DiagnosticsReadMapping,
  type SqlModelDiagnosticsOptions,
} from './diagnostics.ts'

export type { SqlModelRecordsConfig } from './cordis-config.ts'

/** Live dependencies resolved anew for each activation, outside the data config. */
export type SqlModelRecordsDependencies<P> = Readonly<
  Pick<SqlModelCommandsOptions<P>, 'storage' | 'domains' | 'authority' | 'evidence' | 'clock'> & {
    manifestDigest: string
    sources: readonly ModelSendSource<P>[]
    initialRun?: ModelInitialRun<P>
    observation?: Readonly<{ timing: ModelObservationTiming }>
  }
>
export type ModelRecordsActivation<P> = Readonly<{
  initial: ModelInitialExecution<P> | null
  observation: Readonly<{ commands: ModelCommands<P>; source: ModelObservationSource<P> }> | null
}>

export type SqlModelRecordsPluginOptions<P, C> = Readonly<{
  /** Complete static dependency list of resolve; must exclude modelCommands. */
  inject: readonly string[]
  resolve(ctx: Context, config: SqlModelRecordsConfig): SqlModelRecordsDependencies<P>
  sendStage(
    coordinator: SendCoordinator<P>,
    access?: ModelRecordsActivation<P>,
  ): Readonly<{ plugin: Plugin<C>; config: C }>
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
      if ((dependencies.observation === undefined) !== (config.observation === undefined))
        throw new TypeError('records observation requires both limits and timing')
      const { observation: observationLimits, ...data } = config
      const { observation: observationDependencies, ...resolved } = dependencies
      const { commands, coordinator, initial, observations } = createSqlModelCommands({
        ...data,
        ...resolved,
        ...(observationLimits === undefined || observationDependencies === undefined
          ? {}
          : { observation: { limits: observationLimits, timing: observationDependencies.timing } }),
        reportConfirmation: event => ctx.logger.warn(`model records: ${event.kind}`),
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
      const activation: ModelRecordsActivation<P> = Object.freeze({
        initial,
        observation:
          observations === null ? null : Object.freeze({ commands: this, source: observations }),
      })
      if (observations !== null) ctx.effect(() => () => observations.close())
      const send = options.sendStage(coordinator, activation)
      ctx.plugin(send.plugin, send.config)
    }
  }
}

// --- The diagnostics plugin ---------------------------------------------------------------

/** Data for one diagnostics plugin life: the adopted qualification mapping and the retention adoption. */
export type SqlModelDiagnosticsConfig = Readonly<{
  diagnosticsRead: DiagnosticsReadMapping
  /** Absent: no retention adopted, the read face answers `unavailable` (model-contract SPEC). */
  retention: Adoption | null
}>

/** Live dependencies resolved anew for each activation, outside the data config. */
export type SqlModelDiagnosticsDependencies<P> = Pick<
  SqlModelDiagnosticsOptions<P>,
  'storage' | 'domains' | 'authority'
>

export type SqlModelDiagnosticsPluginOptions<P> = Readonly<{
  /** Complete static dependency list of resolve; must exclude modelDiagnostics. */
  inject: readonly string[]
  resolve(ctx: Context, config: SqlModelDiagnosticsConfig): SqlModelDiagnosticsDependencies<P>
}>

export type SqlModelDiagnosticsPluginClass<P> = {
  new (ctx: Context, config: SqlModelDiagnosticsConfig): ModelDiagnosticsService<P>
  readonly inject: string[]
  readonly Config: typeof sqlModelDiagnosticsConfigSchema
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function adoptionText(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`retention.${key} must be a non-empty string`)
  return value
}

function parseDiagnosticsConfig(value: unknown): SqlModelDiagnosticsConfig {
  if (!isRecord(value)) throw new TypeError('diagnostics config must be an object')
  const mapping = value['diagnosticsRead']
  if (mapping !== 'tenant-self') throw new TypeError('diagnosticsRead must be tenant-self')
  const retention = value['retention']
  if (retention === undefined || retention === null)
    return { diagnosticsRead: mapping, retention: null }
  if (!isRecord(retention)) throw new TypeError('retention must be an adoption')
  return {
    diagnosticsRead: mapping,
    retention: {
      owner: adoptionText(retention, 'owner'),
      name: adoptionText(retention, 'name'),
      revision: adoptionText(retention, 'revision'),
      digest: adoptionText(retention, 'digest'),
    },
  }
}

export const sqlModelDiagnosticsConfigSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'model-storage-sql',
    validate(value: unknown) {
      try {
        return { value: parseDiagnosticsConfig(value) }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
        return { issues: [{ message: error.message }] }
      }
    },
  },
}

/** Publishes `modelDiagnostics` over the SQL records: the read face of `createSqlModelDiagnostics`. */
export function createSqlModelDiagnosticsPlugin<P>(
  options: SqlModelDiagnosticsPluginOptions<P>,
): SqlModelDiagnosticsPluginClass<P> {
  if (options.inject.includes(modelDiagnosticsKey))
    throw new TypeError('modelDiagnostics cannot be a dependency of its own diagnostics provider')

  return class SqlModelDiagnosticsPlugin extends ModelDiagnosticsService<P> {
    static readonly inject = [...options.inject]
    static readonly Config = sqlModelDiagnosticsConfigSchema

    readonly list

    constructor(ctx: Context, config: SqlModelDiagnosticsConfig) {
      super(ctx)
      const dependencies = options.resolve(ctx, config)
      this.list = createSqlModelDiagnostics<P>({ ...dependencies, ...config }).list
    }
  }
}
