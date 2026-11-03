import { afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createScheduleManagementIdentity } from '@omne-harness/schedule'
import { ScheduleIdSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import { createCommand, context, recovery, definition } from './data.ts'
import { openWorld, type World } from './world.ts'
const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function world() {
  const value = await openWorld()
  worlds.push(value)
  return value
}

test('commits through the public application and recognizes the durable result after reopening', async () => {
  const w = await world()
  const command = createCommand()
  if (command.input.request.kind !== 'create') throw new Error('Expected create')
  const first = await w.commands.create(context, command.input.request.input)
  expect(first.kind).toBe('committed')
  await w.close()
  worlds.splice(worlds.indexOf(w), 1)
  const reopened = await openWorld({ root: w.root, configure: false })
  worlds.push(reopened)
  const retry = await reopened.commands.create(
    { ...context, requestId: 'retry:later' },
    command.input.request.input,
  )
  expect(retry).toEqual({ ...first, replayed: true })
  if (first.kind !== 'committed') throw new Error(JSON.stringify(first))
  expect(
    await reopened.store.readSchedule({ owner: context.owner, scheduleId: first.value.scheduleId }),
  ).toMatchObject({ kind: 'ok', value: { value: { view: first.value } } })
}, 15000)

test('concurrent retries with changed request time and allocated IDs recognize the first business result', async () => {
  const w = await world()
  const first = createCommand()
  const second = {
    ...first,
    input: {
      ...first.input,
      requestId: 'retry:2',
      now: ScheduleInstantSchema.parse('2026-11-04T01:00:00.000Z'),
      allocatedId: ScheduleIdSchema.parse(randomUUID()),
      quotaObservation: {
        guardRef: 'quota:guard',
        resultingHolding: { kind: 'held', reservationRef: 'reservation:retry' },
      },
    },
  } as const
  const concurrent = await Promise.all([w.persistence.commit(first), w.persistence.commit(second)])
  expect(concurrent.some(result => result.kind === 'recorded')).toBe(true)
  const results = await Promise.all([w.persistence.commit(first), w.persistence.commit(second)])
  expect(results.map(result => result.kind)).toEqual(['recorded', 'recorded'])
  if (results[0]?.kind !== 'recorded' || results[1]?.kind !== 'recorded')
    throw new Error(JSON.stringify(results))
  expect(results[0].view).toEqual(results[1].view)
  const request = {
    kind: 'create',
    input: {
      ...first.input.request.input,
      definition: { ...definition, label: 'different intent' },
    },
  } as const
  const conflict = {
    ...first,
    input: {
      ...first.input,
      request,
      operation: createScheduleManagementIdentity(recovery(), request),
    },
  }
  expect(await w.persistence.commit(conflict)).toMatchObject({
    kind: 'rejected',
    error: { code: 'operation_key_conflict' },
  })
  expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 1 }])
}, 15000)

test.each(['deny', 'consent', 'boolean', 'misbound', 'missing', 'sql'])(
  'guard mode %s cannot leave business or quota writes',
  async mode => {
    const w = await world()
    await w.configure({ mode })
    const command = createCommand()
    const result = await w.persistence.commit(command)
    expect(result.kind).not.toBe('recorded')
    expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 0 }])
    expect(w.sql('SELECT count(*) AS count FROM fixture_schedule_quota')).toEqual([{ count: 0 }])
    expect(
      await w.persistence.query({
        scope: recovery(),
        locator: {
          kind: 'identity',
          identity: command.input.operation.address,
          expectedFingerprint: command.input.operation.fingerprint,
        },
      }),
    ).not.toMatchObject({ value: { kind: 'notCommitted' } })
  },
  15000,
)

test('transaction decision time rejects a candidate that stopped being strictly future and rolls quota back', async () => {
  const w = await world()
  await w.configure({ decisionAt: '2026-11-05T09:00:00.000Z' })
  expect(await w.persistence.commit(createCommand())).toMatchObject({
    kind: 'rejected',
    error: { code: 'stale_basis' },
  })
  expect(w.sql('SELECT count(*) AS count FROM fixture_schedule_quota')).toEqual([{ count: 0 }])
  expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 0 }])
}, 15000)
