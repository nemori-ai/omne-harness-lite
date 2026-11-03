import { afterEach, expect, test } from 'vitest'
import {
  ScheduleCallContextSchema,
  type ScheduleCallContext,
} from '@omne-harness/schedule-contract'
import { createScheduleManagementSqlBackend } from '@omne-harness/schedule-local'
import { access, context, createCommand, listRequest, readAccess, recovery } from './data.ts'
import { openWorld, type World } from './world.ts'
const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function world(options: Parameters<typeof openWorld>[0] = {}) {
  const w = await openWorld(options)
  worlds.push(w)
  return w
}

test('extra input scope cannot replace the backend scope on any read method', async () => {
  const w = await world()
  const command = createCommand('bound-read-scope')
  expect(await w.persistence.commit(command)).toMatchObject({ kind: 'recorded' })
  const backend = createScheduleManagementSqlBackend({
    storage: w.raw,
    scope: { kind: 'tenant', tenant: 't2' },
    combinationVersion: w.combination.combinationVersion,
    manifestDigest: w.combination.manifestDigest,
    guards: w.guards,
  })
  const input = {
    scheduleId: command.input.allocatedId,
    scope: w.scope,
  }
  const list = { scope: w.scope, access: readAccess(), request: listRequest() }
  const revisions = {
    scope: w.scope,
    access: readAccess(),
    request: { scheduleId: input.scheduleId, cursor: null, limit: 50 },
  }
  const results = [
    await backend.store.readSchedule({ ...input, owner: context.owner }),
    await backend.store.getSchedule({ ...input, access: readAccess() }),
    await backend.store.listSchedules(list),
    await backend.store.readRevisions(revisions),
  ]
  for (const result of results)
    expect(result).toMatchObject({ kind: 'unavailable', error: { code: 'forbidden' } })
})

test.each([
  { basisGuard: 'basis:revoked' },
  { quotaGuard: 'quota:revoked' },
  { actions: ['pause'] },
  { purposes: ['execution'] },
  {
    access: { ...access(), authority: { ...access().authority, authorityVersion: 'authority:2' } },
  },
])(
  'a stale or wrong authoritative binding leaves zero business changes: %j',
  async configuration => {
    const w = await world()
    await w.configure(configuration)
    expect(await w.persistence.commit(createCommand())).toMatchObject({ kind: 'rejected' })
    expect(w.sql('SELECT count(*) AS count FROM sc_operations')).toEqual([{ count: 0 }])
    expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 0 }])
    expect(w.sql('SELECT count(*) AS count FROM fixture_schedule_quota')).toEqual([{ count: 0 }])
  },
  15000,
)

test('a forged principal, owner, operation address or storage scope is rejected', async () => {
  const w = await world()
  for (const change of [
    { ...context, principalRef: 'principal:other' },
    { ...context, owner: { kind: 'tenant', tenantId: 't1', ownerId: 'bob' } },
    { ...context, owner: { kind: 'tenant', tenantId: 't2', ownerId: 'alice' } },
  ] satisfies ScheduleCallContext[]) {
    expect(await w.persistence.commit(createCommand('forged', change))).toMatchObject({
      kind: 'rejected',
    })
  }
  const command = createCommand()
  const forged = {
    ...command,
    input: {
      ...command.input,
      operation: {
        ...command.input.operation,
        address: { ...command.input.operation.address, operationKey: 'other-address' },
      },
    },
  }
  expect(await w.persistence.commit(forged)).toMatchObject({
    kind: 'rejected',
    error: { code: 'forbidden' },
  })
  expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 0 }])
}, 15000)

test('the participant rechecks raw SQL commands instead of trusting the control-side validation', async () => {
  const w = await world()
  const command = createCommand()
  const original = await w.persistence.commit(command)
  expect(original.kind).toBe('recorded')
  const target = createCommand()
  let request: Parameters<World['raw']['commit']>[0] | undefined
  const capture = createScheduleManagementSqlBackend({
    storage: {
      ...w.raw,
      async commit(input) {
        request = input
        return { kind: 'unknown', identity: input.identity, diagnostic: 'captured' }
      },
    },
    scope: w.scope,
    combinationVersion: w.combination.combinationVersion,
    manifestDigest: w.combination.manifestDigest,
    guards: w.guards,
  })
  await capture.persistence.commit(target)
  if (request === undefined) throw new Error('No SQL command captured')
  const own = request.commands[1]
  const guard = request.commands[0]
  if (own === undefined || guard === undefined) throw new Error('No management participant')
  const corrupt = {
    ...request,
    commands: [guard, { ...own, facts: { requirement: { allowed: true } } }],
  }
  const result = await w.raw.commit(corrupt)
  expect(result.kind).toBe('rolled_back')
  expect(w.sql('SELECT count(*) AS count FROM sc_schedules')).toEqual([{ count: 1 }])
  expect(w.sql('SELECT count(*) AS count FROM fixture_schedule_quota')).toEqual([{ count: 1 }])
}, 15000)

test('system owners are isolated from one another and cannot consume a tenant backend', async () => {
  const w = await world({ scope: { kind: 'system' }, configure: false })
  const system = ScheduleCallContextSchema.parse({
    ...context,
    owner: { kind: 'system', systemScopeRef: 'system:a' },
    actor: { kind: 'system', actorRef: 'system:worker' },
    principalRef: 'system:principal',
  })
  await w.configure({ access: access(system) })
  const command = createCommand('system-create', system)
  expect(await w.persistence.commit(command)).toMatchObject({ kind: 'recorded' })
  expect(
    await w.store.listSchedules({ access: readAccess(system), request: listRequest() }),
  ).toMatchObject({ kind: 'ok', value: { total: { value: 1 } } })
  const other = { ...system, owner: { kind: 'system', systemScopeRef: 'system:b' } } as const
  expect(
    await w.store.getSchedule({ access: readAccess(other), scheduleId: command.input.allocatedId }),
  ).toEqual({ kind: 'absent' })
  expect(
    await w.persistence.query({
      scope: recovery(other),
      locator: { kind: 'ref', operationRef: command.input.operation.operationRef },
    }),
  ).toMatchObject({ kind: 'ok', value: { kind: 'unknown' } })
  expect(await w.persistence.commit(createCommand())).toMatchObject({
    kind: 'rejected',
    error: { code: 'forbidden' },
  })
}, 15000)

test('read errors remain unavailable and do not become empty or absent results', async () => {
  const w = await world({
    wrap: storage => ({
      ...storage,
      async read(input) {
        return {
          kind: 'unavailable',
          requestKey: input.requestKey,
          reason: 'read_limit',
          diagnostic: null,
        }
      },
    }),
  })
  expect(
    await w.store.listSchedules({ access: readAccess(), request: listRequest() }),
  ).toMatchObject({
    kind: 'unavailable',
    error: { code: 'provider_failure', message: 'read_limit' },
  })
  const command = createCommand()
  expect(
    await w.store.readSchedule({ owner: context.owner, scheduleId: command.input.allocatedId }),
  ).toMatchObject({ kind: 'unavailable' })
}, 15000)
