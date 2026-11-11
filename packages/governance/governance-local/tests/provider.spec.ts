import { openProviderWorld } from './provider-world.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { createGovernanceRuntime } from '../src/provider.ts'
import {
  createGovernanceLocal,
  createGovernanceLocalDestination,
} from '@omne-harness/governance-local'
import { openRegistrarWorld } from './registrar-world.ts'
import { definitionKey } from '../src/encoding.ts'
import { selectionDigest } from '../src/adoption-plan.ts'
import type { SqlStorage } from '@omne-harness/sql-contract'

const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function setup() {
  const world = await openProviderWorld()
  worlds.push(world.w)
  return world
}

it('assembles all commands and queries through the public factory and closes borrowed dependencies safely', async () => {
  const { w, options, definition } = await setup()
  const made = await createGovernanceLocal(options)
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  expect(made.epoch).not.toBe('first')
  const registered = await made.service.contribute(w.context, w.command('one'))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const members = [
    {
      candidate: {
        contribution: registered.contribution,
        declaration: definition,
        definitionKey: definitionKey(definition.reference),
      },
      targets: [],
    },
  ]
  expect(
    await made.service.adopt(w.context, {
      scope: w.scope,
      operationId: 'adopt',
      expectedAdoptionRevision: 1,
      expectedDeclarationRevision: registered.declarationRevision,
      collection: {
        scope: w.scope,
        declarationRevision: registered.declarationRevision,
        digest: selectionDigest(
          { scope: w.scope, expectedDeclarationRevision: registered.declarationRevision },
          members,
        ),
      },
      complete: [{ contribution: registered.contribution, selectedTargets: [] }],
    }),
  ).toMatchObject({ kind: 'adopted' })
  expect(
    await made.service.readCatalog(w.context, {
      scope: w.scope,
      mode: 'runtime',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'page', items: [{ declaration: definition }] })
  expect(
    await made.service.withdraw(w.context, {
      operationId: 'withdraw',
      contribution: registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  expect(
    await made.service.queryOperation(w.context, {
      scope: w.scope,
      owner: 'contribute',
      operationId: 'one',
    }),
  ).toMatchObject({ kind: 'committed', original: { result: registered } })
  expect(await made.close()).toEqual({ kind: 'closed' })
  expect(await made.service.contribute(w.context, w.command('late'))).toEqual({
    kind: 'unavailable',
    owner: 'governance-provider',
  })
  expect(
    await made.service.readCatalog(w.context, {
      scope: w.scope,
      mode: 'management',
      targets: [],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(await w.services().sql.lookup(w.binding('one').ref)).toMatchObject({
    kind: 'found',
    record: { state: 'committed' },
  })
  expect(await w.identity.standing.read({ tenant: w.principal.tenant })).toMatchObject({
    kind: 'member',
  })
})

it('recovers an earlier epoch before publishing services, and an old close cannot close its successor', async () => {
  const { w, options } = await setup()
  const { sql, standing } = w.services()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('pending') },
  })
  await standing.reserve(
    { operation: w.binding('pending'), destination: w.destination, required: [] },
    w.principal,
  )
  const first = await createGovernanceLocal(options)
  if (first.kind !== 'created') throw new Error(JSON.stringify(first))
  expect(await sql.observe(w.binding('pending'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'settled' },
  })
  const second = await createGovernanceLocal(options)
  if (second.kind !== 'created') throw new Error(JSON.stringify(second))
  expect(second.epoch).not.toBe(first.epoch)
  expect(await first.close()).toEqual({ kind: 'closed' })
  expect(await second.service.contribute(w.context, w.command('successor'))).toMatchObject({
    kind: 'registered',
    state: 'active',
  })
  expect(await second.close()).toEqual({ kind: 'closed' })
})

it('supplies a destination resolver before Identity assembly and refuses a foreign tenant binding', async () => {
  const { w, options } = await setup()
  const resolver = createGovernanceLocalDestination(options)
  const { sql, standing } = w.services()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('reserved') },
  })
  const held = await standing.reserve(
    { operation: w.binding('reserved'), destination: w.destination, required: [] },
    w.principal,
  )
  if (held.kind !== 'held') throw new Error(JSON.stringify(held))
  expect(
    await resolver.seal({
      ...held.reservation,
      binding: { ...held.reservation.binding, scopeRef: 'foreign' },
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(await resolver.seal(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(await standing.settle(w.binding('reserved'))).toMatchObject({ kind: 'settled' })
})

it('fixes the caller command before yielding through the public lifetime', async () => {
  const { w, options } = await setup()
  const made = await createGovernanceLocal(options)
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const command = w.command('original')
  const pending = made.service.contribute(w.context, command)
  command.operationId = 'changed-after-call'
  expect(await pending).toMatchObject({ kind: 'registered' })
  expect(
    await made.service.queryOperation(w.context, {
      scope: w.scope,
      owner: 'contribute',
      operationId: 'original',
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.services().sql.lookup(w.binding('changed-after-call').ref)).toEqual({
    kind: 'absent',
  })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('does not expose a service while historical custody is unresolved, and a later startup recovers it', async () => {
  const { w, options } = await setup()
  const { sql, standing } = w.services()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('unsettled') },
  })
  await standing.reserve(
    { operation: w.binding('unsettled'), destination: w.destination, required: [] },
    w.principal,
  )
  const unavailable = {
    ...options.identity.reservations,
    async settle() {
      return { kind: 'unavailable' as const, diagnostic: 'Identity settlement offline' }
    },
  }
  expect(
    await createGovernanceLocal({
      ...options,
      identity: { ...options.identity, reservations: unavailable },
    }),
  ).toEqual({ kind: 'unavailable', owner: 'governance-startup' })
  expect(await sql.observe(w.binding('unsettled'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'held' },
  })
  const made = await createGovernanceLocal(options)
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  expect(await sql.observe(w.binding('unsettled'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'settled' },
  })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('requires a confirmed original terminal even when an old operation has no Standing request', async () => {
  const { w, options } = await setup()
  const { sql } = w.services()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('unsealed') },
  })
  const storage: SqlStorage = {
    ...options.storage,
    async commit(request, control) {
      return request.identity.operation === 'governance.meta.seal'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'seal transport unavailable' }
        : options.storage.commit(request, control)
    },
    async query(identity) {
      return identity.operation === 'governance.meta.seal'
        ? { kind: 'unknown', identity, diagnostic: 'seal transport unavailable' }
        : options.storage.query(identity)
    },
  }
  expect(await createGovernanceLocal({ ...options, storage })).toEqual({
    kind: 'unavailable',
    owner: 'governance-startup',
  })
  expect(await sql.observe(w.binding('unsealed'))).toMatchObject({
    record: { state: 'accepted' },
    standing: null,
  })
  const made = await createGovernanceLocal(options)
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  expect(await sql.observe(w.binding('unsealed'))).toMatchObject({
    record: { state: 'aborted' },
    standing: null,
  })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('closes managed caller ingress and retains pending runtime shutdown until suspended calls settle', async () => {
  const { w, options, definition } = await setup()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const runtime = await createGovernanceRuntime({
    ...options,
    closeTimeoutMs: 0,
    definitions: {
      async resolve() {
        entered.resolve()
        await proceed.promise
        return { kind: 'definition', declaration: definition }
      },
    },
  })
  if (runtime.kind !== 'created') throw new Error('Expected created runtime')
  const pending = runtime.contributions.contribute(() => {}, w.context, w.command('suspended'))
  try {
    await entered.promise
    const close = runtime.close()
    expect(await runtime.service.contribute(w.context, w.command('late'))).toMatchObject({
      kind: 'unavailable',
    })
    expect(
      await runtime.contributions.contribute(() => {}, w.context, w.command('late-managed')),
    ).toMatchObject({ kind: 'unavailable' })
    expect(await close).toMatchObject({ kind: 'pending' })
  } finally {
    proceed.resolve()
  }
  expect(await pending).toMatchObject({ kind: 'unavailable' })
  await vi.waitFor(async () => expect(await runtime.close()).toEqual({ kind: 'closed' }))
  expect(runtime.contributions.pending).toBe(0)
  expect(await w.services().sql.observe(w.binding('suspended'))).toEqual({ kind: 'absent' })
  const successor = await createGovernanceLocal(options)
  if (successor.kind !== 'created') throw new Error('Borrowed dependencies were not preserved')
  expect(
    await successor.service.contribute(w.context, w.command('successor-after-close')),
  ).toMatchObject({ kind: 'registered' })
  expect(await successor.close()).toEqual({ kind: 'closed' })
})
