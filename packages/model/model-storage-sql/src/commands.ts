// The durable ModelCommands: the 22 methods of the shared commands core over the SQL storage of
// this member. The core owns every rule of the methods; this file only joins the two and checks
// the options that cross them.
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  createModelCommandsCore,
  modelCommands,
  type ModelCommandsCoreOptions,
} from '@omne-harness/model/commands'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { createSqlModelStorage } from './commit.ts'
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
  }>

export type SqlModelCommands<P> = Readonly<{ commands: ModelCommands<P> }>

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
  // Integration point of the send coordinator (C-COORD): its mirror decorates `storage` here, and
  // the commands and the coordinator then share that one decorated storage and the one core below.
  const core = createModelCommandsCore({ owners, authority, evidence, clock, limits }, storage)
  return { commands: modelCommands(core) }
}
