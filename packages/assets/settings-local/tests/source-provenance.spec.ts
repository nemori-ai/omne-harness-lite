import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { SettingsSourceIdentity, SettingsRebase } from '@omne-harness/settings'
import { openCatalogWorld } from './catalog-world.ts'
import { ownerSources } from './sources.ts'

const worlds: Awaited<ReturnType<typeof openCatalogWorld>>[] = []
async function open() {
  const world = await openCatalogWorld()
  worlds.push(world)
  return world
}
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
type World = Awaited<ReturnType<typeof open>>
function rebase(
  world: World,
  assignments: SettingsRebase['assignments'],
  expectedRevision = 1,
): SettingsRebase {
  return {
    protocol: 'settings-rebase/1',
    requestId: 'rebase',
    operationId: 'rebase',
    target: world.change.target,
    from: world.change.definitionRef,
    to: world.change.definitionRef,
    expectedRevision,
    assignments,
  }
}
async function update(world: World, sources: SettingsSourceIdentity[]) {
  expect(
    await world.owner.mutate({
      kind: 'provision',
      operationId: 'replace-sources',
      expectedRevision: 1,
      record: { ...world.record, sources },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
}
function alterStored(
  world: World,
  alter: (record: Record<string, unknown>) => void,
  table: 'st_states' | 'st_targets' = 'st_states',
) {
  const db = new DatabaseSync(
    join(
      world.world.root,
      'domains',
      `${Buffer.from(world.world.domain.transactionDomain).toString('hex')}.sqlite`,
    ),
  )
  try {
    const row = db.prepare(`SELECT target_key, record FROM ${table}`).get()
    if (typeof row?.record !== 'string' || typeof row.target_key !== 'string')
      throw new Error('missing fixture state')
    const record: Record<string, unknown> = JSON.parse(row.record)
    alter(record)
    db.prepare(`UPDATE ${table} SET record = ? WHERE target_key = ?`).run(
      JSON.stringify(record),
      row.target_key,
    )
  } finally {
    db.close()
  }
}

it.each(['owner', 'subject', 'scope'] as const)(
  'refuses inherited values and retain after same sourceId changes %s',
  async axis => {
    const w = await open()
    expect(await w.write(w.principal, w.change)).toMatchObject({
      kind: 'committed',
      revision: 1,
    })
    const sources = w.record.sources.map(source => ({
      ...source,
      ownerRef: axis === 'owner' ? 'another-owner' : source.ownerRef,
      scope: {
        kind: axis === 'scope' ? ('session' as const) : source.scope.kind,
        subjectRef: axis === 'subject' ? 'another-subject' : source.scope.subjectRef,
      },
    }))
    await update(w, sources)
    expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
      kind: 'rejected',
      reason: 'basis_changed',
    })
    expect(
      await w.write(w.principal, {
        ...w.change,
        operationId: 'stale-source',
        expectedRevision: 1,
        action: { kind: 'clear' },
      }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
    expect(
      await w.rebase(rebase(w, [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }])),
    ).toMatchObject({ kind: 'aborted', reason: 'incompatible' })
    const discard = {
      ...rebase(w, [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'discard' }]),
      operationId: 'discard',
    }
    expect(await w.rebase(discard)).toMatchObject({
      kind: 'committed',
      revision: 2,
      changed: true,
    })
    expect(await w.rebase(discard)).toMatchObject({ kind: 'committed', revision: 2 })
    expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({
      kind: 'complete',
      entries: [{ sources, resolution: { value: { value: false } } }],
    })
    expect(
      await w.prepared.getOperation(w.principal, {
        target: w.change.target,
        operationId: w.change.operationId,
      }),
    ).toMatchObject({ kind: 'committed', revision: 1 })
  },
)

it('keeps values for a stable identity across owner revision changes and projects the new authority', async () => {
  const w = await open()
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
  await update(w, w.record.sources)
  expect(
    await w.service.queries.readCatalog(w.principal, {
      view: w.view,
      filter: '',
      locale: 'en',
      pageSize: 10,
      cursor: null,
    }),
  ).toMatchObject({
    kind: 'catalog',
    entries: [
      {
        sources: [{ ...w.record.sources[0], authorityRevision: '2' }],
        resolution: { value: { value: true } },
      },
    ],
  })
})

it('advances the value revision when an empty state adopts a new source identity', async () => {
  const w = await open()
  expect(await w.write(w.principal, { ...w.change, action: { kind: 'clear' } })).toMatchObject({
    kind: 'committed',
    revision: 0,
    changed: false,
  })
  await update(
    w,
    ownerSources('tenant').map(source => ({ ...source, ownerRef: 'replacement' })),
  )
  expect(await w.rebase(rebase(w, [], 0))).toMatchObject({
    kind: 'committed',
    revision: 1,
    changed: true,
  })
  expect(
    await w.prepared.readChanges(w.principal, {
      target: w.change.target,
      afterRevision: 0,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'changes', changes: [{ kind: 'rebase', revision: 1 }] })
})

it('requires explicit rebase after reordering identities and retains only explicitly selected assignments', async () => {
  const w = await open()
  await update(w, ownerSources('organization', 'tenant'))
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'reorder',
      expectedRevision: 2,
      record: { ...w.record, sources: ownerSources('tenant', 'organization') },
    }),
  ).toMatchObject({ kind: 'committed', revision: 3 })
  expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(
    await w.rebase(rebase(w, [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }])),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  const result = await w.service.queries.evaluate(w.principal, w.view)
  expect(result).toMatchObject({
    kind: 'complete',
    entries: [
      { sources: ownerSources('tenant', 'organization'), resolution: { value: { value: true } } },
    ],
  })
})

it.each([false, true])(
  'requires explicit adoption for an unmapped historical state, populated=%s',
  async populated => {
    const w = await open()
    expect(
      await w.write(w.principal, {
        ...w.change,
        action: populated ? { kind: 'set', value: true } : { kind: 'clear' },
      }),
    ).toMatchObject({ kind: 'committed' })
    alterStored(w, record => {
      record.sourceLayout = { kind: 'unmapped', sourceIds: ['tenant'] }
    })
    expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
      kind: 'rejected',
      reason: 'basis_changed',
    })
    const revision = populated ? 1 : 0
    if (populated)
      expect(
        await w.rebase(
          rebase(w, [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'retain' }], revision),
        ),
      ).toMatchObject({ kind: 'aborted', reason: 'incompatible' })
    expect(
      await w.rebase({
        ...rebase(
          w,
          populated ? [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'discard' }] : [],
          revision,
        ),
        operationId: 'adopt',
      }),
    ).toMatchObject({ kind: 'committed', revision: revision + 1, changed: true })
    expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({
      kind: 'complete',
      entries: [{ resolution: { value: { value: false } } }],
    })
  },
)

it('rejects a provenance-only rebase at revision exhaustion without creating a receipt', async () => {
  const w = await open()
  expect(await w.write(w.principal, { ...w.change, action: { kind: 'clear' } })).toMatchObject({
    kind: 'committed',
  })
  alterStored(w, record => {
    record.state = {
      revision: Number.MAX_SAFE_INTEGER - 1,
      sources: [{ id: 'tenant', values: [] }],
    }
  })
  // The owner replaces the source identity: the rebase changes provenance only.
  await update(
    w,
    ownerSources('tenant').map(source => ({ ...source, ownerRef: 'replacement' })),
  )
  // The change is refused and nothing of it is stored. The preparation path has no abort reason
  // for the exhausted revision, so the reason it gives is not pinned here.
  expect(await w.rebase(rebase(w, [], Number.MAX_SAFE_INTEGER - 1))).toMatchObject({
    kind: 'rejected',
  })
  expect(w.world.counts()).toEqual([1, 1, 0])
})

it('requires both owner mapping and value rebase before unmapped historical targets become readable', async () => {
  const w = await open()
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
  alterStored(w, record => {
    record.sourceLayout = { kind: 'unmapped', sourceIds: ['tenant'] }
  })
  alterStored(
    w,
    record => {
      const projection = record.projection
      if (typeof projection !== 'object' || projection === null)
        throw new Error('missing fixture projection')
      record.projection = {
        ...projection,
        sourceLayout: { kind: 'unmapped', sourceIds: ['tenant'] },
      }
    },
    'st_targets',
  )
  expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({ kind: 'rejected' })
  await update(w, w.record.sources)
  expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(
    await w.rebase(rebase(w, [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'discard' }])),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({
    kind: 'complete',
    entries: [{ resolution: { value: { value: false } } }],
  })
})
