import {
  decideScheduleManagement,
  type ManagementCommit,
  type PersistenceResult,
  type ReadResult,
  type ScheduleManagementPersistence,
  type ScheduleManagementStore,
} from '@omne-harness/schedule'
import {
  ScheduleOperationLocatorSchema,
  type ScheduleOperationView,
} from '@omne-harness/schedule-contract'
import type { SqlStorage, StorageScope } from '@omne-harness/sql-contract'
import { commandMatches, domainError, json, ownerMatches, sqlIdentity } from './encoding.ts'
import { scheduleManagementGuardRequirement, type ScheduleManagementSqlGuards } from './guards.ts'
import {
  bindingSchema,
  commitSchema,
  PARTICIPANT,
  recoveryScopeSchema,
  storageScopeSchema,
} from './schema.ts'
import { queryView, unknownView, type ReceiptOptions, type RecoveryTarget } from './results.ts'
import { managementStore, readRepository } from './store.ts'
import { createScheduleManagementOperationRef } from '@omne-harness/schedule'
import { z } from 'zod'
export type ScheduleManagementSqlOptions = Readonly<{
  storage: SqlStorage
  scope: StorageScope
  combinationVersion: string
  manifestDigest: string
  guards: ScheduleManagementSqlGuards
}>
export type ScheduleManagementSqlBackend = Readonly<{
  store: ScheduleManagementStore
  persistence: ScheduleManagementPersistence
}>
function receiptOptions(options: ScheduleManagementSqlOptions): ReceiptOptions {
  return { ...options, guardParticipant: options.guards.participant }
}
function persistenceResult(view: ScheduleOperationView, replayed: boolean): PersistenceResult {
  if (view.kind === 'committed' || view.kind === 'noChange')
    return { kind: 'recorded', view, replayed }
  if (view.kind === 'rejected') return { kind: 'rejected', error: view.error }
  return { kind: 'unknown', operationRef: view.operationRef, retryAfterMs: 0 }
}
async function commit(
  options: ScheduleManagementSqlOptions,
  input: ManagementCommit,
): Promise<PersistenceResult> {
  const parsed = commitSchema.safeParse(input)
  if (!parsed.success)
    return {
      kind: 'rejected',
      error: domainError(
        'invalid_input',
        'schedule.management.commit',
        'Invalid management commit',
      ),
    }
  const command = parsed.data
  const operation = command.input.operation
  if (!commandMatches(options.scope, command))
    return {
      kind: 'rejected',
      error: domainError(
        'forbidden',
        command.input.requestId,
        'Management identity or storage scope mismatch',
      ),
    }
  const unknown: PersistenceResult = {
    kind: 'unknown',
    operationRef: operation.operationRef,
    retryAfterMs: 0,
  }
  const identity = sqlIdentity(options.scope, operation)
  try {
    const original = queryView(
      await options.storage.query(identity),
      receiptOptions(options),
      operation,
    )
    if (original.kind !== 'notCommitted') return persistenceResult(original, true)
    const decision = decideScheduleManagement(command.input)
    if (decision.kind === 'rejected') return decision
    const requirement = scheduleManagementGuardRequirement(options.scope, command)
    const guard = options.guards.command(requirement)
    if (guard.participant !== options.guards.participant)
      return {
        kind: 'rejected',
        error: domainError(
          'forbidden',
          command.input.requestId,
          'Guard command participant mismatch',
        ),
      }
    const result = await options.storage.commit({
      identity,
      combinationVersion: options.combinationVersion,
      manifestDigest: options.manifestDigest,
      commands: [guard, { participant: PARTICIPANT, facts: { requirement: json(requirement) } }],
    })
    if (result.kind === 'committed' || result.kind === 'rolled_back')
      return persistenceResult(queryView(result, receiptOptions(options), operation), false)
    if (result.kind === 'identity_conflict')
      return persistenceResult(queryView(result.existing, receiptOptions(options), operation), true)
    if (result.kind === 'unknown') return unknown
    return persistenceResult(
      queryView(await options.storage.query(identity), receiptOptions(options), operation),
      true,
    )
  } catch {
    return unknown
  }
}
async function query(
  options: ScheduleManagementSqlOptions,
  input: Parameters<ScheduleManagementPersistence['query']>[0],
): Promise<ReadResult<ScheduleOperationView>> {
  const scope = recoveryScopeSchema.safeParse(input?.scope)
  const locator = ScheduleOperationLocatorSchema.safeParse(input?.locator)
  if (!scope.success || !locator.success || !ownerMatches(options.scope, scope.data.owner))
    return {
      kind: 'unavailable',
      error: domainError(
        'forbidden',
        'schedule.management.query',
        'Invalid recovery scope or locator',
      ),
    }
  const ref =
    locator.data.kind === 'ref'
      ? locator.data.operationRef
      : createScheduleManagementOperationRef(scope.data, locator.data.identity)
  try {
    let target: RecoveryTarget
    if (locator.data.kind === 'identity')
      target = {
        scope: scope.data,
        address: locator.data.identity,
        fingerprint: locator.data.expectedFingerprint,
      }
    else {
      const saved = await readRepository(
        options.storage,
        { kind: 'operation', scope: options.scope, recovery: scope.data, operationRef: ref },
        bindingSchema,
      )
      if (saved.kind !== 'ok') return { kind: 'ok', value: unknownView(ref) }
      target = saved.value.operation
    }
    return {
      kind: 'ok',
      value: queryView(
        await options.storage.query(sqlIdentity(options.scope, target)),
        receiptOptions(options),
        target,
      ),
    }
  } catch {
    return { kind: 'ok', value: unknownView(ref) }
  }
}
export function createScheduleManagementSqlBackend(
  options: ScheduleManagementSqlOptions,
): ScheduleManagementSqlBackend {
  const scope = storageScopeSchema.parse(options.scope)
  z.string().min(1).parse(options.combinationVersion)
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(options.manifestDigest)
  if (
    !options.guards.participant ||
    options.guards.participant === PARTICIPANT ||
    typeof options.guards.command !== 'function'
  )
    throw new TypeError('A distinct management guard participant is required')
  const bound = { ...options, scope }
  return {
    store: managementStore(options.storage, scope),
    persistence: { commit: command => commit(bound, command), query: input => query(bound, input) },
  }
}
