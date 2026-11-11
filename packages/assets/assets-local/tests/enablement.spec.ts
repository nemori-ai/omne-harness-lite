import { afterEach, expect, it } from 'vitest'
import { SettingsOwnerProjectionSchema } from '@omne-harness/settings-local'
import { openWorld, target, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

it('keeps the disabled state and management visibility, including after restart', async () => {
  const first = await openWorld()
  worlds.push(first)
  await first.setup()
  const disable = {
    operationId: 'disable',
    holdingRef: target.targetRef,
    scopeRef: target.scopeRef,
    expectedRevision: 1,
    change: { kind: 'setEnabled' as const, enabled: false },
  }
  expect(await first.owner.changeHolding(disable)).toEqual({
    kind: 'committed',
    operationId: 'disable',
    revision: 2,
    changed: true,
  })
  expect(await first.owner.changeHolding(disable)).toMatchObject({ revision: 2, changed: true })
  expect(await first.owner.changeHolding({ ...disable, operationId: 'stale' })).toEqual({
    kind: 'rejected',
    reason: 'revision_conflict',
  })
  expect(
    await first.owner.changeHolding({ ...disable, operationId: 'no-change', expectedRevision: 2 }),
  ).toMatchObject({ kind: 'committed', revision: 2, changed: false })
  await first.close()

  const reopened = await openWorld({ root: first.root })
  worlds.push(reopened)
  expect(
    await reopened.owner.readHolding({ holdingRef: target.targetRef, scopeRef: target.scopeRef }),
  ).toMatchObject({ kind: 'holding', holding: { state: 'held', enabled: false, revision: 2 } })
  const management = await reopened.capture({ targets: [target] })
  expect(management.kind).toBe('committed')
  if (management.kind !== 'committed') throw new Error('management capture failed')
  const disabled = SettingsOwnerProjectionSchema.parse(management.responses[0]?.reply.response)
    .views[0]
  expect(disabled).toMatchObject({ target, enabled: false })
  const runtime = { mode: 'runtime' as const, targets: [target], selectionRef: 'selected' }
  expect((await reopened.capture(runtime)).kind).toBe('rolled_back')
  expect(
    await reopened.owner.changeHolding({
      ...disable,
      operationId: 'enable',
      expectedRevision: 2,
      change: { kind: 'setEnabled', enabled: true },
    }),
  ).toMatchObject({ kind: 'committed', revision: 3, changed: true })
  const enabled = await reopened.capture(runtime)
  expect(enabled.kind).toBe('committed')
  if (enabled.kind !== 'committed') throw new Error('runtime capture failed')
  const view = SettingsOwnerProjectionSchema.parse(enabled.responses[0]?.reply.response).views[0]
  expect(view).toMatchObject({ target, enabled: true })
  expect(view?.ownerRevision).toBeGreaterThan(disabled?.ownerRevision ?? Infinity)
})

it('does not revive a removed holding through setEnabled', async () => {
  const world = await openWorld()
  worlds.push(world)
  await world.setup()
  const identity = { holdingRef: target.targetRef, scopeRef: target.scopeRef }
  expect(
    await world.owner.changeHolding({
      ...identity,
      operationId: 'remove',
      expectedRevision: 1,
      change: { kind: 'remove' },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await world.owner.changeHolding({
      ...identity,
      operationId: 'revive',
      expectedRevision: 2,
      change: { kind: 'setEnabled', enabled: true },
    }),
  ).toEqual({ kind: 'rejected', reason: 'holding_removed' })
})
