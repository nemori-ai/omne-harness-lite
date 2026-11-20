import { describe, expect, it } from 'vitest'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { deriveSessionOperation, type SessionManagement } from '@omne-harness/session-contract'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import {
  createCatalog,
  createGovernance,
  createInstances,
  createManagementTypes,
} from '@omne-harness/workspace'
import {
  createMemoryStore,
  fakeAccess,
  fakeAuthority,
  fakeMinting,
  fakeWorld,
} from '@omne-harness/workspace/testing'
import { operationId, type OperationId } from '@omne-harness/workspace-contract'
import {
  SWITCH_ABSENT,
  SWITCH_SILENT,
  createBoundWorkspaceSwitch,
  type SwitchPorts,
} from '../../../src/rows/tool-bindings/switch-workspace.ts'

const [ALICE, BOB] = [fakeAccess(1), fakeAccess(2)]
const op = (text: string) => operationId(text) as OperationId
const SESSION = 'ses_1'
const text = (workspace: unknown) => {
  const encoded = workspaceCodec.encode(workspace as never)
  if (!encoded.ok) throw new Error('workspace')
  return encoded.value
}

/** The workspace domain over a memory store: `/repo` and `/copy` are one resource, `/shop` another. */
async function world() {
  const things = fakeWorld()
  const authority = fakeAuthority()
  const types = createManagementTypes()
  types.contribute(things.type('plain'))
  types.contribute(things.type('versioned', { extends: 'plain', copies: true }))
  const deps = { authority, store: createMemoryStore(), types, minting: fakeMinting(), node: 'n' }
  const [governance, instances, catalog] = [
    createGovernance(deps),
    createInstances(deps),
    createCatalog(deps),
  ]
  for (const address of ['/repo', '/copy', '/other'])
    things.put(address, { kinds: ['plain', 'versioned'], resource: 'repo' })
  things.put('/shop', { kinds: ['plain'], resource: 'shop' })
  const register = async (who: typeof ALICE, address: string) => {
    const made = await governance.register(who, { operation: op(`r${address}`), address })
    if (made.kind !== 'done') throw new Error(JSON.stringify(made))
    return made.value
  }
  return { things, authority, governance, instances, catalog, register }
}
type World = Awaited<ReturnType<typeof world>>

type Change = Parameters<SessionManagement<unknown>['change']>[0]
function harness(w: World, options: { current?: unknown; who?: typeof ALICE; call?: string } = {}) {
  const who = options.who ?? ALICE
  const changes: Change[] = []
  const state = {
    session: { kind: 'session', session: SESSION } as Awaited<ReturnType<SwitchPorts['session']>>,
    change: (async () => ({ ok: {} })) as unknown as SessionManagement<unknown>['change'],
    instances: w.instances as ReturnType<SwitchPorts['instances']>,
    catalog: w.catalog as ReturnType<SwitchPorts['catalog']>,
    management: true,
  }
  const directory = { path: '/repo', workspace: { id: options.current, instance: 'wsi_x' } }
  const request = (options.current === undefined
    ? {}
    : { directory }) as unknown as FixedToolRequest
  const bound = createBoundWorkspaceSwitch(
    {
      principal: who.principal,
      tenant: who.tenant,
      call: (options.call ?? 'call_1') as never,
      request,
    },
    {
      session: async () => state.session,
      instances: () => state.instances,
      catalog: () => state.catalog,
      management: () =>
        state.management
          ? {
              change: input => {
                changes.push(input)
                return state.change(input)
              },
            }
          : undefined,
    },
  )
  return { bound, changes, state }
}
const failing = (kind: string) =>
  (async () => ({ failure: { kind } })) as unknown as SessionManagement<unknown>['change']
const refused = (reason: string) => ({ kind: 'refused', reason })

describe('switching to a directory that is an instance', () => {
  it('verifies the instance and commits the selection as the session, with an operation of the call', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w)
    expect(await h.bound.switch({ kind: 'directory', directory: '/repo' })).toEqual({
      kind: 'switched',
      directory: '/repo',
      associated: false,
    })
    expect(h.changes).toHaveLength(1)
    const [change] = h.changes
    expect(change).toMatchObject({
      principal: ALICE.principal,
      tenant: ALICE.tenant,
      session: SESSION,
      declaration: {
        kind: 'workspace',
        value: made.workspace,
        workspaceAttachment: { instance: made.instance },
        basis: { owner: 'workspace' },
      },
    })
    const tenant = tenantCodec.encode(ALICE.tenant)
    if (!tenant.ok) throw new Error('tenant')
    const operationOf = (call: string) =>
      deriveSessionOperation({
        kind: 'workspace-tool-call',
        tenant: tenant.value,
        session: SESSION as never,
        call,
      })
    expect(change?.operation).toBe(operationOf('call_1'))
    // The same call derives the same operation; another call another one.
    await h.bound.switch({ kind: 'directory', directory: '/repo' })
    expect(h.changes[1]?.operation).toBe(change?.operation)
    const other = harness(w, { call: 'call_2' })
    await other.bound.switch({ kind: 'directory', directory: '/repo' })
    expect(other.changes[0]?.operation).toBe(operationOf('call_2'))
    expect(operationOf('call_2')).not.toBe(operationOf('call_1'))
  })

  it('refuses a directory that is no instance when the call has no current workspace', async () => {
    const w = await world()
    await w.register(ALICE, '/repo')
    const h = harness(w)
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual(
      refused('not-an-instance'),
    )
    expect(h.changes).toEqual([])
  })
})

describe('switching to another working copy of the current workspace', () => {
  it('associates it first, then switches, and says it did both', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual({
      kind: 'switched',
      directory: '/copy',
      associated: true,
    })
    const located = await w.instances.locate(ALICE, '/copy')
    expect(located).toMatchObject({ kind: 'located', workspace: made.workspace })
    expect(h.changes[0]?.declaration).toMatchObject({
      value: made.workspace,
      workspaceAttachment: { instance: (located as { instance: string }).instance },
    })
  })

  it('reads the current workspace of a request that is a copy of the pinned one', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const copied = harness(w, { current: { ...made.workspace } })
    expect(await copied.bound.switch({ kind: 'directory', directory: '/copy' })).toMatchObject({
      kind: 'switched',
      associated: true,
    })
    const none = harness(w, { current: { text: 'nonsense' }, call: 'call_2' })
    expect(await none.bound.switch({ kind: 'directory', directory: '/other' })).toEqual(
      refused('not-an-instance'),
    )
  })

  it('refuses with the reason of the workspace what its type does not take, and changes nothing', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    expect(await h.bound.switch({ kind: 'directory', directory: '/shop' })).toMatchObject({
      kind: 'refused',
    })
    expect(await h.bound.switch({ kind: 'directory', directory: '/nowhere' })).toMatchObject({
      kind: 'refused',
    })
    w.authority.admits((_who, action) => (action === 'workspace.associate' ? 'denied' : 'allowed'))
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual(
      refused('not-permitted'),
    )
    expect(h.changes).toEqual([])
    expect(await w.instances.locate(ALICE, '/copy')).toEqual({ kind: 'none' })
  })

  it.each(['archived', 'frozen', 'invalid', 'denied', 'unavailable', 'commit-unknown'])(
    'says half-done when the association held and the session answered %s, and finishes on the next call',
    async kind => {
      const w = await world()
      const made = await w.register(ALICE, '/repo')
      const h = harness(w, { current: made.workspace })
      h.state.change = failing(kind)
      const first = await h.bound.switch({ kind: 'directory', directory: '/copy' })
      const located = await w.instances.locate(ALICE, '/copy')
      if (located.kind !== 'located') throw new Error('the association did not hold')
      expect(first).toEqual({
        kind: 'half-done',
        associated: located.instance,
        reason: kind === 'denied' ? 'not-permitted' : kind,
      })
      h.state.change = (async () => ({ ok: {} })) as never
      // Another call of the same target finds the instance: nothing is associated twice.
      expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual({
        kind: 'switched',
        directory: '/copy',
        associated: false,
      })
    },
  )

  it('says half-done when the new instance cannot be verified, with why', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    w.authority.admits((_who, action) => (action === 'workspace.attach' ? 'denied' : 'allowed'))
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toMatchObject({
      kind: 'half-done',
      reason: 'not-permitted',
    })
    w.authority.admits((_who, action) =>
      action === 'workspace.attach' ? 'unavailable' : 'allowed',
    )
    const next = harness(w, { current: made.workspace, call: 'call_2' })
    expect(await next.bound.switch({ kind: 'directory', directory: '/other' })).toMatchObject({
      kind: 'half-done',
      reason: 'unavailable',
    })
    expect(h.changes).toEqual([])
    expect(next.changes).toEqual([])
  })
})

describe('switching to a workspace by its identity', () => {
  it('takes its one instance; none or more than one is refused by name', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w)
    const workspace = text(made.workspace)
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual({
      kind: 'switched',
      directory: '/repo',
      associated: false,
    })
    await w.instances.associate(ALICE, {
      operation: op('a'),
      workspace: made.workspace,
      address: '/copy',
    })
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(
      refused('more-than-one-instance'),
    )
    const view = await w.catalog.describe(ALICE, made.workspace)
    if (view.kind !== 'read') throw new Error('view')
    for (const [index, { instance }] of view.value.instances.entries())
      await w.instances.dissociate(ALICE, {
        operation: op(`d${index}`),
        workspace: made.workspace,
        instance,
      })
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(refused('no-instance'))
    expect(h.changes).toHaveLength(1)
  })

  it('refuses a workspace the tenant has no relation with, one that is not there, and a text that is no identity, alike', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { who: BOB })
    for (const workspace of [text(made.workspace), 'wsp_00000000000000000000000099', 'nonsense'])
      expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(
        refused('not-permitted'),
      )
    // Its directory is nothing to this tenant either, and cannot be taken into a workspace of its own.
    expect(await h.bound.switch({ kind: 'directory', directory: '/repo' })).toEqual(
      refused('not-an-instance'),
    )
    const own = await w.register(BOB, '/other')
    const inOwn = harness(w, { who: BOB, current: own.workspace })
    expect(await inOwn.bound.switch({ kind: 'directory', directory: '/repo' })).toMatchObject({
      kind: 'refused',
    })
    expect([...h.changes, ...inOwn.changes]).toEqual([])
  })

  it('refuses when the instance cannot be used now, and is unavailable when that cannot be told', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w)
    const workspace = text(made.workspace)
    w.things.things.get('/repo')!.state = 'gone'
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(
      refused('instance-unavailable'),
    )
    w.authority.admits((_who, action) =>
      action === 'workspace.attach' ? 'unavailable' : 'allowed',
    )
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toMatchObject({
      kind: 'unavailable',
    })
    expect(h.changes).toEqual([])
  })
})

describe('switching to no workspace', () => {
  it('commits a selection of none, asking the workspace owner nothing', async () => {
    const w = await world()
    const h = harness(w)
    const before = w.authority.asked().length
    expect(await h.bound.switch({ kind: 'none' })).toEqual({
      kind: 'switched',
      directory: null,
      associated: false,
    })
    expect(w.authority.asked()).toHaveLength(before)
    expect(h.changes[0]?.declaration).toEqual({
      kind: 'workspace',
      value: null,
      workspaceAttachment: null,
      basis: {
        owner: '@omne-harness/workspace-tools',
        record: 'switch-workspace/none',
        revision: '1',
        digest: '0'.repeat(64),
      },
    })
  })

  it.each([
    ['denied', refused('not-permitted')],
    ['archived', refused('archived')],
    ['frozen', refused('frozen')],
    ['invalid', refused('invalid')],
    ['unavailable', { kind: 'unavailable', diagnostic: 'unavailable' }],
    ['commit-unknown', { kind: 'unavailable', diagnostic: 'commit-unknown' }],
    ['conflict', { kind: 'unavailable', diagnostic: 'conflict' }],
  ])('answers what the session answered: %s', async (kind, answer) => {
    const h = harness(await world())
    h.state.change = failing(kind)
    expect(await h.bound.switch({ kind: 'none' })).toEqual(answer)
  })

  it('refuses a call whose tenant is not one that was parsed', async () => {
    const forged = { principal: ALICE.principal, tenant: { ...ALICE.tenant } } as typeof ALICE
    const h = harness(await world(), { who: forged })
    expect(await h.bound.switch({ kind: 'none' })).toEqual(refused('not-permitted'))
    expect(h.changes).toEqual([])
  })
})

describe('what the switch stands on', () => {
  it('refuses a caller that is not the work principal of a session, and waits when that cannot be told', async () => {
    const w = await world()
    const h = harness(w)
    h.state.session = { kind: 'denied' }
    expect(await h.bound.switch({ kind: 'none' })).toEqual(refused('not-permitted'))
    h.state.session = { kind: 'unavailable', diagnostic: 'principal verifier absent' }
    expect(await h.bound.switch({ kind: 'none' })).toEqual({
      kind: 'unavailable',
      diagnostic: 'principal verifier absent',
    })
    expect(h.changes).toEqual([])
  })

  it('says a service is absent, or did not answer, and never says switched', async () => {
    expect([SWITCH_ABSENT, SWITCH_SILENT]).toEqual([
      'a service the switch needs is absent',
      'a service the switch needs did not answer',
    ])
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const workspace = text(made.workspace)
    const absent = { kind: 'unavailable', diagnostic: SWITCH_ABSENT }
    const silent = { kind: 'unavailable', diagnostic: SWITCH_SILENT }
    const down = async () => {
      throw new Error('down')
    }
    const h = harness(w)
    h.state.management = false
    expect(await h.bound.switch({ kind: 'none' })).toEqual(absent)
    h.state.management = true
    h.state.change = down as never
    expect(await h.bound.switch({ kind: 'none' })).toEqual(silent)
    h.state.instances = undefined
    expect(await h.bound.switch({ kind: 'directory', directory: '/repo' })).toEqual(absent)
    // The catalog finds the one instance; the instances that would verify it are not there.
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(absent)
    h.state.catalog = undefined
    expect(await h.bound.switch({ kind: 'workspace', workspace })).toEqual(absent)
    h.state.instances = { locate: down } as never
    expect(await h.bound.switch({ kind: 'directory', directory: '/repo' })).toEqual(silent)
  })

  it('answers what the workspace owner could not tell, with its word for why', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    const unsure = { kind: 'unavailable', diagnostic: 'admission' }
    w.authority.admits((_who, action) => (action === 'workspace.view' ? 'unavailable' : 'allowed'))
    expect(await h.bound.switch({ kind: 'workspace', workspace: text(made.workspace) })).toEqual(
      unsure,
    )
    w.authority.admits((_who, action) => (action === 'workspace.list' ? 'unavailable' : 'allowed'))
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual(unsure)
    expect(await w.instances.locate(ALICE, '/copy')).toMatchObject({ kind: 'unavailable' })
  })

  it.each(['unavailable', 'unknown', 'conflict'])(
    'an association that answered %s is not known to hold: nothing is switched and nothing is called half-done',
    async kind => {
      const w = await world()
      const made = await w.register(ALICE, '/repo')
      const h = harness(w, { current: made.workspace })
      h.state.instances = { ...w.instances, associate: async () => ({ kind }) as never }
      expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toEqual({
        kind: 'unavailable',
        diagnostic: `the association answered ${kind}`,
      })
      expect(h.changes).toEqual([])
    },
  )

  it('the same call asking for another directory is not the operation it made: nothing more is associated', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    await h.bound.switch({ kind: 'directory', directory: '/copy' })
    expect(await h.bound.switch({ kind: 'directory', directory: '/other' })).toEqual({
      kind: 'unavailable',
      diagnostic: 'the association answered conflict',
    })
    expect(await w.instances.locate(ALICE, '/other')).toEqual({ kind: 'none' })
  })

  it('says half-done, not unavailable, when the session did not answer after an association', async () => {
    const w = await world()
    const made = await w.register(ALICE, '/repo')
    const h = harness(w, { current: made.workspace })
    h.state.change = (async () => {
      throw new Error('down')
    }) as never
    expect(await h.bound.switch({ kind: 'directory', directory: '/copy' })).toMatchObject({
      kind: 'half-done',
      reason: SWITCH_SILENT,
    })
  })
})
