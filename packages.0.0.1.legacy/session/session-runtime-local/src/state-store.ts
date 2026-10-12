import { narrow, StorageDefect, type ReadTx, type StorageUnit } from '@omne-harness-lite/storage'
import { tenantIdEquals, parseTenantId, isOk } from '@omne-harness-lite/identity-values'
import { checkKey } from '@omne-harness-lite/session-log'
import type { SessionHead, SessionStateChange } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { positionNumber } from './state-values.ts'

export interface StateRow {
  session: string
  tenant: string
  revision: string
  lifecycle: 'active' | 'archived'
  run: string | null
  run_state: NonNullable<SessionHead['run']>['state'] | null
  attempt: string | null
  execution_generation: string | null
}
export interface StateDb {
  sr_session_state: StateRow
  sr_run_seen: { session: string; run: string }
  sr_pending_input: {
    session: string
    position: string
    position_length: number
    operation: string
    semantic: string
    reserved_run: string | null
  }
}
export function stateHead(row: StateRow, scope: SessionScope): SessionHead {
  const tenant = parseTenantId(JSON.parse(row.tenant))
  if (
    !isOk(tenant) ||
    !tenantIdEquals(tenant.ok, scope.tenant) ||
    row.session !== scope.session ||
    !/^(0|[1-9][0-9]*)$/.test(row.revision) ||
    !['active', 'archived'].includes(row.lifecycle)
  )
    throw new StorageDefect('corrupt local session state')
  return { ...scope, revision: row.revision, lifecycle: row.lifecycle, run: runHead(row) }
}
function runHead(row: StateRow): SessionHead['run'] {
  if (row.run === null) {
    checkEmptyRun(row)
    return null
  }
  if (
    !checkKey(row.run) ||
    row.run_state === null ||
    !['runnable', 'waiting', 'completed', 'failed', 'cancelled'].includes(row.run_state)
  )
    throw new StorageDefect('corrupt local run state')
  if (
    row.attempt === null ? row.execution_generation !== null : !checkKey(row.execution_generation)
  )
    throw new StorageDefect('corrupt local attempt state')
  return {
    id: row.run,
    state: row.run_state,
    attempt: row.attempt === null ? null : positionNumber(row.attempt),
    executionGeneration: row.execution_generation,
  }
}
function checkEmptyRun(row: StateRow): void {
  if (row.run_state !== null || row.attempt !== null || row.execution_generation !== null)
    throw new StorageDefect('corrupt empty session state')
}
export async function stateRow(
  unit: StorageUnit,
  scope: SessionScope,
): Promise<StateRow | undefined> {
  return unit.query(async tx => {
    const row = await narrow<StateDb>(tx)
      .selectFrom('sr_session_state')
      .selectAll()
      .where('session', '=', scope.session)
      .executeTakeFirst()
    if (row) stateHead(row, scope)
    return row
  })
}
export async function saveHead(
  unit: StorageUnit,
  scope: SessionScope,
  previous: StateRow,
  change: Partial<StateRow>,
): Promise<StateRow> {
  const row = { ...previous, ...change, revision: (BigInt(previous.revision) + 1n).toString() }
  await unit.mutate(tx =>
    narrow<StateDb>(tx)
      .updateTable('sr_session_state')
      .set(row)
      .where('session', '=', scope.session)
      .where('revision', '=', previous.revision)
      .execute(),
  )
  return row
}
export async function pendingRows(unit: StorageUnit, scope: SessionScope, limit: number) {
  return unit.query(async tx => {
    const rows = await narrow<StateDb>(tx)
      .selectFrom('sr_pending_input')
      .selectAll()
      .where('session', '=', scope.session)
      .orderBy('position_length')
      .orderBy('position')
      .limit(limit)
      .execute()
    for (const row of rows) {
      if (row.position_length !== row.position.length || !/^[1-9][0-9]*$/.test(row.position))
        throw new StorageDefect('corrupt pending input position')
    }
    return rows
  })
}
export async function pendingPosition(unit: StorageUnit, scope: SessionScope, position: string) {
  return unit.query(tx =>
    narrow<StateDb>(tx)
      .selectFrom('sr_pending_input')
      .selectAll()
      .where('session', '=', scope.session)
      .where('position', '=', position)
      .executeTakeFirst(),
  )
}
export function operationKey(change: Extract<SessionStateChange, { kind: 'acceptInput' }>): string {
  const ref = change.operation
  return JSON.stringify([
    ref.tenant.organization,
    ref.tenant.account,
    ref.principal,
    ref.operation,
    ref.operationKey,
    ref.session,
  ])
}
export async function pendingCount(tx: ReadTx, session: string): Promise<number> {
  const value = await narrow<StateDb>(tx)
    .selectFrom('sr_pending_input')
    .select(({ fn }) => fn.countAll<number>().as('total'))
    .where('session', '=', session)
    .executeTakeFirstOrThrow()
  return Number(value.total)
}
export function terminal(row: StateRow): boolean {
  return row.run_state !== null && ['completed', 'failed', 'cancelled'].includes(row.run_state)
}
