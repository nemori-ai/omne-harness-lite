import { afterEach, expect, it } from 'vitest'
import { evaluateSettings } from '@omne-harness/settings'
import { openSettingsComposition } from './settings-composition-world.ts'

const worlds: Awaited<ReturnType<typeof openSettingsComposition>>[] = []
async function open(options: Parameters<typeof openSettingsComposition>[0] = {}) {
  const world = await openSettingsComposition(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('reads a real complete catalog basis and observes SettingsCommands changes without mutating the old basis', async () => {
  const w = await open()
  const old = await w.catalog.read(w.principal, w.request)
  expect(old).not.toHaveProperty('kind')
  if ('kind' in old) throw new Error(JSON.stringify(old))
  const preserved = structuredClone(old)
  const oldView = old.views[0]
  if (!oldView) throw new Error('Expected the declared environment target')
  expect(old.completeness).toBe('complete')
  expect(old.views).toHaveLength(1)
  expect(await w.environment.read(w.context)).toEqual({
    kind: 'found',
    value: {
      owner: w.context.owner,
      revision: old.revision,
      timezone: 'Asia/Tokyo',
      calendarId: 'jp',
    },
  })
  expect(await w.change('timezone', { kind: 'set', value: 'Europe/Paris' }, 0)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  const next = await w.catalog.read(w.principal, w.request)
  if ('kind' in next) throw new Error(JSON.stringify(next))
  expect(next.revision).not.toBe(old.revision)
  expect(await w.environment.read(w.context)).toEqual({
    kind: 'found',
    value: {
      owner: w.context.owner,
      revision: next.revision,
      timezone: 'Europe/Paris',
      calendarId: 'jp',
    },
  })
  expect(old).toEqual(preserved)
  expect(
    evaluateSettings({ definition: oldView.definition, sources: oldView.state.sources }),
  ).toMatchObject({
    kind: 'complete',
    entries: expect.arrayContaining([
      expect.objectContaining({
        itemId: 'timezone',
        value: { kind: 'value', value: 'Asia/Tokyo' },
      }),
    ]),
  })
})

it('rechecks real Identity membership after removal and denies the previously issued principal', async () => {
  const w = await open()
  expect(await w.environment.read(w.context)).toMatchObject({ kind: 'found' })
  expect(await w.removeMember()).toEqual({ kind: 'succeeded' })
  expect(await w.catalog.read(w.principal, w.request)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await w.environment.read(w.context)).toEqual({ kind: 'unavailable' })
})

it('rejects a different tenant context even when the trusted resolver accidentally returns the original binding', async () => {
  const w = await open()
  expect(await w.environment.read(w.context)).toMatchObject({ kind: 'found' })
  expect(await w.environment.read(w.foreignContext)).toEqual({ kind: 'unavailable' })
  expect(await w.catalog.read(w.foreignPrincipal, w.request)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})

it('rechecks standalone target retirement and declaration availability', async () => {
  const w = await open()
  expect(await w.environment.read(w.context)).toMatchObject({ kind: 'found' })
  w.registry.releaseContribution(w.registration.registrationId)
  expect(await w.environment.read(w.context)).toEqual({ kind: 'unavailable' })
  expect(w.registry.registerContribution(w.definition)).toMatchObject({ kind: 'registered' })
  expect(await w.environment.read(w.context)).toMatchObject({ kind: 'found' })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire',
      target: w.target,
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.environment.read(w.context)).toEqual({ kind: 'unavailable' })
})

it('uses declared defaults after clear and preserves explicit null calendar without an implicit fallback', async () => {
  const w = await open()
  expect(await w.change('timezone', { kind: 'set', value: 'Europe/Paris' }, 0)).toMatchObject({
    kind: 'committed',
  })
  expect(await w.change('timezone', { kind: 'clear' }, 1)).toMatchObject({ kind: 'committed' })
  expect(await w.change('calendar', { kind: 'set', value: null }, 2)).toMatchObject({
    kind: 'committed',
  })
  expect(await w.environment.read(w.context)).toMatchObject({
    kind: 'found',
    value: { timezone: 'Asia/Tokyo', calendarId: null },
  })
})

it('reports an absent timezone as missing instead of supplying UTC', async () => {
  const w = await open({ absentTimezone: true })
  expect(await w.environment.read(w.context)).toEqual({ kind: 'missing' })
})

it('closes the real SQL provider and stops new catalog reads', async () => {
  const w = await open()
  await w.close()
  expect(w.lifecycle.leases.size).toBe(0)
  expect(w.lifecycle.storageClosed).toBe(true)
  expect(await w.catalog.read(w.principal, w.request)).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
  expect(await w.environment.read(w.context)).toEqual({ kind: 'unavailable' })
})

it('cleans up an opened SQL provider when later fixture initialization fails', async () => {
  const lifecycle = { leases: new Set<object>(), storageClosed: false }
  await expect(openSettingsComposition({ lifecycle, failAfterStorage: true })).rejects.toThrow(
    'injected initialization failure',
  )
  expect(lifecycle.storageClosed).toBe(true)
  expect(lifecycle.leases.size).toBe(0)
})
