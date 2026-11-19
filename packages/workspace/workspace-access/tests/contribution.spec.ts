import { describe, expect, it } from 'vitest'
import { NAMES, OTHER, TENANT, world, type Name } from './fixtures/world.ts'

const WORKSPACE = 'wsp_00000000000000000000000001'
const INSTANCE = 'wsi_00000000000000000000000001'
const REGISTERED = { workspace: WORKSPACE, instance: INSTANCE, type: 'plain' }
const register = { operation: 'op-1', address: '/a' }

/** One body per operation that the protocol reads and the domain takes. */
const SAMPLES: Record<Name, Record<string, unknown>> = {
  register,
  'query-register': register,
  list: {},
  describe: { workspace: WORKSPACE },
}

describe('the first three steps', () => {
  it.each([
    ['a login that may not act for the tenant', 'denied', 'denied'],
    ['an identity that cannot answer', 'basis-unavailable', 'basis-unavailable'],
    ['an identity that throws', 'throws', 'basis-unavailable'],
  ] as const)('%s stops every operation before the domain', async (_label, login, outcome) => {
    const w = world()
    w.state.login = login
    for (const name of NAMES) expect(await w.call(name, SAMPLES[name])).toEqual({ outcome })
    expect(w.authority.asked()).toEqual([])
  })

  it('asks whether the login acts for the tenant of the body, at every call', async () => {
    const w = world()
    await w.call('list', {})
    await w.call('list', {}, OTHER)
    expect(w.state.logins).toEqual([TENANT, OTHER])
  })

  it('answers an unavailable basis while the workspace faces are not there, and works when they are back', async () => {
    const w = world()
    w.state.faces = undefined
    for (const name of NAMES)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
    w.state.faces = w.real
    expect(await w.call('list', {})).toEqual({ outcome: 'succeeded', body: { workspaces: [] } })
  })

  it('hands the domain the principal the application issued, for the tenant of the body', async () => {
    const w = world()
    const seen: unknown[] = []
    w.authority.standingIs(caller => (seen.push(caller), 'member'))
    await w.call('list', {})
    expect(seen).toEqual([
      { principal: w.principal, tenant: expect.objectContaining({ name: 'TenantId' }) },
    ])
  })
})

describe('registering', () => {
  it('answers the workspace, and the same body again is nothing changed', async () => {
    const w = world()
    w.things.put('/a', {})
    expect(await w.call('register', register)).toEqual({ outcome: 'succeeded', body: REGISTERED })
    expect(await w.call('register', register)).toEqual({ outcome: 'no-change', body: REGISTERED })
    expect(await w.call('register', { ...register, type: 'plain' })).toEqual({
      outcome: 'conflict',
      body: {},
    })
  })

  it("answers the domain's or the type's reason when it is not performed", async () => {
    const w = world()
    w.things.put('/a', {})
    expect(await w.call('register', register, OTHER)).toMatchObject({ outcome: 'succeeded' })
    expect(await w.call('register', { operation: 'op-2', address: '/a' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'occupied' },
    })
    expect(await w.call('register', { operation: 'op-3', address: '/nowhere' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'not-found' },
    })
    expect(await w.call('register', { ...register, type: 'no-such-type' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'type-unknown' },
    })
  })

  it.each([
    ['an operation name with a space', { operation: 'two words', address: '/a' }],
    ['a type name that is not one', { operation: 'op-1', address: '/a', type: 'Not A Type' }],
  ])('%s is an invalid request and the domain is not asked', async (_name, body) => {
    const w = world()
    w.things.put('/a', {})
    expect(await w.call('register', body)).toEqual({
      outcome: 'invalid',
      body: { reason: 'invalid-request' },
    })
    expect(await w.call('query-register', body)).toEqual({ outcome: 'not-committed', body: {} })
    expect(w.authority.asked()).toEqual([])
  })

  it.each([
    ['not admitted', 'denied', 'denied'],
    ['an admission that cannot answer', 'unavailable', 'basis-unavailable'],
  ] as const)('%s is %s', async (_name, admission, outcome) => {
    const w = world()
    w.things.put('/a', {})
    w.authority.admits(() => admission)
    expect(await w.call('register', register)).toEqual({ outcome })
    expect(await w.call('query-register', register)).toEqual({ outcome })
    expect(await w.call('describe', { workspace: WORKSPACE })).toEqual(
      admission === 'denied' ? { outcome: 'not-found', body: {} } : { outcome },
    )
  })

  it('a lost receipt is unknown, and the query with the same body says what was done', async () => {
    const w = world()
    w.things.put('/a', {})
    expect(await w.call('query-register', register)).toEqual({ outcome: 'not-committed', body: {} })
    w.store.fail('lost')
    expect(await w.call('register', register)).toEqual({ outcome: 'unknown' })
    w.store.fail('none')
    expect(await w.call('query-register', register)).toEqual({
      outcome: 'succeeded',
      body: REGISTERED,
    })
    expect(await w.call('query-register', register, OTHER)).toEqual({
      outcome: 'not-committed',
      body: {},
    })
  })

  it('a domain that throws is unknown for the commit and an unavailable basis for a read', async () => {
    const w = world()
    const down = () => Promise.reject(new Error('down'))
    w.state.faces = {
      governance: { register: down, operation: down },
      catalog: { list: down, describe: down },
    }
    expect(await w.call('register', register)).toEqual({ outcome: 'unknown' })
    for (const name of ['query-register', 'list', 'describe'] as const)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
  })

  it('a store that cannot be read is an unavailable basis', async () => {
    const w = world()
    w.store.fail('unreadable')
    for (const name of ['query-register', 'list', 'describe'] as const)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('listing and describing', () => {
  it('lists what the tenant is related to and describes each instance with a look taken now', async () => {
    const w = world()
    w.things.put('/a', { version: 'v3' })
    await w.call('register', register)
    expect(await w.call('list', {})).toEqual({
      outcome: 'succeeded',
      body: { workspaces: [{ workspace: WORKSPACE, type: 'plain', standing: 'owner' }] },
    })
    const view = (availability: unknown) => ({
      outcome: 'succeeded',
      body: {
        workspace: WORKSPACE,
        type: 'plain',
        standing: 'owner',
        instances: [{ instance: INSTANCE, address: '/a', availability }],
      },
    })
    expect(await w.call('describe', { workspace: WORKSPACE })).toEqual(
      view({ kind: 'available', directory: '/a', basis: 'v3' }),
    )
    w.things.things.get('/a')!.state = 'gone'
    expect(await w.call('describe', { workspace: WORKSPACE })).toEqual(
      view({ kind: 'unavailable', reason: 'missing' }),
    )
    w.things.things.get('/a')!.state = 'unreadable'
    expect(await w.call('describe', { workspace: WORKSPACE })).toEqual(view({ kind: 'unknown' }))
  })

  it('another tenant, a workspace that is not there and an identity that is not one all read as not found', async () => {
    const w = world()
    w.things.put('/a', {})
    await w.call('register', register)
    const notFound = { outcome: 'not-found', body: {} }
    expect(await w.call('describe', { workspace: WORKSPACE }, OTHER)).toEqual(notFound)
    expect(await w.call('describe', { workspace: 'wsp_00000000000000000000000009' })).toEqual(
      notFound,
    )
    expect(await w.call('describe', { workspace: 'not-a-workspace' })).toEqual(notFound)
    expect(await w.call('list', {}, OTHER)).toEqual({
      outcome: 'succeeded',
      body: { workspaces: [] },
    })
  })
})
