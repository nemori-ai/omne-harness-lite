import { afterEach, expect, test } from 'vitest'
import { createScheduleManagementIdentity } from '@omne-harness/schedule'
import { ScheduleCallContextSchema, ScheduleIdSchema } from '@omne-harness/schedule-contract'
import {
  access,
  context,
  createCommand,
  listRequest,
  observation,
  readAccess,
  recovery,
} from './data.ts'
import { openWorld, type World } from './world.ts'
const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function world() {
  const w = await openWorld()
  worlds.push(w)
  return w
}

test('501 records have exact totals, permission filtering precedes pagination and cursors bind all observations', async () => {
  const w = await world()
  const ids = Array.from({ length: 501 }, (_, i) =>
    ScheduleIdSchema.parse(`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`),
  )
  for (let offset = 0; offset < ids.length; offset += 20) {
    const results = await Promise.all(
      ids.slice(offset, offset + 20).map(id => {
        const command = createCommand()
        return w.persistence.commit({ ...command, input: { ...command.input, allocatedId: id } })
      }),
    )
    expect(results.every(result => result.kind === 'recorded')).toBe(true)
  }
  const first = await w.store.listSchedules({ access: readAccess(), request: listRequest() })
  if (first.kind !== 'ok') throw new Error(JSON.stringify(first))
  expect(first.value.total).toEqual({ kind: 'exact', value: 501 })
  expect(first.value.items).toHaveLength(50)
  const second = await w.store.listSchedules({
    access: readAccess(),
    request: { ...listRequest(), cursor: first.value.nextCursor },
  })
  expect(second).toMatchObject({
    kind: 'ok',
    value: {
      total: { kind: 'exact', value: 501 },
      items: [{ scheduleId: ids[50] }, ...Array(49).fill(expect.anything())],
    },
  })
  const granted = {
    ...readAccess(),
    visibility: { kind: 'grantedIds', scheduleIds: ids.slice(-2) },
  } as const
  const selected = await w.store.listSchedules({
    access: granted,
    request: { ...listRequest(), limit: 1 },
  })
  expect(selected).toMatchObject({
    kind: 'ok',
    value: { total: { kind: 'exact', value: 2 }, items: [{ scheduleId: ids[499] }] },
  })
  const cursor = first.value.nextCursor
  for (const altered of [
    { access: { ...readAccess(), authorityRevision: 'authority:2' }, request: listRequest() },
    { access: granted, request: listRequest() },
    {
      access: { ...readAccess(), owner: { kind: 'tenant', tenantId: 't1', ownerId: 'bob' } },
      request: listRequest(),
    },
    { access: readAccess(), request: { ...listRequest(), control: 'paused' } },
  ] as const)
    expect(
      await w.store.listSchedules({ ...altered, request: { ...altered.request, cursor } }),
    ).toEqual({ kind: 'changed' })
  expect(await w.persistence.commit(createCommand())).toMatchObject({ kind: 'recorded' })
  expect(
    await w.store.listSchedules({ access: readAccess(), request: { ...listRequest(), cursor } }),
  ).toEqual({ kind: 'changed' })
}, 30000)

test('owners, authored ID intersections, author and calendar filters remain separate', async () => {
  const w = await world()
  const alice = createCommand()
  expect(await w.persistence.commit(alice)).toMatchObject({ kind: 'recorded' })
  const agent = ScheduleCallContextSchema.parse({
    ...context,
    actor: { kind: 'agent', actorRef: 'agent:one' },
    principalRef: 'principal:agent',
    originatingSessionRef: 'session:origin',
  })
  await w.configure({ access: access(agent) })
  const command = createCommand('agent-create', agent)
  const definition = {
    ...command.input.request.input.definition,
    binding: {
      kind: 'explicit',
      timezone: command.input.definition.basis.timezone,
      calendar: { calendarId: 'calendar:chosen', version: { kind: 'latest' } },
    },
  } as const
  const request = { kind: 'create', input: { ...command.input.request.input, definition } } as const
  const authored = {
    ...command,
    input: {
      ...command.input,
      request,
      definition: observation(definition),
      operation: createScheduleManagementIdentity(recovery(agent), request),
    },
  }
  expect(await w.persistence.commit(authored)).toMatchObject({ kind: 'recorded' })
  const visible = {
    ...readAccess(),
    visibility: {
      kind: 'authoredIds',
      author: access(agent).authority.authorOnCreate,
      scheduleIds: [alice.input.allocatedId, command.input.allocatedId],
    },
  } as const
  expect(await w.store.listSchedules({ access: visible, request: listRequest() })).toMatchObject({
    kind: 'ok',
    value: {
      total: { kind: 'exact', value: 1 },
      items: [{ scheduleId: command.input.allocatedId }],
    },
  })
  expect(
    await w.store.getSchedule({ access: visible, scheduleId: alice.input.allocatedId }),
  ).toEqual({ kind: 'absent' })
  expect(
    await w.store.listSchedules({
      access: readAccess(),
      request: {
        ...listRequest(),
        agentRef: 'agent:one',
        calendarId: 'calendar:chosen',
        createdBy: 'agent:one',
        control: 'active',
        standing: 'ready',
        purpose: 'reminder',
      },
    }),
  ).toMatchObject({ kind: 'ok', value: { total: { kind: 'exact', value: 1 } } })
  expect(
    await w.store.listSchedules({
      access: readAccess(),
      request: { ...listRequest(), targetDeviceRef: 'unrelated-device' },
    }),
  ).toMatchObject({ kind: 'ok', value: { total: { kind: 'exact', value: 0 } } })
  const bob = {
    ...readAccess(),
    owner: { kind: 'tenant', tenantId: 't1', ownerId: 'bob' },
  } as const
  expect(await w.store.listSchedules({ access: bob, request: listRequest() })).toMatchObject({
    kind: 'ok',
    value: { total: { kind: 'exact', value: 0 } },
  })
  expect(await w.store.getSchedule({ access: bob, scheduleId: alice.input.allocatedId })).toEqual({
    kind: 'absent',
  })
  expect(
    await w.store.readSchedule({
      owner: { kind: 'system', systemScopeRef: 'system:one' },
      scheduleId: alice.input.allocatedId,
    }),
  ).toMatchObject({ kind: 'unavailable', error: { code: 'forbidden' } })
}, 15000)
