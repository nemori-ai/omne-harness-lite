// The durable ModelCommands: the 22 methods of the shared commands core over the SQL storage of
// this member, and with send options the send coordinator over the same core. The core owns every
// rule of the methods; this file only joins the parts and checks the options that cross them.
import type { SendCoordinator } from '@omne-harness/model'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  createModelCommandsCore,
  modelCommands,
  type ModelCommandsCoreOptions,
  type ModelSendSource,
} from '@omne-harness/model/commands'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { createSqlModelStorage } from './commit.ts'
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
    /** Attempt generations of one operation. Default 8. */
    attemptLimit?: number
    /** Operations with an unknown commit outcome that the process keeps for one tenant. */
    unresolvedLimit?: number
    /**
     * The send coordinator over the same core: its mirror and the sources whose sends it judges.
     * Without it the result has no coordinator.
     */
    send?: SendMirrorOptions & Readonly<{ sources: readonly ModelSendSource<P>[] }>
  }>

/**
 * The commands, and the coordinator when the options give `send`. Both run on the one core over
 * the one mirrored storage, so they share one qualification authority.
 */
export type SqlModelCommands<P> = Readonly<{
  commands: ModelCommands<P>
  coordinator: SendCoordinator<P> | null
}>

/**
 * Builds the durable ModelCommands. It throws on invalid options: those of the core, those of the
 * storage (N1, the combination), and a scan page larger than one `model.pending` page.
 */
export function createSqlModelCommands<P>(
  options: SqlModelCommandsOptions<P>,
): SqlModelCommands<P> {
  const { owners, authority, evidence, clock, limits } = options
  if (!Number.isSafeInteger(limits.scanPageCalls) || limits.scanPageCalls > PENDING_PAGE_MAX)
    throw new RangeError(`scanPageCalls is above the model.pending page of ${PENDING_PAGE_MAX}`)
  const storage = createSqlModelStorage({
    storage: options.storage,
    domains: options.domains,
    combination: options.combination,
    limits: {
      tenantCapacity: limits.capacity,
      maxCallBytes: options.maxCallBytes,
      maxCommandBytes: options.maxCommandBytes,
    },
    ...(options.attemptLimit === undefined ? {} : { attemptLimit: options.attemptLimit }),
    ...(options.unresolvedLimit === undefined ? {} : { unresolvedLimit: options.unresolvedLimit }),
  })
  const { send } = options
  const mirror =
    send === undefined
      ? null
      : createSendMirror(storage, {
          mirrorBytes: send.mirrorBytes,
          ...(send.maxClaims === undefined ? {} : { maxClaims: send.maxClaims }),
        })
  const core = createModelCommandsCore(
    { owners, authority, evidence, clock, limits },
    mirror?.storage ?? storage,
  )
  return {
    commands: modelCommands(core),
    coordinator:
      mirror === null || send === undefined ? null : mirror.coordinator(core, send.sources),
  }
}
