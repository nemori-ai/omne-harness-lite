import { narrow, type StorageUnit } from '@omne-harness-lite/storage'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger, checkKey } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type {
  AttemptPermit,
  CoordinationAuthority,
  SessionStateParticipant,
  SessionStateStage,
  SessionStateChange,
} from '@omne-harness-lite/session-runtime'
import type { LocalSessionState, StateOptions } from './state-types.ts'
import {
  InvalidStateInput,
  statePolicy,
  stateScope,
  stateChange,
  positionText,
  positionNumber,
} from './state-values.ts'
import {
  stateHead,
  stateRow,
  saveHead,
  pendingRows,
  pendingPosition,
  pendingCount,
  operationKey,
  terminal,
  type StateRow,
  type StateDb,
} from './state-store.ts'

interface PermitBinding {
  readonly scope: SessionScope
  readonly run: RunId
  readonly attempt: AttemptId
  readonly generation: string
  readonly stagedUnit: StorageUnit
  committed: boolean
}
type StageChange = Exclude<SessionStateChange, { kind: 'initialize' }>
/** No independent transactions. The original coordinator owns commit and drain. */
export function createLocalSessionState(options: StateOptions): LocalSessionState {
  return new StateParticipant({
    ...options,
    policy: statePolicy(options.policy),
    tenant: Object.freeze({ ...options.tenant }),
  })
}
class StateParticipant implements LocalSessionState {
  readonly #permits = new WeakMap<AttemptPermit, PermitBinding>()
  constructor(readonly options: StateOptions) {}
  adoptInitialIn: LocalSessionState['adoptInitialIn'] = async (
    unit,
    authority,
    requested,
    run,
    value,
  ) => {
    const scope = stateScope(requested),
      position = positionText(value, this.options.policy.maxRecordBytes)
    if (!checkKey(run)) return { failure: 'invalidInput' }
    const denied = await this.#authorize(unit, authority, scope)
    if (denied) return denied
    const row = await stateRow(unit, scope),
      input = await pendingPosition(unit, scope, position)
    if (
      !row ||
      row.run !== run ||
      row.run_state !== 'runnable' ||
      row.attempt !== null ||
      input?.reserved_run !== run
    )
      return { failure: 'conflict' }
    await unit.mutate(tx =>
      narrow<StateDb>(tx)
        .deleteFrom('sr_pending_input')
        .where('session', '=', scope.session)
        .where('position', '=', position)
        .execute(),
    )
    const next = await saveHead(unit, scope, row, {})
    return { kind: 'staged', head: stateHead(next, scope), permit: null }
  }
  readonly participant: SessionStateParticipant = {
    headIn: async (unit, authority, requested) => {
      try {
        const scope = stateScope(requested),
          denied = await this.#authorize(unit, authority, scope)
        if (denied) return denied
        const row = await stateRow(unit, scope)
        return { kind: 'head', head: row ? stateHead(row, scope) : null }
      } catch (error) {
        if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
        throw error
      }
    },
    pendingIn: async (unit, authority, requested, limit) => {
      try {
        const scope = stateScope(requested)
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.options.policy.maxBatchSize)
          return { failure: 'invalidInput' }
        const denied = await this.#authorize(unit, authority, scope)
        if (denied) return denied
        return {
          kind: 'inputs',
          positions: (await pendingRows(unit, scope, limit)).map(row =>
            positionNumber(row.position),
          ),
        }
      } catch (error) {
        if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
        throw error
      }
    },
    stageIn: async (unit, authority, requested, revision, change) => {
      try {
        const scope = stateScope(requested),
          owned = stateChange(change, this.options.policy)
        if (
          revision !== null &&
          (typeof revision !== 'string' || !/^(0|[1-9][0-9]*)$/.test(revision))
        )
          return { failure: 'invalidInput' }
        const denied = await this.#authorize(unit, authority, scope)
        if (denied) return denied
        const row = await stateRow(unit, scope)
        if ((row?.revision ?? null) !== revision) return { failure: 'conflict' }
        if (owned.kind === 'initialize') return this.#initialize(unit, scope, row)
        if (!row) return { failure: 'conflict' }
        return this.#stage(unit, scope, row, owned)
      } catch (error) {
        if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
        throw error
      }
    },
  }
  async #authorize(unit: StorageUnit, authority: CoordinationAuthority, scope: SessionScope) {
    unit.assertStorage(this.options.storage)
    if (!this.options.isOpen()) return { failure: 'unavailable' as const }
    if (!tenantIdEquals(scope.tenant, this.options.tenant)) return { failure: 'denied' as const }
    await unit.mutate(tx => tx.lockSentinel(`session-state:${scope.session}`))
    const decision = await this.options.authority.authorize(unit, authority, scope)
    if ('failure' in decision) return decision
    if (decision.kind !== 'authorized') throw new TypeError('invalid state authority decision')
    return undefined
  }
  async #initialize(
    unit: StorageUnit,
    scope: SessionScope,
    previous: StateRow | undefined,
  ): Promise<SessionStateStage> {
    if (previous) return { failure: 'conflict' }
    const row: StateRow = {
      session: scope.session,
      tenant: JSON.stringify(scope.tenant),
      revision: '0',
      lifecycle: 'active',
      run: null,
      run_state: null,
      attempt: null,
      execution_generation: null,
    }
    await unit.mutate(tx =>
      narrow<StateDb>(tx).insertInto('sr_session_state').values(row).execute(),
    )
    return { kind: 'staged', head: stateHead(row, scope), permit: null }
  }
  async #stage(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: StageChange,
  ): Promise<SessionStateStage> {
    if (row.lifecycle !== 'active') return { failure: 'conflict' }
    switch (change.kind) {
      case 'acceptInput':
        return this.#accept(unit, scope, row, change)
      case 'startRun':
        return this.#startRun(unit, scope, row, change)
      case 'startAttempt':
        return this.#startAttempt(unit, scope, row, change)
      case 'adoptInput':
        return this.#adopt(unit, scope, row, change)
      case 'finish':
        return this.#finish(unit, scope, row, change)
    }
  }
  async #accept(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: Extract<StageChange, { kind: 'acceptInput' }>,
  ): Promise<SessionStateStage> {
    const ref = change.operation
    if (
      ref.operation !== 'submitInput' ||
      ref.session !== scope.session ||
      !tenantIdEquals(ref.tenant, scope.tenant)
    )
      return { failure: 'invalidInput' }
    const position = positionText(change.position, this.options.policy.maxRecordBytes)
    const key = operationKey(change),
      existing = await unit.query(tx =>
        narrow<StateDb>(tx)
          .selectFrom('sr_pending_input')
          .selectAll()
          .where('session', '=', scope.session)
          .where('operation', '=', key)
          .executeTakeFirst(),
      )
    if (existing)
      return existing.position === position && existing.semantic === change.semanticDigest
        ? { kind: 'staged', head: stateHead(row, scope), permit: null }
        : { failure: 'conflict' }
    if (
      (await unit.query(tx => pendingCount(tx, scope.session))) >=
      this.options.policy.maxPendingPerSession
    )
      return { failure: 'unavailable' }
    if (await pendingPosition(unit, scope, position)) return { failure: 'conflict' }
    await unit.mutate(tx =>
      narrow<StateDb>(tx)
        .insertInto('sr_pending_input')
        .values({
          session: scope.session,
          position,
          position_length: position.length,
          operation: key,
          semantic: change.semanticDigest,
          reserved_run: null,
        })
        .execute(),
    )
    const next = await saveHead(unit, scope, row, {})
    return { kind: 'staged', head: stateHead(next, scope), permit: null }
  }
  async #startRun(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: Extract<StageChange, { kind: 'startRun' }>,
  ): Promise<SessionStateStage> {
    if (row.run !== null && !terminal(row)) return { failure: 'conflict' }
    const seen = await unit.query(tx =>
      narrow<StateDb>(tx)
        .selectFrom('sr_run_seen')
        .select('run')
        .where('session', '=', scope.session)
        .where('run', '=', change.run)
        .executeTakeFirst(),
    )
    if (seen) return { failure: 'terminal' }
    const position = positionText(change.position, this.options.policy.maxRecordBytes),
      input = await pendingPosition(unit, scope, position)
    if (!input || input.reserved_run !== null) return { failure: 'conflict' }
    await unit.mutate(tx =>
      narrow<StateDb>(tx)
        .updateTable('sr_pending_input')
        .set({ reserved_run: change.run })
        .where('session', '=', scope.session)
        .where('position', '=', position)
        .execute(),
    )
    await unit.mutate(tx =>
      narrow<StateDb>(tx)
        .insertInto('sr_run_seen')
        .values({ session: scope.session, run: change.run })
        .execute(),
    )
    const next = await saveHead(unit, scope, row, {
      run: change.run,
      run_state: 'runnable',
      attempt: null,
      execution_generation: null,
    })
    return { kind: 'staged', head: stateHead(next, scope), permit: null }
  }
  async #startAttempt(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: Extract<StageChange, { kind: 'startAttempt' }>,
  ): Promise<SessionStateStage> {
    if (terminal(row)) return { failure: 'terminal' }
    if (row.run !== change.run || row.run_state !== 'runnable' || row.attempt !== null)
      return { failure: 'conflict' }
    const next = await saveHead(unit, scope, row, {
      attempt: positionText(change.attempt, this.options.policy.maxRecordBytes),
      execution_generation: change.executionGeneration,
    })
    const permit = Object.freeze({}) as AttemptPermit
    const binding: PermitBinding = {
      scope,
      run: change.run,
      attempt: change.attempt,
      generation: change.executionGeneration,
      stagedUnit: unit,
      committed: false,
    }
    this.#permits.set(permit, binding)
    unit.afterCommit(() => {
      binding.committed = true
    })
    return { kind: 'staged', head: stateHead(next, scope), permit }
  }
  async #adopt(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: Extract<StageChange, { kind: 'adoptInput' }>,
  ): Promise<SessionStateStage> {
    if (!(await this.checkPermitIn(unit, change.permit, scope, change.run, change.attempt)))
      return { failure: 'staleAttempt' }
    const position = positionText(change.position, this.options.policy.maxRecordBytes),
      input = await pendingPosition(unit, scope, position)
    if (!input || (input.reserved_run !== null && input.reserved_run !== change.run))
      return { failure: 'conflict' }
    await unit.mutate(tx =>
      narrow<StateDb>(tx)
        .deleteFrom('sr_pending_input')
        .where('session', '=', scope.session)
        .where('position', '=', position)
        .execute(),
    )
    const next = await saveHead(unit, scope, row, {})
    return { kind: 'staged', head: stateHead(next, scope), permit: null }
  }
  async #finish(
    unit: StorageUnit,
    scope: SessionScope,
    row: StateRow,
    change: Extract<StageChange, { kind: 'finish' }>,
  ): Promise<SessionStateStage> {
    if (terminal(row)) return { failure: 'terminal' }
    if (!(await this.checkPermitIn(unit, change.permit, scope, change.run, change.attempt)))
      return { failure: 'staleAttempt' }
    if ((await unit.query(tx => pendingCount(tx, scope.session))) > 0)
      return { failure: 'pendingInput' }
    const work = await this.options.workSettledIn(unit, scope, change.run)
    if (work === 'pending') return { failure: 'conflict' }
    if (work === 'unavailable') return { failure: 'unavailable' }
    if (work !== 'settled') throw new TypeError('invalid settled work decision')
    const next = await saveHead(unit, scope, row, { run_state: change.terminal })
    return { kind: 'staged', head: stateHead(next, scope), permit: null }
  }
  checkPermitIn = async (
    unit: StorageUnit,
    permit: AttemptPermit,
    requested: SessionScope,
    run: RunId,
    attempt: AttemptId,
  ): Promise<boolean> => {
    unit.assertStorage(this.options.storage)
    const binding = this.#permits.get(permit)
    if (!binding || !this.options.isOpen() || (!binding.committed && binding.stagedUnit !== unit))
      return false
    const scope = stateScope(requested)
    if (!permitScopeMatches(binding, scope, run, attempt)) return false
    const row = await stateRow(unit, scope)
    return currentPermitRow(row, binding)
  }
}

function permitScopeMatches(
  binding: PermitBinding,
  scope: SessionScope,
  run: RunId,
  attempt: AttemptId,
): boolean {
  return (
    tenantIdEquals(scope.tenant, binding.scope.tenant) &&
    scope.session === binding.scope.session &&
    run === binding.run &&
    compareInteger(attempt, binding.attempt) === 0
  )
}

function currentPermitRow(row: StateRow | undefined, binding: PermitBinding): boolean {
  if (
    !row ||
    terminal(row) ||
    row.run !== binding.run ||
    row.attempt === null ||
    row.execution_generation !== binding.generation
  )
    return false
  return compareInteger(positionNumber(row.attempt), binding.attempt) === 0
}
