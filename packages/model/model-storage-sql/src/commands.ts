// The durable ModelCommands: the 22 methods of the shared commands core over the SQL storage of
// this member, and with send options the send coordinator over the same core. The core owns every
// rule of the methods; this file only joins the parts and checks the options that cross them.
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

/**
 * The options of the durable ModelCommands: the options of the shared core, and what the SQL
 * storage needs beside them. `limits.capacity` of the core is the share of one tenant here: the
 * storage reports the capacity that the calls of the tenant hold, and the participant checks a new
 * call against the same share in the commit that admits it.
 */
export type SqlModelCommandsOptions<P> = ModelCommandsCoreOptions<P> &
  Readonly<{
    storage: SqlStorage
    domains: TenantDomainLookup
    /** The combination the application registered for the tenant scope (session log and Model). */
    combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
    /** The largest call material that one call may hold (N1). */
    maxCallBytes: number
    /** The `maxCommandBytes` of the storage provider. */
    maxCommandBytes: number
    /** Rounds of one run. Default 8. The attempt generations of an operation have no limit. */
    attemptLimit?: number
    /** Operations with an unknown commit outcome that the process keeps for one tenant. */
    unresolvedLimit?: number
    /**
     * The send coordinator over the same core: its mirror and the sources whose sends it judges.
     * Without it the result has no coordinator.
     */
    send?: SendMirrorOptions & Readonly<{ sources: readonly ModelSendSource<P>[] }>
    observation?: Readonly<{ limits: ModelObservationLimits; timing: ModelObservationTiming }>
    reportConfirmation?(event: ModelConfirmationDiagnostic): void
  }>

/**
 * The commands, and the coordinator when the options give `send`. Both run on the one core over
 * the one mirrored storage, so they share one qualification authority.
 */
export type SqlModelCommands<P> = Readonly<{
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P> | null
  initial: ModelInitialExecution<P> | null
  observations: ModelObservationSource<P> | null
}>

type ObservedStorage<P> = ReturnType<typeof createModelObservationStorage<P>>
type MirrorSource = Parameters<typeof createSendMirror>[0]
type SendOptions<P> = NonNullable<SqlModelCommandsOptions<P>['send']>

/** Rejects a scan page larger than one `model.pending` page. */
function assertScanPage(limits: ModelCommandsCoreOptions<unknown>['limits']): void {
  if (!Number.isSafeInteger(limits.scanPageCalls) || limits.scanPageCalls > PENDING_PAGE_MAX)
    throw new RangeError(`scanPageCalls is above the model.pending page of ${PENDING_PAGE_MAX}`)
}

/** The SQL storage over the options, with the share of one tenant as the capacity of the core. */
function createStorage<P>(options: SqlModelCommandsOptions<P>): SqlModelStorage {
  return createSqlModelStorage({
    storage: options.storage,
    domains: options.domains,
    combination: options.combination,
    limits: {
      tenantCapacity: options.limits.capacity,
      maxCallBytes: options.maxCallBytes,
      maxCommandBytes: options.maxCommandBytes,
    },
    ...(options.attemptLimit === undefined ? {} : { attemptLimit: options.attemptLimit }),
    ...(options.unresolvedLimit === undefined ? {} : { unresolvedLimit: options.unresolvedLimit }),
  })
}

/** The confirming observation layer over the storage; null when the options ask for none. */
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

/** The send mirror over the confirmed storage; null when the options give no `send`. */
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

/**
 * Builds the durable ModelCommands. It throws on invalid options: those of the core, those of the
 * storage (N1, the combination), and a scan page larger than one `model.pending` page.
 */
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
