import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type ProducerHandle,
  type ProducerRegistration,
} from '@omne-harness/runtime-context-contract'
import {
  memoryAccess,
  memoryOtherAccess,
  evidence,
  adoption,
  sessionId,
  operationId,
} from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createSessionModesPublisher,
  type SessionModesPublisherInput,
} from '../src/cordis/mode-publisher.ts'
import type { SessionModesObservation } from '../src/cordis/mode-source.ts'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { sessionInquiryBinding } from '../src/cordis/mode-block.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(runtime?: SessionModesPublisherInput<string>['runtime']) {
  const access = memoryAccess('modes-a')
  const encoded = tenantCodec.encode(access.tenant)
  if (!encoded.ok) throw new Error('invalid tenant')
  const scope = decodeScopeRef({ ref: 'modes-scope-a' })
  if ('failure' in scope) throw new Error('invalid scope')
  const published: unknown[] = []
  const invalidated: unknown[] = []
  let disposed = 0
  let registration: ProducerRegistration<'session.modes', string> | undefined
  const handle: ProducerHandle<'session.modes'> = {
    key: 'session.modes',
    tenant: access.tenant,
    producer: { producer: 'modes' },
    generation: 1,
    publish: async input => {
      published.push(input.value)
      return { kind: 'published', scope: input.scope, revision: published.length }
    },
    invalidate: async input => {
      invalidated.push(input)
      return { kind: 'invalidated', scopes: [] }
    },
    dispose: async () => {
      disposed++
    },
  }
  const ready = (
    session = access.session,
  ): Extract<SessionModesObservation, { kind: 'ready' }> => ({
    kind: 'ready',
    scopes: [
      {
        generation: '1',
        scope: session === access.session ? scope.ok.ref : `modes-scope-${session}`,
        operation: operationId('fixture-operation'),
        ended: null,
      },
    ],
    value: {
      modes: {
        permission: 'auto_permission',
        environment: adoption('environment'),
        collaboration: 'co-work',
      },
      inquiry: {
        policy: { onAsk: 'ask-human' },
        source: evidence('mode'),
        translation: adoption('translation'),
      },
      basis: {
        tenant: encoded.value,
        session,
        sessionRevision: '1',
        permissionRevision: '0',
        permissionSource: evidence('permission'),
      },
    },
  })
  let read: (session: typeof access.session) => Promise<SessionModesObservation> = async session =>
    ready(session)
  const publisher = createSessionModesPublisher({
    tenant: access.tenant,
    principal: access.principal,
    runtime: runtime ?? {
      registerProducer: async (_principal, value) => {
        registration = value
        return { kind: 'registered', handle }
      },
    },
    source: { read: input => read(input.session) },
    scopes: {
      lookup: async () => ({
        kind: 'known',
        tenant: access.tenant,
        session: access.session,
        generation: '1',
      }),
    },
    coordinator: async () => succeed(access.principal),
  })
  return {
    publisher,
    access,
    scope: scope.ok,
    published,
    invalidated,
    ready,
    setRead: (next: typeof read) => {
      read = next
    },
    disposed: () => disposed,
    supply: () => registration?.supply,
  }
}

it('registers one tenant and publishes source-bound mode values', async () => {
  const f = fixture()
  expect(await f.publisher.start()).toHaveProperty('kind', 'registered')
  expect(await f.publisher.refresh(f.access.session)).toEqual({ kind: 'refreshed' })
  expect(f.published).toEqual([f.ready().value])
  await f.publisher.close()
  expect(f.disposed()).toBe(1)
})

it('does not block another Session behind a slow original read', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const held = deferred<SessionModesObservation>()
  f.setRead(async session => {
    if (session === f.access.session) {
      entered.resolve()
      return held.promise
    }
    return f.ready(session)
  })
  const first = f.publisher.refresh(f.access.session)
  await entered.promise
  expect(await f.publisher.refresh(sessionId('modes-b'))).toEqual({ kind: 'refreshed' })
  held.resolve(f.ready())
  expect(await first).toEqual({ kind: 'refreshed' })
  await f.publisher.close()
})

it('invalidates an earlier published value when its source becomes unavailable', async () => {
  const f = fixture()
  await f.publisher.refresh(f.access.session)
  f.setRead(async () => ({ kind: 'unavailable' }))
  expect(await f.publisher.refresh(f.access.session)).toEqual({ kind: 'unavailable' })
  expect(f.invalidated).toContainEqual({ kind: 'scope', scope: f.scope, tenant: f.access.tenant })
  await f.publisher.close()
})

it('serializes refreshes of the same Session without allowing an old read to overwrite a later one', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const held = deferred<SessionModesObservation>()
  let reads = 0
  f.setRead(async () => {
    if (++reads === 1) {
      entered.resolve()
      return held.promise
    }
    const next = f.ready()
    return {
      ...next,
      value: { ...next.value, basis: { ...next.value.basis, permissionRevision: '1' } },
    }
  })
  const first = f.publisher.refresh(f.access.session)
  await entered.promise
  const second = f.publisher.refresh(f.access.session)
  expect(reads).toBe(1)
  held.resolve(f.ready())
  expect(await first).toEqual({ kind: 'refreshed' })
  expect(await second).toEqual({ kind: 'refreshed' })
  expect(f.published).toMatchObject([
    { basis: { permissionRevision: '0' } },
    { basis: { permissionRevision: '1' } },
  ])
  await f.publisher.close()
})

it('refuses another tenant supply and removes ended scopes from publication', async () => {
  const f = fixture()
  await f.publisher.refresh(f.access.session)
  const supply = f.supply()
  if (supply === undefined) throw new Error('no supply callback')
  expect(
    await supply({
      principal: f.access.principal,
      tenant: memoryOtherAccess('other-tenant').tenant,
      scope: f.scope,
    }),
  ).toEqual({ kind: 'refused' })
  f.setRead(async () => {
    const value = f.ready()
    return { ...value, scopes: value.scopes.map(scope => ({ ...scope, ended: evidence('ended') })) }
  })
  expect(
    await supply({ principal: f.access.principal, tenant: f.access.tenant, scope: f.scope }),
  ).toEqual({ kind: 'none' })
  expect(await f.publisher.refresh(f.access.session)).toEqual({ kind: 'refreshed' })
  expect(f.invalidated).toContainEqual({ kind: 'scope', scope: f.scope, tenant: f.access.tenant })
  expect(f.published).toHaveLength(1)
  await f.publisher.close()
})

it('withdraws the handle and rejects a late read after close begins', async () => {
  const f = fixture()
  const entered = deferred<void>()
  const held = deferred<SessionModesObservation>()
  f.setRead(async () => {
    entered.resolve()
    return held.promise
  })
  const refresh = f.publisher.refresh(f.access.session)
  await entered.promise
  const closing = f.publisher.close()
  held.resolve(f.ready())
  expect(await refresh).toEqual({ kind: 'closed' })
  await closing
  expect(f.published).toEqual([])
  expect(f.disposed()).toBe(1)
  expect(await f.publisher.refresh(f.access.session)).toEqual({ kind: 'closed' })
})

it('uses the real Runtime Context cache and restores persisted supply after producer remount', async () => {
  const trust = createTestAuthorityPorts<string>()
  const runtime = createRuntimeContext({
    trust: { authority: trust.authority, bindings: trust.bindings },
  })
  const first = fixture(runtime)
  const replacement = fixture(runtime)
  const need = { need: sessionInquiryBinding.need.name, key: sessionInquiryBinding.key }
  const commit = { commit: 'modes-registration' }
  const change = {
    kind: 'add' as const,
    creating: true,
    scope: first.scope,
    tenant: first.access.tenant,
    key: 'session.modes' as const,
    basedOn: 0,
    required: true,
    parameters: undefined,
    bindings: [sessionInquiryBinding],
  }
  async function reader() {
    const issued = await runtime.issueEligibility('holder', {
      supersedes: null,
      scope: first.scope,
      tenant: first.access.tenant,
      consumer: 'coordinator',
      principal: first.access.principal,
      keys: [],
      bindings: [need],
      registrationRevision: 1,
    })
    if (issued.kind !== 'issued') throw new Error(JSON.stringify(issued))
    const bound = await runtime.bind(issued.eligibility.id)
    if (bound.kind !== 'bound') throw new Error(JSON.stringify(bound))
    return bound.reader
  }
  try {
    trust.bind(first.scope, first.access.tenant)
    const begun = await runtime.beginReplay('holder', {
      scope: first.scope,
      tenant: first.access.tenant,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(JSON.stringify(begun))
    expect(
      await runtime.finishReplay('holder', {
        replay: begun.replay,
        material: { registrations: [], checkpoints: [], end: null },
      }),
    ).toHaveProperty('kind', 'ready')
    expect(await first.publisher.start()).toHaveProperty('kind', 'registered')
    expect(
      await runtime.applyCommit('holder', { kind: 'registration', commit, after: null, change }),
    ).toHaveProperty('kind', 'applied')
    let reads = 0
    first.setRead(async () => {
      reads++
      return first.ready()
    })
    expect(await first.publisher.refresh(first.access.session)).toEqual({ kind: 'refreshed' })
    const initialReader = await reader()
    const initial = await initialReader.read([need])
    expect(initial).toMatchObject({
      kind: 'success',
      value: [
        {
          kind: 'value',
          value: {
            inquiry: { policy: { onAsk: 'ask-human' } },
            basis: { permissionRevision: '0' },
          },
        },
      ],
    })
    expect(await initialReader.read([need])).toEqual(initial)
    expect(reads).toBe(1)

    const entered = deferred<void>()
    const held = deferred<SessionModesObservation>()
    first.setRead(async () => {
      entered.resolve()
      return held.promise
    })
    const late = first.publisher.refresh(first.access.session)
    await entered.promise
    expect(await replacement.publisher.start()).toHaveProperty('kind', 'registered')
    expect(await replacement.publisher.refresh(first.access.session)).toEqual({ kind: 'refreshed' })
    held.resolve(first.ready())
    expect(await late).toEqual({ kind: 'unavailable' })
    await first.publisher.close()
    expect(await initialReader.read([need])).toHaveProperty('kind', 'success')
    expect(await replacement.publisher.start()).toHaveProperty('kind', 'registered')
    const restoring = await runtime.beginReplay('holder', {
      scope: first.scope,
      tenant: first.access.tenant,
      through: commit,
      supersedes: begun.replay,
    })
    if (restoring.kind !== 'replaying') throw new Error(JSON.stringify(restoring))
    expect(
      await runtime.finishReplay('holder', {
        replay: restoring.replay,
        material: { registrations: [{ commit, change }], checkpoints: [], end: null },
      }),
    ).toHaveProperty('kind', 'ready')
    let supplies = 0
    replacement.setRead(async () => {
      supplies++
      return replacement.ready()
    })
    const restored = await reader()
    expect(await restored.read([need])).toMatchObject({ kind: 'success' })
    expect(await restored.read([need])).toMatchObject({ kind: 'success' })
    expect(supplies).toBe(1)
  } finally {
    await first.publisher.close()
    await replacement.publisher.close()
    await runtime.close()
  }
})
