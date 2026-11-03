import { afterEach, expect, test } from 'vitest'
import { createScheduleManagementSqlBackend } from '@omne-harness/schedule-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { ScheduleIdSchema } from '@omne-harness/schedule-contract'
import { context, createCommand, definition, recovery } from './data.ts'
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
function backend(w: World, storage: SqlStorage) {
  return createScheduleManagementSqlBackend({
    storage,
    scope: w.scope,
    combinationVersion: w.combination.combinationVersion,
    manifestDigest: w.combination.manifestDigest,
    guards: w.guards,
  })
}
function locator(command: ReturnType<typeof createCommand>) {
  return {
    kind: 'identity',
    identity: command.input.operation.address,
    expectedFingerprint: command.input.operation.fingerprint,
  } as const
}

test('a lost committed response keeps the original identity and is recovered by address and ref after reopening', async () => {
  const w = await world({
    wrap: storage => ({
      ...storage,
      async commit(input) {
        const result = await storage.commit(input)
        if (input.identity.operation.startsWith('schedule.management.'))
          return { kind: 'unknown', identity: input.identity, diagnostic: 'injected_response_loss' }
        return result
      },
    }),
  })
  const command = createCommand()
  expect(await w.persistence.commit(command)).toMatchObject({
    kind: 'unknown',
    operationRef: command.input.operation.operationRef,
  })
  await w.close()
  worlds.splice(worlds.indexOf(w), 1)
  const reopened = await world({ root: w.root, configure: false })
  const address = await reopened.persistence.query({ scope: recovery(), locator: locator(command) })
  expect(address).toMatchObject({
    kind: 'ok',
    value: { kind: 'committed', result: { scheduleId: command.input.allocatedId } },
  })
  expect(
    await reopened.persistence.query({
      scope: recovery(),
      locator: { kind: 'ref', operationRef: command.input.operation.operationRef },
    }),
  ).toEqual(address)
}, 15000)

test('only a real SQL negative with all five proofs maps to notCommitted; missing ref, thrown query and partial proofs remain unknown', async () => {
  const w = await world()
  const command = createCommand()
  const input = { scope: recovery(), locator: locator(command) }
  expect(await w.persistence.query(input)).toMatchObject({
    kind: 'ok',
    value: {
      kind: 'notCommitted',
      notCommittedProofs: {
        writerGenerationExcluded: true,
        oldTransactionTerminated: true,
        databaseRecoveryFinished: true,
        authoritativeReadSucceeded: true,
        operationNotQueued: true,
      },
    },
  })
  expect(
    await w.persistence.query({
      scope: recovery(),
      locator: { kind: 'ref', operationRef: command.input.operation.operationRef },
    }),
  ).toMatchObject({ kind: 'ok', value: { kind: 'unknown' } })
  const throwing = backend(w, {
    ...w.raw,
    async query() {
      throw new Error('Injected query failure')
    },
  })
  expect(await throwing.persistence.query(input)).toMatchObject({
    kind: 'ok',
    value: { kind: 'unknown' },
  })
  for (const key of [
    'writerGenerationExcluded',
    'oldTransactionTerminated',
    'databaseRecoveryFinished',
    'authoritativeReadSucceeded',
    'operationNotQueued',
  ]) {
    const missing = backend(w, {
      ...w.raw,
      async query(identity) {
        const result = structuredClone(await w.raw.query(identity))
        if (result.kind === 'not_committed') Reflect.deleteProperty(result.proofs, key)
        return result
      },
    })
    expect(await missing.persistence.query(input)).toMatchObject({
      kind: 'ok',
      value: { kind: 'unknown' },
    })
  }
}, 15000)

test.each(['identity', 'combination', 'participant', 'binding', 'payload'])(
  'a corrupted %s in a real SQL receipt is not accepted',
  async fault => {
    const w = await world()
    const command = createCommand()
    expect(await w.persistence.commit(command)).toMatchObject({ kind: 'recorded' })
    const corrupt = backend(w, {
      ...w.raw,
      async query(identity) {
        const result = structuredClone(await w.raw.query(identity))
        if (result.kind === 'committed') {
          if (fault === 'identity')
            return { ...result, identity: { ...result.identity, operationKey: 'wrong' } }
          if (fault === 'combination') return { ...result, manifestDigest: '0'.repeat(64) }
          const own = result.responses[1]
          if (own === undefined) throw new Error('Missing persistence response')
          if (fault === 'participant') Reflect.set(own, 'participant', 'other.participant')
          if (fault === 'payload') Reflect.set(own.reply, 'response', { kind: 'committed' })
          if (fault === 'binding') {
            const response = own.reply.response
            if (response !== null && typeof response === 'object' && 'binding' in response)
              Reflect.set(response, 'binding', { allowed: true })
          }
        }
        return result
      },
    })
    expect(
      await corrupt.persistence.query({ scope: recovery(), locator: locator(command) }),
    ).toMatchObject({ kind: 'ok', value: { kind: 'unknown' } })
  },
  15000,
)

test('a fault after both replacement records and quota transfer rolls the whole operation back', async () => {
  let fault = false
  const w = await world({
    wrap: storage => ({
      ...storage,
      commit(input) {
        return storage.commit(
          fault && input.identity.operation.startsWith('schedule.management.')
            ? {
                ...input,
                commands: [
                  ...input.commands,
                  { participant: 'fixture.schedule.after', facts: { mode: 'throw' } },
                ],
              }
            : input,
        )
      },
    }),
  })
  const created = await w.commands.create(context, {
    definition,
    initial: { kind: 'active' },
    meta: { operationKey: 'before-fault', expectedRevision: null, consentRef: null },
  })
  if (created.kind !== 'committed') throw new Error(JSON.stringify(created))
  const before = w.sql('SELECT record FROM sc_schedules')
  fault = true
  const result = await w.commands.execute(context, {
    action: 'replace',
    scheduleId: created.value.scheduleId,
    successor: { ...definition, label: 'Must roll back' },
    reason: 'Fault probe',
    meta: { operationKey: 'fault-replace', expectedRevision: 1, consentRef: null },
  })
  expect(result.kind).toBe('unknown')
  expect(w.sql('SELECT record FROM sc_schedules')).toEqual(before)
  expect(w.sql('SELECT count(*) AS count FROM sc_definitions')).toEqual([{ count: 1 }])
  expect(w.sql('SELECT count(*) AS count FROM sc_revisions')).toEqual([{ count: 1 }])
  expect(w.sql('SELECT count(*) AS count FROM sc_outbox')).toEqual([{ count: 1 }])
  expect(w.sql('SELECT count(*) AS count, sum(held) AS held FROM fixture_schedule_quota')).toEqual([
    { count: 1, held: 1 },
  ])
  expect(
    await w.store.readSchedule({
      owner: context.owner,
      scheduleId: ScheduleIdSchema.parse('00000000-0000-4000-8000-000000000000'),
    }),
  ).toEqual({ kind: 'absent' })
}, 15000)
