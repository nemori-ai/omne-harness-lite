import assert from 'node:assert/strict'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  CorrelationKey,
  CredentialBinding,
  EndpointHolding,
  Generation,
  TaskId,
} from './brands.ts'
import type { TaskRecords, TaskRow, TaskRowKey } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'

export type TaskRecordsFixture = Readonly<{
  records: TaskRecords
  tenant: TenantId
  otherTenant: TenantId
  unavailable?: () => Promise<void>
}>

const keyOf = (tenant: TenantId, taskId: string, principalKey = 'alice'): TaskRowKey => ({
  tenant,
  principalKey,
  holding: 'holding-1' as EndpointHolding,
  taskId: taskId as TaskId,
})

const rowOf = (call: string, binding?: string): TaskRow => ({
  account:
    binding === undefined
      ? { kind: 'anonymous' }
      : { kind: 'credential', binding: binding as CredentialBinding },
  issuedAt: 1 as Generation,
  call: call as CorrelationKey,
  state: 'following',
  round: 1,
  pollIntervalMs: 2000,
  expiresAt: 1_900_000_000_000,
})

export function mcpTaskRecordsConformance(): readonly ConformanceCase<TaskRecordsFixture>[] {
  type F = TaskRecordsFixture
  return [
    conformanceCase<F>(
      'task-records',
      'a recorded row reads back as it was recorded',
      async ({ records, tenant }) => {
        const row = rowOf('call-1', 'b1')
        assert.deepEqual(await records.record(keyOf(tenant, 't1'), row), succeed('recorded'))
        assert.deepEqual(await records.read(keyOf(tenant, 't1')), succeed(row))
        assert.deepEqual(await records.read(keyOf(tenant, 't0')), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'task-records',
      'a row moves only from the step it names, and then says where it got',
      async ({ records, tenant }) => {
        const key = keyOf(tenant, 't2')
        await records.record(key, rowOf('call-2'))
        const arrival = { kind: 'terminal', status: 'completed' } as const
        const to = { state: 'arrived', round: 1, arrival } as const
        assert.deepEqual(
          await records.move(key, { state: 'awaiting', round: 1 }, to),
          succeed('stale'),
        )
        assert.deepEqual(
          await records.move(key, { state: 'following', round: 2 }, to),
          succeed('stale'),
        )
        assert.deepEqual(
          await records.move(key, { state: 'following', round: 1 }, to),
          succeed('moved'),
        )
        assert.deepEqual(
          await records.move(key, { state: 'following', round: 1 }, to),
          succeed('stale'),
        )
        assert.deepEqual(
          await records.read(key),
          succeed({ ...rowOf('call-2'), state: 'arrived', round: 1, arrival }),
        )
        assert.deepEqual(
          await records.move(keyOf(tenant, 'none'), { state: 'following', round: 1 }, to),
          succeed('stale'),
        )
      },
    ),
    conformanceCase<F>(
      'task-records',
      'a step without an arrival clears the one before; the round moves with it',
      async ({ records, tenant }) => {
        const key = keyOf(tenant, 't3')
        await records.record(key, rowOf('call-3'))
        await records.move(
          key,
          { state: 'following', round: 1 },
          { state: 'awaiting', round: 1, arrival: { kind: 'input' } },
        )
        await records.move(key, { state: 'awaiting', round: 1 }, { state: 'following', round: 2 })
        assert.deepEqual(
          await records.read(key),
          succeed({ ...rowOf('call-3'), state: 'following', round: 2 }),
        )
      },
    ),
    conformanceCase<F>(
      'task-records',
      'the same task of one principal on two accounts is ambiguous: it reads as such, does not move, and is not followed',
      async ({ records, tenant }) => {
        const key = keyOf(tenant, 't4')
        await records.record(key, rowOf('call-4', 'b1'))
        await records.record(key, rowOf('call-5', 'b2'))
        assert.deepEqual(await records.read(key), succeed('ambiguous'))
        assert.deepEqual(
          await records.move(key, { state: 'following', round: 1 }, { state: 'dropped', round: 1 }),
          succeed('stale'),
        )
        const listed = await records.following(tenant)
        assert.ok('ok' in listed)
        assert.equal(
          listed.ok.some(item => item.key.taskId === key.taskId),
          false,
        )
      },
    ),
    conformanceCase<F>(
      'task-records',
      'following lists the rows of one tenant that are followed now, each with its key',
      async ({ records, tenant, otherTenant }) => {
        await records.record(keyOf(tenant, 'f1', 'bob'), rowOf('call-f1'))
        await records.record(keyOf(tenant, 'f2', 'bob'), rowOf('call-f2'))
        await records.record(keyOf(otherTenant, 'f3', 'bob'), rowOf('call-f3'))
        await records.move(
          keyOf(tenant, 'f2', 'bob'),
          { state: 'following', round: 1 },
          { state: 'dropped', round: 1 },
        )
        const listed = await records.following(tenant)
        assert.ok('ok' in listed)
        const mine = listed.ok.filter(item => item.key.principalKey === 'bob')
        assert.deepEqual(
          mine.map(item => [tenantText(item.key.tenant), item.key.taskId, item.row.call]),
          [[tenantText(tenant), 'f1', 'call-f1']],
        )
      },
    ),
    conformanceCase<F>(
      'task-records',
      'the same task recorded again on the same account is the newer row',
      async ({ records, tenant }) => {
        const key = keyOf(tenant, 't5')
        await records.record(key, rowOf('call-old', 'b1'))
        await records.move(key, { state: 'following', round: 1 }, { state: 'dropped', round: 1 })
        const newer = { ...rowOf('call-new', 'b1'), issuedAt: 2 as Generation }
        assert.deepEqual(await records.record(key, newer), succeed('recorded'))
        assert.deepEqual(await records.read(key), succeed(newer))
      },
    ),
    conformanceCase<F>(
      'task-records',
      'a row belongs to its tenant and its principal: another of either reads nothing',
      async ({ records, tenant, otherTenant }) => {
        await records.record(keyOf(tenant, 't6'), rowOf('call-6'))
        assert.deepEqual(await records.read(keyOf(otherTenant, 't6')), succeed('absent'))
        assert.deepEqual(await records.read(keyOf(tenant, 't6', 'mallory')), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'task-records',
      'a store that cannot be reached says unavailable',
      async ({ records, tenant, unavailable }) => {
        const cut = handle(unavailable, 'unavailable')
        await cut()
        assert.deepEqual(await records.record(keyOf(tenant, 't7'), rowOf('c')), fail('unavailable'))
        assert.deepEqual(await records.read(keyOf(tenant, 't7')), fail('unavailable'))
        assert.deepEqual(await records.following(tenant), fail('unavailable'))
      },
    ),
  ]
}

export type MemoryTaskRecords = TaskRecords &
  Readonly<{ rows(): readonly TaskRow[]; cut(): void; mend(): void }>

type Kept = Readonly<{ key: TaskRowKey; rows: TaskRow[] }>

const textOf = (key: TaskRowKey) =>
  JSON.stringify([tenantText(key.tenant), key.principalKey, key.holding, key.taskId])

const accountOf = (row: TaskRow) =>
  row.account.kind === 'anonymous' ? 'anonymous' : `credential:${row.account.binding}`

export function createMemoryTaskRecords(): MemoryTaskRecords {
  const kept = new Map<string, Kept>()
  let reachable = true
  const only = (key: TaskRowKey) => {
    const found = kept.get(textOf(key))
    return found?.rows.length === 1 ? found : undefined
  }
  return {
    async record(key, row) {
      if (!reachable) return fail('unavailable')
      const found = kept.get(textOf(key))
      const others = found?.rows.filter(item => accountOf(item) !== accountOf(row)) ?? []
      kept.set(textOf(key), { key, rows: [...others, row] })
      return succeed('recorded')
    },
    async read(key) {
      if (!reachable) return fail('unavailable')
      const found = kept.get(textOf(key))
      if (found === undefined) return succeed('absent')
      return found.rows.length === 1 ? succeed(found.rows[0] as TaskRow) : succeed('ambiguous')
    },
    async move(key, from, to) {
      if (!reachable) return fail('unavailable')
      const found = only(key)
      const row = found?.rows[0]
      if (found === undefined || row === undefined) return succeed('stale')
      if (row.state !== from.state || row.round !== from.round) return succeed('stale')
      const { arrival: _arrival, ...rest } = row
      found.rows[0] = { ...rest, ...to }
      return succeed('moved')
    },
    async following(tenant) {
      if (!reachable) return fail('unavailable')
      return succeed(
        [...kept.values()]
          .filter(item => tenantText(item.key.tenant) === tenantText(tenant))
          .filter(item => item.rows.length === 1 && item.rows[0]?.state === 'following')
          .map(item => ({ key: item.key, row: item.rows[0] as TaskRow })),
      )
    },
    rows: () => [...kept.values()].flatMap(item => item.rows),
    cut: () => {
      reachable = false
    },
    mend: () => {
      reachable = true
    },
  }
}
