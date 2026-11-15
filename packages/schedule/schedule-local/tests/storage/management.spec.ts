import { afterEach, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createScheduleManagementIdentity, type ManagementCommit } from '@omne-harness/schedule'
import {
  ScheduleCommandSchema,
  type ScheduleView,
  type ScheduleManagementResult,
  type ScheduleCommand,
} from '@omne-harness/schedule-contract'
import { access, context, createCommand, definition, now, readAccess, recovery } from './data.ts'
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
function saved(result: ScheduleManagementResult): ScheduleView {
  if (result.kind !== 'committed' && result.kind !== 'noChange')
    throw new Error(JSON.stringify(result))
  return result.value
}
function action(view: ScheduleView, kind: ScheduleCommand['action'], extra = {}): ScheduleCommand {
  return ScheduleCommandSchema.parse({
    action: kind,
    scheduleId: view.scheduleId,
    ...(kind === 'update' ? {} : { reason: null }),
    meta: { operationKey: randomUUID(), expectedRevision: view.revision, consentRef: null },
    ...extra,
  })
}
async function create(w: World, draft = false) {
  return saved(
    await w.commands.create(context, {
      definition,
      initial: draft ? { kind: 'draft', reason: 'Prepare' } : { kind: 'active' },
      meta: { operationKey: randomUUID(), expectedRevision: null, consentRef: null },
    }),
  )
}
test('draft revision, promotion, discard and active controls persist immutable revisions and noChange only adds a receipt', async () => {
  const w = await world()
  const draft = await create(w, true)
  const revised = saved(
    await w.commands.execute(
      context,
      action(draft, 'reviseDraft', {
        reason: 'edit',
        definition: { ...definition, label: 'Draft 2' },
      }),
    ),
  )
  const promoted = saved(await w.commands.execute(context, action(revised, 'promote')))
  expect(promoted).toMatchObject({ control: 'active', definitionRevision: 2, promotedAt: now })
  const paused = saved(await w.commands.execute(context, action(promoted, 'pause')))
  const updated = saved(
    await w.commands.execute(
      context,
      action(paused, 'update', { patch: { kind: 'label', label: 'Paused edit' } }),
    ),
  )
  expect(updated).toMatchObject({ control: 'paused', definitionRevision: 3, timeRuleRevision: 1 })
  const before = w.sql(
    'SELECT (SELECT count(*) FROM sc_revisions) AS revisions, (SELECT count(*) FROM sc_outbox) AS outbox, (SELECT sum(held) FROM fixture_schedule_quota) AS quota, (SELECT revision FROM sc_observations LIMIT 1) AS observation',
  )
  const noChange = await w.commands.execute(context, action(updated, 'pause'))
  expect(noChange).toMatchObject({ kind: 'noChange', value: updated })
  expect(
    w.sql(
      'SELECT (SELECT count(*) FROM sc_revisions) AS revisions, (SELECT count(*) FROM sc_outbox) AS outbox, (SELECT sum(held) FROM fixture_schedule_quota) AS quota, (SELECT revision FROM sc_observations LIMIT 1) AS observation',
    ),
  ).toEqual(before)
  const resumed = saved(await w.commands.execute(context, action(updated, 'resume')))
  const stopped = saved(await w.commands.execute(context, action(resumed, 'stop')))
  expect(stopped.control).toBe('stopped')
  const another = await create(w, true)
  const discarded = saved(await w.commands.execute(context, action(another, 'discard')))
  expect(discarded.control).toBe('discarded')
  expect(
    w.sql(`SELECT count(*) AS count FROM sc_definitions WHERE schedule_id = '${draft.scheduleId}'`),
  ).toEqual([{ count: 3 }])
  const revisions = await w.store.readRevisions({
    access: readAccess(),
    request: { scheduleId: draft.scheduleId, cursor: null, limit: 500 },
  })
  expect(revisions).toMatchObject({ kind: 'ok', value: { total: { kind: 'exact', value: 7 } } })
  const firstPage = await w.store.readRevisions({
    access: readAccess(),
    request: { scheduleId: draft.scheduleId, cursor: null, limit: 2 },
  })
  if (firstPage.kind !== 'ok') throw new Error(JSON.stringify(firstPage))
  expect(firstPage.value.items.map(item => item.action)).toEqual(['create', 'reviseDraft'])
  const nextPage = await w.store.readRevisions({
    access: readAccess(),
    request: { scheduleId: draft.scheduleId, cursor: firstPage.value.nextCursor, limit: 2 },
  })
  if (nextPage.kind !== 'ok') throw new Error(JSON.stringify(nextPage))
  expect(nextPage.value.items.map(item => item.action)).toEqual(['promote', 'pause'])
  expect(nextPage.value.total).toEqual({ kind: 'exact', value: 7 })
  expect(
    await w.store.readRevisions({
      access: { ...readAccess(), authorityRevision: 'new-authority' },
      request: { scheduleId: draft.scheduleId, cursor: firstPage.value.nextCursor, limit: 2 },
    }),
  ).toEqual({ kind: 'changed' })

  await w.close()
  worlds.splice(worlds.indexOf(w), 1)
  const reopened = await openWorld({ root: w.root, configure: false })
  worlds.push(reopened)
  for (const view of [stopped, discarded])
    expect(
      await reopened.store.readSchedule({ owner: context.owner, scheduleId: view.scheduleId }),
    ).toMatchObject({ kind: 'ok', value: { value: { view } } })
}, 20000)

test('replace transfers one holding to the current author and preserves both lineage directions', async () => {
  const w = await world()
  const predecessor = saved(await w.commands.execute(context, action(await create(w), 'pause')))
  const nextContext = {
    ...context,
    principalRef: 'principal:bob',
    actor: { kind: 'human', actorRef: 'bob' },
  } as const
  await w.configure({ access: access(nextContext), capacity: 0 })
  expect(
    await w.commands.execute(
      nextContext,
      action(predecessor, 'replace', { successor: definition, reason: 'New author has no quota' }),
    ),
  ).toMatchObject({ kind: 'rejected', error: { code: 'capacity_exceeded' } })
  expect(w.sql('SELECT sum(held) AS count FROM fixture_schedule_quota')).toEqual([{ count: 1 }])
  expect(
    await w.store.readSchedule({ owner: context.owner, scheduleId: predecessor.scheduleId }),
  ).toMatchObject({ kind: 'ok', value: { value: { view: predecessor } } })
  await w.configure({ access: access(nextContext) })
  const replacement = await w.commands.execute(
    nextContext,
    action(predecessor, 'replace', {
      successor: { ...definition, label: 'Successor' },
      reason: 'New work',
    }),
  )
  const successor = saved(replacement)
  expect(successor).toMatchObject({
    control: 'paused',
    predecessorId: predecessor.scheduleId,
    author: { kind: 'human', actorRef: 'bob' },
  })
  expect(
    await w.store.readSchedule({ owner: context.owner, scheduleId: predecessor.scheduleId }),
  ).toMatchObject({
    kind: 'ok',
    value: {
      value: {
        view: { control: 'superseded', successorId: successor.scheduleId },
        quota: { kind: 'transferred', successorId: successor.scheduleId },
      },
    },
  })
  expect(w.sql('SELECT sum(held) AS count FROM fixture_schedule_quota')).toEqual([{ count: 1 }])
  expect(w.sql('SELECT count(*) AS count FROM sc_outbox')).toEqual([{ count: 4 }])
  expect(
    await w.commands.execute(
      nextContext,
      action(predecessor, 'replace', { successor: definition, reason: 'Old CAS' }),
    ),
  ).toMatchObject({ kind: 'rejected', error: { code: 'revision_conflict' } })
}, 15000)

test('reconfirm retains pause and saves the adopted consent', async () => {
  const w = await world()
  const paused = saved(await w.commands.execute(context, action(await create(w), 'pause')))
  const consent = {
    kind: 'adopt',
    guardRef: 'consent:guard',
    adoption: {
      grantRef: 'grant:new',
      generation: 2,
      adoptionKind: 'blanket',
      scope: 'standing',
      adoptedAt: now,
    },
  } as const
  await w.configure({ access: { ...access(), consent } })
  const reconfirmed = saved(
    await w.commands.execute(
      context,
      action(paused, 'reconfirmConsent', { newConsentRef: 'grant:new', reason: 'Consent again' }),
    ),
  )
  expect(reconfirmed).toMatchObject({ control: 'paused', consentAdoption: consent.adoption })
}, 15000)

test('a preobserved record loses CAS inside SQL and quota capacity serializes parallel creates', async () => {
  const w = await world()
  const view = await create(w)
  const original = await w.store.readSchedule({ owner: context.owner, scheduleId: view.scheduleId })
  if (original.kind !== 'ok') throw new Error(JSON.stringify(original))
  const request = { kind: 'execute', input: action(view, 'resume') } as const
  const command: ManagementCommit = {
    kind: 'saveDefinition',
    input: {
      ...createCommand().input,
      request,
      operation: createScheduleManagementIdentity(recovery(), request),
      current: original.value.value,
      allocatedId: null,
      definition: { kind: 'notNeeded' },
      quotaObservation: { guardRef: 'quota:guard', resultingHolding: null },
    },
  }
  saved(await w.commands.execute(context, action(view, 'pause')))
  expect(await w.persistence.commit(command)).toMatchObject({
    kind: 'rejected',
    error: { code: 'revision_conflict' },
  })
  await w.configure({ capacity: 2 })
  const results = await Promise.all([
    w.persistence.commit(createCommand()),
    w.persistence.commit(createCommand()),
  ])
  expect(results.filter(value => value.kind === 'recorded')).toHaveLength(1)
  expect(results).toContainEqual(
    expect.objectContaining({
      kind: 'rejected',
      error: expect.objectContaining({ code: 'capacity_exceeded' }),
    }),
  )
  expect(w.sql('SELECT sum(held) AS count FROM fixture_schedule_quota')).toEqual([{ count: 2 }])
}, 15000)
