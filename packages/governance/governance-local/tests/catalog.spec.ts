import { afterEach, expect, it } from 'vitest'
import { openRegistrarWorld } from './registrar-world.ts'
import { createGovernanceCatalog } from '../src/catalog.ts'
import { catalogPageSchema, type CatalogCurrent } from '../src/catalog-schema.ts'
import { json, definitionKey, digest } from '../src/encoding.ts'
import { selectionDigest } from '../src/adoption-plan.ts'
import type { SqlStorage } from '@omne-harness/sql-contract'
const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function setup() {
  const w = await openRegistrarWorld()
  worlds.push(w)
  const registered = await w.services().registrar.contribute(w.context, w.command('one'))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const declaration = w.command('one').declaration
  function reader(
    change: (current: CatalogCurrent) => CatalogCurrent = current => current,
    storage: SqlStorage = w.activation.storage,
  ) {
    return createGovernanceCatalog({
      domain: w.activation.domain,
      scope: w.scope,
      epoch: 'first',
      projection: w.activation.projection(storage),
      admission: w.services().admission,
      accepting: () => true,
      current: binding => [
        {
          participant: 'fixture.governance-catalog-current',
          facts: {
            evidence: json(
              change({
                binding,
                epoch: 'first',
                transactionDomain: w.activation.domain.transactionDomain,
                targets: [],
                enforcementBindings: declaration.enforcementBindings,
                unavailableOwners: [],
              }),
            ),
          },
        },
      ],
    })
  }
  const request = {
    scope: w.scope,
    mode: 'management' as const,
    targets: [],
    limit: 1,
    cursor: null,
  }
  return { w, registered, declaration, reader, request }
}
it('separates management candidates from runtime adoption through actual SQLite', async () => {
  const { w, registered, declaration, reader, request } = await setup()
  const read = reader()
  expect(await read(w.context, request)).toMatchObject({
    kind: 'page',
    completeness: 'complete',
    items: [{ declaration, availability: 'available' }],
  })
  expect(await read(w.context, { ...request, mode: 'runtime' })).toMatchObject({
    kind: 'page',
    items: [],
  })
  const members = [
    {
      candidate: {
        contribution: registered.contribution,
        declaration,
        definitionKey: definitionKey(declaration.reference),
      },
      targets: [],
    },
  ]
  const registrar = w.services({
    current: input =>
      json({
        binding: input.binding,
        epoch: input.epoch,
        transactionDomain: w.activation.domain.transactionDomain,
        targets: [],
        enforcementBindings: declaration.enforcementBindings,
      }),
  }).registrar
  expect(
    await registrar.adopt(w.context, {
      scope: w.scope,
      operationId: 'adopt',
      expectedAdoptionRevision: 0,
      expectedDeclarationRevision: 1,
      collection: {
        scope: w.scope,
        declarationRevision: 1,
        digest: selectionDigest({ scope: w.scope, expectedDeclarationRevision: 1 }, members),
      },
      complete: [{ contribution: registered.contribution, selectedTargets: [] }],
    }),
  ).toMatchObject({ kind: 'adopted' })
  expect(await read(w.context, { ...request, mode: 'runtime' })).toMatchObject({
    kind: 'page',
    items: [{ declaration }],
  })
  const unavailable = reader(current => ({
    ...current,
    enforcementBindings: [],
    unavailableOwners: [declaration.reference.ownerId],
  }))
  expect(await unavailable(w.context, { ...request, mode: 'runtime' })).toMatchObject({
    kind: 'page',
    completeness: 'partial',
    items: [],
    unavailableOwners: [declaration.reference.ownerId],
  })
})
it('pages without duplicates and rejects stale revision, current witnesses and altered cursor bindings', async () => {
  const { w, reader, request, declaration, registered } = await setup()
  const next = { ...declaration, reference: { ...declaration.reference, definitionId: 'second' } }
  expect(
    await w
      .services({
        source: {
          async resolve() {
            return { kind: 'definition', declaration: next }
          },
        },
      })
      .registrar.contribute(w.context, { ...w.command('two'), declaration: next }),
  ).toMatchObject({ kind: 'registered' })
  const read = reader(),
    first = await read(w.context, request)
  if (first.kind !== 'page' || first.nextCursor === null) throw new Error(JSON.stringify(first))
  const second = await read(w.context, { ...request, cursor: first.nextCursor })
  expect(second).toMatchObject({ kind: 'page', nextCursor: null })
  if (second.kind !== 'page') throw new Error(JSON.stringify(second))
  expect(
    new Set([...first.items, ...second.items].map(item => item.declaration.reference.definitionId))
      .size,
  ).toBe(2)
  expect(await read(w.context, { ...request, mode: 'runtime', cursor: first.nextCursor })).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
  expect(
    await reader(current => ({ ...current, unavailableOwners: [declaration.reference.ownerId] }))(
      w.context,
      { ...request, cursor: first.nextCursor },
    ),
  ).toEqual({ kind: 'conflict', reason: 'basis' })
  await w.services().registrar.withdraw(w.context, {
    operationId: 'withdraw',
    contribution: registered.contribution,
  })
  expect(await read(w.context, { ...request, cursor: first.nextCursor })).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
})
it('rejects misbound current facts, foreign scopes and revoked readers', async () => {
  const { w, reader, request } = await setup()
  expect(
    await reader(current => ({ ...current, transactionDomain: 'foreign' }))(w.context, request),
  ).toEqual({ kind: 'unavailable', owner: 'governance-catalog' })
  expect(
    await reader(current => ({
      ...current,
      binding: { ...current.binding, principalRef: 'foreign' },
    }))(w.context, request),
  ).toEqual({ kind: 'unavailable', owner: 'governance-catalog' })
  expect(
    await reader()(w.context, { ...request, scope: { ...w.scope, deploymentId: 'foreign' } }),
  ).toEqual({ kind: 'denied' })
  await w.remove()
  expect(await reader()(w.context, request)).toEqual({ kind: 'denied' })
})

it('rejects a page whose snapshot belongs to another scope or epoch', async () => {
  const { w, reader, request } = await setup()
  for (const patch of [{ epoch: 'foreign' }, { scope: { ...w.scope, deploymentId: 'foreign' } }]) {
    const storage: SqlStorage = {
      ...w.activation.storage,
      async commit(envelope, options) {
        const result = await w.activation.storage.commit(envelope, options)
        const last = result.kind === 'committed' ? result.responses.at(-1) : undefined
        if (result.kind !== 'committed' || last?.reply.kind !== 'participated') return result
        const page = catalogPageSchema.parse(last.reply.response)
        const response = json({ ...page, snapshot: { ...page.snapshot, ...patch } })
        const responses = [
          ...result.responses.slice(0, -1),
          { ...last, reply: { ...last.reply, response } },
        ] as unknown as typeof result.responses
        return { ...result, responses }
      },
    }
    expect(await reader(current => current, storage)(w.context, request)).toEqual({
      kind: 'unavailable',
      owner: 'governance-catalog',
    })
  }
})

it('shows an unadopted management target and reports its disabled state without making it runnable', async () => {
  const { w, reader, request, declaration } = await setup()
  const definition = declaration.settings[0]
  if (!definition) throw new Error('Expected permission settings')
  const target = { policyId: 'independent', targetRef: 'settings', scopeRef: w.scope.tenantRef }
  const current =
    (enabled: boolean) =>
    (value: CatalogCurrent): CatalogCurrent => ({
      ...value,
      targets: [
        {
          target,
          origin: declaration.origin,
          ownerRevision: 1,
          enabled,
          definition,
          definitionRef: {
            providerId: definition.providerId,
            definitionId: definition.definitionId,
            version: definition.version,
            digest: digest(definition),
          },
        },
      ],
    })
  expect(await reader(current(false))(w.context, { ...request, targets: [target] })).toMatchObject({
    kind: 'page',
    items: [{ declaration, selectedTargets: [], availability: 'unavailable' }],
  })
  expect(await reader(current(true))(w.context, { ...request, targets: [target] })).toMatchObject({
    kind: 'page',
    items: [{ declaration, selectedTargets: [], availability: 'available' }],
  })
  expect(
    await reader(current(true))(w.context, { ...request, mode: 'runtime', targets: [target] }),
  ).toMatchObject({ kind: 'page', items: [] })
})
