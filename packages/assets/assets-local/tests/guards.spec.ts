import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { assetsSettingsGuards } from '../src/index.ts'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { openWorld, command, definitionRef, grants, pinned, target, type World } from './world.ts'
const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  await world.setup()
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
const remove = {
  operationId: 'remove',
  holdingRef: target.targetRef,
  scopeRef: target.scopeRef,
  expectedRevision: 1,
  change: { kind: 'remove' as const },
}
function pauseCommit() {
  let release = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let entered = () => {}
  const waiting = new Promise<void>(resolve => {
    entered = resolve
  })
  return {
    release,
    waiting,
    wrap(storage: SqlStorage): SqlStorage {
      return {
        ...storage,
        async commit(input) {
          entered()
          await gate
          return storage.commit(input)
        },
      }
    },
  }
}
it('rejects a setting write when removal wins after the setting call starts', async () => {
  const pause = pauseCommit()
  const world = await open({ wrap: pause.wrap })
  const pending = world.backend.commit(null, command())
  await pause.waiting
  expect(await world.owner.changeHolding(remove)).toMatchObject({ kind: 'committed' })
  pause.release()
  expect(await pending).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await world.backend.readState(null, target)).toEqual({ kind: 'absent' })
})
it('keeps the committed value when setting wins and prevents a fresh holding from inheriting it', async () => {
  const world = await open()
  expect(await world.backend.commit(null, command())).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await world.owner.changeHolding(remove)).toMatchObject({ kind: 'committed' })
  expect(await world.backend.readState(null, target)).toMatchObject({
    kind: 'state',
    state: { revision: 1 },
  })
  expect(await world.backend.commit(null, command({ expectedRevision: 1 }))).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(
    await world.owner.hold({
      operationId: 'new',
      holdingRef: 'holding-b',
      scopeRef: 'tenant-a',
      assetRef: 'asset-a',
      selection: { kind: 'follow' },
      sourceIds: ['tenant'],
      grants,
    }),
  ).toMatchObject({ kind: 'committed' })
  const fresh = { ...target, targetRef: 'holding-b' }
  expect(await world.backend.readState(null, fresh)).toEqual({ kind: 'absent' })
  expect(await world.backend.commit(null, command({ target: fresh }))).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
})
it('rejects the old declaration after follow selects a new published version', async () => {
  const pause = pauseCommit()
  const world = await open({ wrap: pause.wrap })
  const pending = world.backend.commit(null, command())
  await pause.waiting
  expect(
    await world.owner.publish({
      operationId: 'publish-2',
      assetRef: 'asset-a',
      pinned: pinned('2', true),
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  pause.release()
  expect(await pending).toEqual({ kind: 'rejected', reason: 'definition_changed' })
  expect(
    await world.backend.commit(null, command({ definitionRef: definitionRef('2', true) })),
  ).toMatchObject({ kind: 'committed' })
})
it('rejects source replacement and grant revocation at the actual commit boundary', async () => {
  const world = await open()
  expect(await world.backend.commit(null, command())).toMatchObject({ kind: 'committed' })
  await world.owner.changeHolding({
    operationId: 'sources',
    holdingRef: 'holding-a',
    scopeRef: 'tenant-a',
    expectedRevision: 1,
    change: { kind: 'updateSources', sourceIds: ['organization', 'tenant'], grants },
  })
  expect(await world.backend.commit(null, command({ expectedRevision: 1 }))).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  await world.owner.changeHolding({
    operationId: 'grants',
    holdingRef: 'holding-a',
    scopeRef: 'tenant-a',
    expectedRevision: 2,
    change: { kind: 'updateSources', sourceIds: ['tenant'], grants: [] },
  })
  expect(await world.backend.commit(null, command({ expectedRevision: 1 }))).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})
it('rejects targets from another scope, another policy or a nonexistent holding', async () => {
  const world = await open()
  for (const wrong of [
    { ...target, scopeRef: 'tenant-b' },
    { ...target, policyId: 'independent' },
    { ...target, targetRef: 'missing' },
  ])
    expect(await world.backend.commit(null, command({ target: wrong }))).toEqual({
      kind: 'rejected',
      reason: 'forbidden',
    })
  expect(
    await world.owner.hold({
      operationId: 'foreign',
      holdingRef: 'foreign',
      scopeRef: 'tenant-b',
      assetRef: 'asset-a',
      selection: { kind: 'follow' },
      sourceIds: ['tenant'],
      grants,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await world.owner.readHolding({ holdingRef: 'holding-a', scopeRef: 'tenant-b' })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})

it('refuses the old write binding at the owner guard boundary after a new version is selected', async () => {
  const world = await open()
  await world.owner.publish({
    operationId: 'publish-2',
    assetRef: 'asset-a',
    pinned: pinned('2', true),
    expectedRevision: 1,
  })
  const change = command()
  const { requestId: _requestId, ...semantic } = change
  const result = await world.storage.commit({
    identity: {
      ...world.domain,
      operation: 'guard.old-write',
      protocolVersion: '2',
      operationKey: 'old-write',
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands: [
      assetsSettingsGuards.command({
        domain: world.domain,
        principalRef: 'alice',
        command: change,
        commandDigest: createHash('sha256')
          .update(canonicalize(semantic) ?? '')
          .digest('hex'),
      }),
    ],
  })
  expect(result.kind).toBe('rolled_back')
  if (result.kind === 'rolled_back')
    expect(result.responses.at(-1)?.reply).toMatchObject({
      kind: 'conflict',
      basis: { failure: { kind: 'rejected', reason: 'definition_changed' } },
    })
})
