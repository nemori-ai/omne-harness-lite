import type { SendCoordinator } from '@omne-harness/model'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelObservationStorage,
  modelCommands,
  type ModelInitialExecution,
  type ModelObservationSource,
  type ModelObservationLimits,
  type ModelObservationTiming,
  type ModelConfirmationDiagnostic,
  type ModelCommandsCoreOptions,
  type ModelSendSource,
} from '@omne-harness/model/commands'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { createSqlModelStorage, type SqlModelStorage } from './commit.ts'
import { createSendMirror, type SendMirrorOptions } from './coordinator.ts'
import { PENDING_PAGE_MAX } from './reads.ts'

export type SqlModelCommandsOptions<P> = ModelCommandsCoreOptions<P> &
  Readonly<{
    storage: SqlStorage
    domains: TenantDomainLookup
    combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
    requestChunkBytes: number
    attemptLimit?: number
    unresolvedLimit?: number
    send?: SendMirrorOptions & Readonly<{ sources: readonly ModelSendSource<P>[] }>
    observation?: Readonly<{ limits: ModelObservationLimits; timing: ModelObservationTiming }>
    reportConfirmation?(event: ModelConfirmationDiagnostic): void
  }>

export type SqlModelCommands<P> = Readonly<{
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P> | null
  initial: ModelInitialExecution<P> | null
  observations: ModelObservationSource<P> | null
}>

type ObservedStorage<P> = ReturnType<typeof createModelObservationStorage<P>>
type MirrorSource = Parameters<typeof createSendMirror>[0]
type SendOptions<P> = NonNullable<SqlModelCommandsOptions<P>['send']>

function assertScanPage(limits: ModelCommandsCoreOptions<unknown>['limits']): void {
  if (!Number.isSafeInteger(limits.scanPageCalls) || limits.scanPageCalls > PENDING_PAGE_MAX)
    throw new RangeError(`scanPageCalls is above the model.pending page of ${PENDING_PAGE_MAX}`)
}

function createStorage<P>(options: SqlModelCommandsOptions<P>): SqlModelStorage {
  return createSqlModelStorage({
    storage: options.storage,
    domains: options.domains,
    combination: options.combination,
    limits: {
      tenantResults: options.limits.unacknowledgedResults,
      requestChunkBytes: options.requestChunkBytes,
    },
    ...(options.attemptLimit === undefined ? {} : { attemptLimit: options.attemptLimit }),
    ...(options.unresolvedLimit === undefined ? {} : { unresolvedLimit: options.unresolvedLimit }),
  })
}

function createObserved<P>(
  options: SqlModelCommandsOptions<P>,
  storage: SqlModelStorage,
): ObservedStorage<P> | null {
  const { initialRun } = options
  if (initialRun === undefined && options.observation === undefined) return null
  return createModelObservationStorage({
    storage,
    authority: options.authority,
    ...(initialRun === undefined ? {} : { initialRun }),
    ...(options.observation === undefined ? {} : { observation: options.observation }),
    report: options.reportConfirmation ?? (() => {}),
  })
}

function createMirror<P>(
  send: SendOptions<P> | undefined,
  confirmedStorage: MirrorSource,
): ReturnType<typeof createSendMirror> | null {
  if (send === undefined) return null
  return createSendMirror(confirmedStorage, {
    mirrorBytes: send.mirrorBytes,
    ...(send.maxClaims === undefined ? {} : { maxClaims: send.maxClaims }),
  })
}

export function createSqlModelCommands<P>(
  options: SqlModelCommandsOptions<P>,
): SqlModelCommands<P> {
  const { owners, authority, evidence, clock, limits, initialRun, send } = options
  assertScanPage(limits)
  const storage = createStorage(options)
  const observed = createObserved(options, storage)
  const confirmedStorage = observed?.storage ?? storage
  const mirror = createMirror(send, confirmedStorage)
  const core = createModelCommandsCore(
    {
      owners,
      authority,
      evidence,
      clock,
      limits,
      ...(initialRun === undefined ? {} : { initialRun }),
    },
    mirror?.storage ?? confirmedStorage,
  )
  return {
    commands: modelCommands(core),
    coordinator:
      mirror === null || send === undefined ? null : mirror.coordinator(core, send.sources),
    initial:
      initialRun === undefined
        ? null
        : createModelInitialExecution({
            run: initialRun,
            core,
            ...(mirror === null || send === undefined
              ? {}
              : { coordinator: bound => mirror.coordinator(core, send.sources, bound) }),
          }),
    observations: observed?.observations ?? null,
  }
}
