import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import type { SettingsChange, SettingsRebase } from '@omne-harness/settings'
import { json } from '../src/encoding.ts'
import { sourceWriteCommands, sourceTargetWriteBinding } from '../src/source-write.ts'
import {
  SOURCE_RETENTION_OWNER,
  SOURCE_SNAPSHOT_PARTICIPANT,
} from '../src/source-retention-schema.ts'
import { STANDALONE_PARTICIPANT } from '../src/standalone-schema.ts'
import { openCatalogWorld } from './catalog-world.ts'
import { sourceRequest } from './source-retention-world.ts'
import { ownerSources } from './sources.ts'

const worlds: Awaited<ReturnType<typeof openCatalogWorld>>[] = []
type World = (typeof worlds)[number]
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function open() {
  const w = await openCatalogWorld({ sourceCapture: true })
  worlds.push(w)
  return w
}
function transaction(w: World, commands: FactCommandV2[]) {
  return w.world.storage.commit({
    identity: {
      ...w.world.domain,
      operation: 'fixture.source-invalidation',
      protocolVersion: '2',
      operationKey: randomUUID(),
    },
    combinationVersion: w.world.combination.combinationVersion,
    manifestDigest: w.world.combination.manifestDigest,
    commands,
  })
}
async function hold(w: World) {
  const request = sourceRequest()
  request.source = { domain: w.world.domain, target: w.change.target }
  const result = await transaction(w, [
    { participant: SOURCE_RETENTION_OWNER, facts: { kind: 'reserve', request: json(request) } },
    { participant: SOURCE_SNAPSHOT_PARTICIPANT, facts: { request: json(request) } },
  ])
  expect(result.kind).toBe('committed')
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  const held = result.responses.find(r => r.participant === SOURCE_RETENTION_OWNER)?.reply.response
  expect(held).toMatchObject({ kind: 'held', request })
  return held
}
it('protects values and locks while reads and original receipts remain usable', async () => {
  const w = await open()
  const original = await w.service.commands.change(w.principal, w.change)
  expect(original).toMatchObject({ kind: 'committed', revision: 1 })
  const view = await w.service.queries.evaluate(w.principal, w.view)
  const held = await hold(w)
  const actions: SettingsChange['action'][] = [
    { kind: 'set', value: false },
    { kind: 'clear' },
    { kind: 'lock' },
    { kind: 'unlock' },
  ]
  for (const action of actions) {
    expect(
      await w.service.commands.change(w.principal, {
        ...w.change,
        operationId: `blocked-${action.kind}`,
        expectedRevision: 1,
        action,
      }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  }
  expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual(view)
  expect(await w.service.commands.change(w.principal, w.change)).toEqual(original)
  expect(await hold(w)).toEqual(held)
  expect(w.world.counts()).toEqual([1, 1, 1])
})
it('protects target definition, layout, grants and retirement without blocking an unrelated target', async () => {
  const w = await open()
  const held = await hold(w)
  const records = [
    { ...w.record, definition: { ...w.record.definition, version: '2' } },
    { ...w.record, sources: ownerSources('organization', 'tenant') },
    { ...w.record, grants: [] },
  ]
  for (const [i, record] of records.entries()) {
    expect(
      await w.owner.mutate({
        kind: 'provision',
        operationId: `replace-${i}`,
        expectedRevision: 1,
        record,
      }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  }
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire-held',
      expectedRevision: 1,
      target: w.change.target,
    }),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  const target = { ...w.change.target, targetRef: 'unrelated' }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'unrelated',
      expectedRevision: null,
      record: { ...w.record, target },
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(
    await w.world.backend.commit(
      { principalRef: 'alice', allowed: true },
      { ...w.change, target, operationId: 'unrelated-write' },
    ),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await hold(w)).toEqual(held)
})
it('blocks maintenance rebase while preserving an already committed rebase receipt', async () => {
  const w = await open()
  expect(await w.service.commands.change(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
  const rebase: SettingsRebase = {
    protocol: 'settings-rebase/1',
    requestId: 'rebase',
    operationId: 'rebase',
    target: w.change.target,
    from: w.change.definitionRef,
    to: w.change.definitionRef,
    expectedRevision: 1,
    assignments: [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }],
  }
  const original = await w.maintenance.rebase(rebase)
  expect(original).toMatchObject({ kind: 'committed' })
  const held = await hold(w)
  expect(await w.maintenance.rebase({ ...rebase, operationId: 'blocked-rebase' })).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(await w.maintenance.rebase(rebase)).toEqual(original)
  expect(await hold(w)).toEqual(held)
})
it('rejects a writer with missing source facts or an open fact for a different target', async () => {
  const w = await open()
  const command = {
    kind: 'retire' as const,
    operationId: 'bypass',
    target: w.change.target,
    expectedRevision: 1,
  }
  const mutation = {
    participant: STANDALONE_PARTICIPANT,
    facts: { kind: 'mutate', domain: json(w.world.domain), command: json(command) },
  }
  expect(await transaction(w, [mutation])).toMatchObject({
    kind: 'rejected_before_accept',
    reason: 'participant_dependency_missing',
  })
  const other = { ...command, target: { ...command.target, targetRef: 'other' } }
  const result = await transaction(w, [
    ...sourceWriteCommands(sourceTargetWriteBinding(w.world.domain, other)),
    mutation,
  ])
  expect(result.kind).toBe('rolled_back')
  if (result.kind !== 'rolled_back') throw new Error(JSON.stringify(result))
  expect(result.responses.at(-1)?.reply).toMatchObject({
    kind: 'conflict',
    basis: { reason: 'forbidden' },
  })
  expect(await w.owner.mutate({ ...command, operationId: 'valid-retire' })).toMatchObject({
    kind: 'committed',
    revision: 2,
  })
})
it('serializes a competing source hold and value change without retaining a stale snapshot', async () => {
  const w = await open()
  expect(await w.service.commands.change(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  const [held, changed] = await Promise.all([
    hold(w),
    w.service.commands.change(w.principal, {
      ...w.change,
      operationId: 'competing-write',
      expectedRevision: 1,
      action: { kind: 'set', value: false },
    }),
  ])
  if (changed.kind === 'committed') {
    expect(changed.revision).toBe(2)
    expect(held).toMatchObject({
      snapshot: {
        state: {
          revision: 2,
          sources: [
            {
              id: 'tenant',
              values: [
                { itemId: 'enabled', value: { kind: 'value', value: false }, locked: false },
              ],
            },
          ],
        },
      },
    })
  } else {
    expect(changed).toEqual({ kind: 'rejected', reason: 'basis_changed' })
    expect(held).toMatchObject({
      snapshot: {
        state: {
          revision: 1,
          sources: [
            {
              id: 'tenant',
              values: [{ itemId: 'enabled', value: { kind: 'value', value: true }, locked: false }],
            },
          ],
        },
      },
    })
  }
  expect(await hold(w)).toEqual(held)
})
