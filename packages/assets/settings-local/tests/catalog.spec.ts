import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { openCatalogWorld } from './catalog-world.ts'
import { definition } from './world.ts'
const opened: Awaited<ReturnType<typeof openCatalogWorld>>[] = []
async function open() {
  const w = await openCatalogWorld()
  opened.push(w)
  return w
}
afterEach(async () => {
  for (const w of opened.splice(0)) await w.close()
})
const request = (view: Awaited<ReturnType<typeof openCatalogWorld>>['view']) => ({
  view,
  filter: '',
  locale: 'zh-CN',
  pageSize: 1,
  cursor: null,
})
it('aggregates real target state, retains values across declaration unload and denies retired target receipts', async () => {
  const w = await open()
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.service.queries.readCatalog(w.principal, request(w.view))).toMatchObject({
    kind: 'catalog',
    completeness: 'complete',
    entries: [{ resolution: { value: { kind: 'value', value: true } } }],
  })
  w.registry.releaseContribution(w.registration.registrationId)
  expect(await w.service.queries.readCatalog(w.principal, request(w.view))).toMatchObject({
    kind: 'catalog',
    completeness: 'partial',
    entries: [],
  })
  expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  w.registry.registerContribution(definition)
  expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({
    kind: 'complete',
    entries: [{ resolution: { value: { value: true } } }],
  })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire',
      target: w.change.target,
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.prepared.getOperation(w.principal, {
      target: w.change.target,
      operationId: w.change.operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
})
it('requires validated runtime selection and rechecks real membership before every read', async () => {
  const w = await open()
  const runtime = { ...w.view, mode: 'runtime', targets: [w.change.target] }
  expect(await w.service.queries.evaluate(w.principal, runtime)).toEqual({
    kind: 'rejected',
    reason: 'invalid_input',
  })
  expect(
    await w.service.queries.evaluate(w.principal, { ...runtime, selectionRef: 'forged' }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.service.queries.evaluate(w.principal, { ...runtime, selectionRef: w.selectionRef }),
  ).toMatchObject({ kind: 'complete' })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.service.queries.readCatalog(w.principal, request(w.view))).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})
it('re-adopts an exact new definition explicitly and preserves operation recovery', async () => {
  const w = await open()
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
  const next = { ...definition, version: '2', items: [] }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'next-definition',
      expectedRevision: 1,
      record: { ...w.record, definition: next },
    }),
  ).toMatchObject({ kind: 'committed' })
  w.registry.registerContribution(next)
  const to = {
    ...w.change.definitionRef,
    version: '2',
    digest: createHash('sha256').update(canonicalize(next)!).digest('hex'),
  }
  const command = {
    protocol: 'settings-rebase/1' as const,
    requestId: 'migration',
    operationId: 'migration',
    target: w.change.target,
    from: w.change.definitionRef,
    to,
    expectedRevision: 1,
    assignments: [{ sourceId: 'tenant', itemId: 'enabled', disposition: 'discard' as const }],
  }
  expect(await w.service.queries.evaluate(w.principal, w.view)).toEqual({
    kind: 'rejected',
    reason: 'definition_changed',
  })
  expect(await w.rebase(command)).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.rebase(command)).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await w.prepared.getOperation(w.principal, {
      target: w.change.target,
      operationId: 'migration',
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.service.queries.evaluate(w.principal, w.view)).toMatchObject({
    kind: 'complete',
    entries: [],
  })
  expect(
    await w.prepared.readChanges(w.principal, {
      target: w.change.target,
      afterRevision: 1,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'changes', changes: [{ kind: 'rebase', revision: 2 }] })
})

it('binds pages to the complete captured basis and a finite lifetime', async () => {
  const w = await open()
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'second',
      expectedRevision: null,
      record: { ...w.record, target: { ...w.change.target, targetRef: 'second' } },
    }),
  ).toMatchObject({ kind: 'committed' })
  const first = await w.service.queries.readCatalog(w.principal, request(w.view))
  if (first.kind !== 'catalog' || first.nextCursor === null) throw new Error(JSON.stringify(first))
  const next = { ...request(w.view), cursor: first.nextCursor }
  expect(await w.service.queries.readCatalog(w.principal, next)).toMatchObject({
    kind: 'catalog',
    entries: [{ target: { targetRef: 'second' } }],
  })
  w.setNow(61000)
  expect(await w.service.queries.readCatalog(w.principal, next)).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  w.setNow(1000)
  expect(await w.service.queries.readCatalog(w.principal, next)).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
  expect(await w.service.queries.readCatalog(w.principal, next)).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.service.queries.readCatalog(w.principal, next)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})
it('rejects a capture when its contributor is unloaded while SQL is pending', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await openCatalogWorld({
    wrapCatalog: storage => ({
      ...storage,
      async commit(input) {
        if (input.identity.operation === 'settings.capture') {
          reached.resolve()
          await release.promise
        }
        return storage.commit(input)
      },
    }),
  })
  opened.push(w)
  const pending = w.service.queries.readCatalog(w.principal, request(w.view))
  await reached.promise
  w.registry.releaseContribution(w.registration.registrationId)
  release.resolve()
  expect(await pending).toEqual({ kind: 'rejected', reason: 'basis_changed' })
})

it('does not revive an expired explicit selection when the wall clock moves backwards', async () => {
  const w = await open()
  const runtime = {
    ...w.view,
    mode: 'runtime',
    targets: [w.change.target],
    selectionRef: w.selectionRef,
  }
  w.setNow(62000)
  expect(await w.service.queries.evaluate(w.principal, runtime)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  w.setNow(1000)
  expect(await w.service.queries.evaluate(w.principal, runtime)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})
it('counts only active requested standalone targets, not retired history', async () => {
  const w = await open()
  for (let i = 0; i < 128; i++) {
    const target = { ...w.change.target, targetRef: `retired-${i}` }
    expect(
      await w.owner.mutate({
        kind: 'provision',
        operationId: `add-${i}`,
        expectedRevision: null,
        record: { ...w.record, target },
      }),
    ).toMatchObject({ kind: 'committed' })
    expect(
      await w.owner.mutate({
        kind: 'retire',
        operationId: `retire-${i}`,
        expectedRevision: 1,
        target,
      }),
    ).toMatchObject({ kind: 'committed' })
  }
  expect(
    await w.service.queries.evaluate(w.principal, { ...w.view, targets: [w.change.target] }),
  ).toMatchObject({ kind: 'complete' })
  expect(await w.service.queries.readCatalog(w.principal, request(w.view))).toMatchObject({
    kind: 'catalog',
    entries: [{ target: w.change.target }],
  })
  expect(await w.write(w.principal, w.change)).toMatchObject({
    kind: 'committed',
  })
}, 30000)
it('recovers the original standalone owner operation and rejects reads after close', async () => {
  const w = await open()
  const command = {
    kind: 'retire' as const,
    operationId: 'owner-retire',
    target: w.change.target,
    expectedRevision: 1,
  }
  const result = await w.owner.mutate(command)
  expect(result).toMatchObject({ kind: 'committed', operationId: command.operationId })
  expect(await w.owner.getOperation(command.operationId)).toEqual(result)
  expect(await w.owner.getOperation('missing-operation')).toEqual({ kind: 'not_found' })
  expect(await w.owner.getOperation('')).toEqual({ kind: 'rejected', reason: 'invalid_input' })
  await w.owner.close()
  expect(await w.owner.getOperation(command.operationId)).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
})

it.each(['before', 'after'] as const)(
  'settles catalog capture when membership is revoked %s its SQL commit',
  async order => {
    const reached = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    const w = await openCatalogWorld({
      wrapCatalog: storage => ({
        ...storage,
        async commit(input) {
          if (input.identity.operation !== 'settings.capture') return storage.commit(input)
          if (order === 'before') {
            reached.resolve()
            await release.promise
            return storage.commit(input)
          }
          const result = await storage.commit(input)
          reached.resolve()
          await release.promise
          return result
        },
      }),
    })
    opened.push(w)
    const pending = w.catalog.read(w.principal, w.view)
    try {
      await reached.promise
      expect(await w.remove()).toEqual({ kind: 'succeeded' })
    } finally {
      release.resolve()
    }
    expect(await pending).toMatchObject(
      order === 'before'
        ? { kind: 'rejected', reason: 'basis_changed' }
        : { completeness: 'complete' },
    )
    expect(await w.catalog.read(w.principal, w.view)).toEqual({
      kind: 'rejected',
      reason: 'forbidden',
    })
  },
)
