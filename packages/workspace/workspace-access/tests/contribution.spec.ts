import { access, tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { NAMES, OTHER, TENANT, world, type Name } from './fixtures/world.ts'

const WORKSPACE = 'wsp_00000000000000000000000001'
const INSTANCE = 'wsi_00000000000000000000000001'
const REGISTERED = { workspace: WORKSPACE, instance: INSTANCE, type: 'plain' }
const register = { operation: 'op-1', address: '/a' }
const ON_TARGET = ['grant-participation', 'grant-admin', 'revoke-admin', 'remove'] as const
const ON_SELF = ['leave', 'destroy'] as const
const CHANGES = [...ON_TARGET, ...ON_SELF]
const ending = { operation: 'op-c', workspace: WORKSPACE }
const onOther = { ...ending, target: OTHER }

/** One body per operation that the protocol reads and the domain takes. */
const SAMPLES: Record<Name, Record<string, unknown>> = {
  register,
  'query-register': register,
  list: {},
  describe: { workspace: WORKSPACE },
  associate: { ...ending, address: '/b' },
  'query-associate': { ...ending, address: '/b' },
  dissociate: { ...ending, instance: INSTANCE },
  'query-dissociate': { ...ending, instance: INSTANCE },
  ...Object.fromEntries(
    ON_TARGET.flatMap(name => [name, `query-${name}`]).map(name => [name, onOther]),
  ),
  ...Object.fromEntries(
    ON_SELF.flatMap(name => [name, `query-${name}`]).map(name => [name, ending]),
  ),
} as unknown as Record<Name, Record<string, unknown>>

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

  it('an operation name that was used for something else is not a registration', async () => {
    const w = world()
    w.things.put('/a', {})
    await w.call('register', register)
    const tenant = tenantCodec.parse(TENANT)
    const workspace = workspaceCodec.parse(WORKSPACE)
    if (!tenant.ok || !workspace.ok) throw new Error('fixture identity did not parse')
    const ended = await w.instances.dissociate(access(w.principal as never, tenant.value), {
      operation: 'op-9' as never,
      workspace: workspace.value,
      instance: INSTANCE as never,
    })
    expect(ended).toMatchObject({ kind: 'done', changed: true })
    expect(await w.call('query-register', { operation: 'op-9', address: '/a' })).toEqual({
      outcome: 'not-committed',
      body: {},
    })
  })

  it('a domain that throws is unknown for the commit and an unavailable basis for a read', async () => {
    const w = world()
    const down = () => Promise.reject(new Error('down'))
    const governance = Object.fromEntries(
      Object.keys(w.real.governance).map(name => [name, down]),
    ) as never
    w.state.faces = { ...w.real, governance, catalog: { list: down, describe: down } }
    for (const name of ['register', ...CHANGES] as const)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'unknown' })
    for (const name of CHANGES)
      expect(await w.call(`query-${name}`, SAMPLES[name])).toEqual({
        outcome: 'basis-unavailable',
      })
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

describe('changing who takes part, leaving and destroying', () => {
  const DONE = { outcome: 'succeeded', body: {} }
  const SAME = { outcome: 'no-change', body: {} }
  const NOT_COMMITTED = { outcome: 'not-committed', body: {} }
  const named = (operation: string) => ({ operation, workspace: WORKSPACE })
  const onTenant = (operation: string) => ({ ...named(operation), target: OTHER })

  async function owned() {
    const w = world()
    w.things.put('/a', {})
    await w.call('register', register)
    return w
  }

  it('each change answers done, then nothing changed, and its query says it was committed', async () => {
    const w = await owned()
    const steps = [
      ['grant-participation', onTenant('c1'), TENANT],
      ['grant-admin', onTenant('c2'), TENANT],
      ['revoke-admin', onTenant('c3'), TENANT],
      ['leave', named('c4'), OTHER],
      ['grant-participation', onTenant('c5'), TENANT],
      ['remove', onTenant('c6'), TENANT],
      ['destroy', named('c7'), TENANT],
    ] as const
    for (const [name, body, tenant] of steps) {
      expect([name, await w.call(`query-${name}`, body, tenant)]).toEqual([name, NOT_COMMITTED])
      expect([name, await w.call(name, body, tenant)]).toEqual([name, DONE])
      expect([name, await w.call(name, body, tenant)]).toEqual([name, SAME])
      expect([name, await w.call(`query-${name}`, body, tenant)]).toEqual([name, DONE])
    }
    expect(await w.call('list', {})).toEqual({ outcome: 'succeeded', body: { workspaces: [] } })
    expect(await w.call('query-remove', onTenant('c7'))).toEqual(NOT_COMMITTED)
  })

  it('answers what the domain refused: not permitted is denied, not performed carries the reason', async () => {
    const w = await owned()
    expect(await w.call('grant-participation', onTenant('c1'), OTHER)).toEqual({
      outcome: 'denied',
    })
    expect(await w.call('grant-admin', onTenant('c2'))).toEqual({
      outcome: 'invalid',
      body: { reason: 'not-a-participant' },
    })
    await w.call('grant-participation', onTenant('c3'))
    expect(await w.call('remove', { ...onTenant('c3') })).toEqual({ outcome: 'conflict', body: {} })
    expect(await w.call('destroy', named('c4'), OTHER)).toEqual({ outcome: 'denied' })
  })

  it('a text that is no workspace identity is denied before the domain; an unreadable store is an unavailable basis', async () => {
    const w = await owned()
    const asked = w.authority.asked().length
    for (const name of ON_TARGET)
      expect(await w.call(name, { ...onTenant('c1'), workspace: 'nowhere' })).toEqual({
        outcome: 'denied',
      })
    for (const name of ON_SELF)
      expect(await w.call(name, { ...named('c1'), workspace: 'nowhere' })).toEqual({
        outcome: 'denied',
      })
    expect(w.authority.asked()).toHaveLength(asked)
    w.store.fail('unreadable')
    for (const name of CHANGES)
      expect(await w.call(`query-${name}`, SAMPLES[name])).toEqual({
        outcome: 'basis-unavailable',
      })
  })

  it('a name that is no operation name is invalid for the change and not committed for its query', async () => {
    const w = await owned()
    for (const name of CHANGES) {
      const body = { ...SAMPLES[name], operation: 'a b' }
      expect([name, await w.call(name, body)]).toEqual([
        name,
        { outcome: 'invalid', body: { reason: 'invalid-request' } },
      ])
      expect([name, await w.call(`query-${name}`, body)]).toEqual([name, NOT_COMMITTED])
    }
  })

  it('a tenant that is no member is denied when it asks what was committed', async () => {
    const w = await owned()
    w.authority.standingIs(() => 'not-member')
    for (const name of CHANGES)
      expect([name, await w.call(`query-${name}`, SAMPLES[name])]).toEqual([
        name,
        { outcome: 'denied' },
      ])
  })

  it('a commit whose receipt was lost is unknown; the query then says it was committed', async () => {
    const w = await owned()
    w.store.fail('lost')
    expect(await w.call('grant-participation', onTenant('c1'))).toEqual({ outcome: 'unknown' })
    w.store.fail('none')
    expect(await w.call('query-grant-participation', onTenant('c1'))).toEqual(DONE)
  })
})

describe('associating and dissociating an instance', () => {
  const SECOND = 'wsi_00000000000000000000000002'
  const NOT_COMMITTED = { outcome: 'not-committed', body: {} }
  const associating = { operation: 'a1', workspace: WORKSPACE, address: '/b' }
  const dissociating = { operation: 'd1', workspace: WORKSPACE, instance: SECOND }

  async function owned() {
    const w = world()
    const copies = w.things.type('versioned', { extends: 'plain', copies: true })
    w.types.contribute(copies)
    for (const address of ['/a', '/b'])
      w.things.put(address, { kinds: ['plain', 'versioned'], resource: 'repo' })
    w.things.put('/c', { kinds: ['plain', 'versioned'], resource: 'other' })
    await w.call('register', register)
    return w
  }

  it('an association answers the instance, then nothing changed; a dissociation ends it; each query says what was committed', async () => {
    const w = await owned()
    expect(await w.call('query-associate', associating)).toEqual(NOT_COMMITTED)
    expect(await w.call('associate', associating)).toEqual({
      outcome: 'succeeded',
      body: { instance: SECOND },
    })
    expect(await w.call('associate', associating)).toEqual({
      outcome: 'no-change',
      body: { instance: SECOND },
    })
    expect(await w.call('query-associate', associating)).toEqual({
      outcome: 'succeeded',
      body: { instance: SECOND },
    })
    expect(await w.call('query-dissociate', dissociating)).toEqual(NOT_COMMITTED)
    expect(await w.call('dissociate', dissociating)).toEqual({ outcome: 'succeeded', body: {} })
    expect(await w.call('dissociate', dissociating)).toEqual({ outcome: 'no-change', body: {} })
    expect(await w.call('query-dissociate', dissociating)).toEqual({
      outcome: 'succeeded',
      body: {},
    })
    const described = (await w.call('describe', { workspace: WORKSPACE })) as {
      body: { instances: readonly unknown[] }
    }
    expect(described.body.instances).toHaveLength(1)
    // The name of an association is not the name of a dissociation.
    expect(await w.call('query-dissociate', { ...dissociating, operation: 'a1' })).toEqual(
      NOT_COMMITTED,
    )
  })

  it('answers what the domain refused, and denies a text that is no workspace or a tenant with no relation', async () => {
    const w = await owned()
    expect(await w.call('associate', { ...associating, address: '/c' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'not-the-same-resource' },
    })
    expect(await w.call('associate', { ...associating, operation: 'a b' })).toMatchObject({
      outcome: 'invalid',
    })
    for (const body of [{ ...associating, workspace: 'nope' }, associating])
      expect(await w.call('associate', body, body === associating ? OTHER : TENANT)).toEqual({
        outcome: 'denied',
      })
    expect(await w.call('dissociate', { ...dissociating, instance: 'nope' })).toEqual({
      outcome: 'denied',
    })
    expect(await w.call('dissociate', dissociating, OTHER)).toEqual({ outcome: 'denied' })
  })

  it('a domain that throws is unknown for the commit; the query then says it was not committed', async () => {
    const w = await owned()
    const down = async () => {
      throw new Error('down')
    }
    w.state.faces = { ...w.real, instances: { associate: down, dissociate: down } }
    expect(await w.call('associate', associating)).toEqual({ outcome: 'unknown' })
    expect(await w.call('dissociate', dissociating)).toEqual({ outcome: 'unknown' })
    w.state.faces = w.real
    expect(await w.call('query-associate', associating)).toEqual(NOT_COMMITTED)
  })
})
