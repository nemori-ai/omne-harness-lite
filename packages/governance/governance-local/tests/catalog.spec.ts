import { GovernanceScopeLifecycle } from '../src/scope-lifecycle.ts'
import { bindingSchema, type OperationBinding } from '../src/operation-schema.ts'
import { observationSchema } from '../src/operation-read.ts'
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
    const { combinationVersion, manifestDigest } = w.activation.combination('catalog')
    return createGovernanceCatalog({
      ...w.services({ storage }),
      destination: w.destination,
      domain: w.activation.domain,
      scope: w.scope,
      epoch: 'first',
      combination: { combinationVersion, manifestDigest },
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

it('rejects a stored result whose snapshot belongs to another scope or epoch', async () => {
  const { w, reader, request } = await setup()
  for (const patch of [{ epoch: 'foreign' }, { scope: { ...w.scope, deploymentId: 'foreign' } }]) {
    const storage: SqlStorage = {
      ...w.activation.storage,
      async read(input, options) {
        const reply = await w.activation.storage.read(input, options)
        if (reply.kind !== 'read' || input.handler !== 'governance.operation') return reply
        const observation = observationSchema.parse(reply.output)
        if (
          observation.kind !== 'found' ||
          observation.record.request.owner !== 'internal.capture' ||
          observation.record.state !== 'committed'
        )
          return reply
        const page = catalogPageSchema.parse(observation.record.result)
        return {
          ...reply,
          output: json({
            ...observation,
            record: {
              ...observation.record,
              result: { ...page, snapshot: { ...page.snapshot, ...patch } },
            },
          }),
        }
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

it('returns no page before qualification settlement and recovers the original capture after reopening', async () => {
  const { w, reader, request } = await setup()
  let binding: OperationBinding | undefined
  const storage: SqlStorage = {
    ...w.activation.storage,
    async read(input, options) {
      if (input.handler === 'governance.operation') {
        const parsed = bindingSchema.parse(input.input)
        if (parsed.ref.owner === 'internal.capture') binding = parsed
      }
      return w.activation.storage.read(input, options)
    },
    async commit(envelope, options) {
      if (envelope.identity.operation === 'governance.meta.standing-settled')
        return {
          kind: 'unknown',
          identity: envelope.identity,
          diagnostic: 'settlement unavailable',
        }
      return w.activation.storage.commit(envelope, options)
    },
    async query(identity) {
      return identity.operation === 'governance.meta.standing-settled'
        ? { kind: 'unknown', identity, diagnostic: 'settlement unavailable' }
        : w.activation.storage.query(identity)
    },
  }
  expect(await reader(value => value, storage)(w.context, request)).toEqual({
    kind: 'unavailable',
    owner: 'governance-catalog',
  })
  if (!binding) throw new Error('Expected durable capture')
  expect(await w.services().sql.observe(binding)).toMatchObject({
    record: { state: 'committed', result: { kind: 'page' } },
    standing: { kind: 'held' },
  })
  await w.reopen()
  const services = w.services()
  const { combinationVersion, manifestDigest } = w.activation.combination('metadata')
  const lifecycle = new GovernanceScopeLifecycle({
    ...services,
    storage: w.activation.storage,
    domain: w.activation.domain,
    scope: w.scope,
    epoch: 'first',
    metadata: { combinationVersion, manifestDigest },
  })
  expect(await lifecycle.recoverPage()).toEqual({ kind: 'page', next: null, unsettled: 0 })
  expect(await services.sql.observe(binding)).toMatchObject({
    record: { state: 'committed', result: { kind: 'page' } },
    standing: { kind: 'settled', outcome: 'committed' },
  })
})

it('rejects a delayed capture after its retained qualification has been sealed', async () => {
  const { w, reader, request } = await setup()
  const started = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let binding: OperationBinding | undefined
  const storage: SqlStorage = {
    ...w.activation.storage,
    async read(input, options) {
      if (input.handler === 'governance.operation') {
        const parsed = bindingSchema.parse(input.input)
        if (parsed.ref.owner === 'internal.capture') binding = parsed
      }
      return w.activation.storage.read(input, options)
    },
    async commit(envelope, options) {
      if (envelope.identity.operation === 'governance.apply.internal.capture') {
        started.resolve()
        await proceed.promise
      }
      return w.activation.storage.commit(envelope, options)
    },
  }
  const pending = reader(value => value, storage)(w.context, request)
  await started.promise
  try {
    if (!binding) throw new Error('Expected held capture')
    const { sql, standing } = w.services()
    expect(await sql.observe(binding)).toMatchObject({
      record: { state: 'submitted' },
      standing: { kind: 'held' },
    })
    await sql.executeControl(binding, { kind: 'seal', binding })
    expect(await standing.settle(binding)).toMatchObject({ kind: 'settled', outcome: 'aborted' })
  } finally {
    proceed.resolve()
  }
  expect(await pending).toEqual({ kind: 'unavailable', owner: 'governance-catalog' })
  if (!binding) throw new Error('Expected capture binding')
  expect(await w.services().sql.observe(binding)).toMatchObject({
    record: { state: 'aborted', result: { kind: 'sealed' } },
  })
})
