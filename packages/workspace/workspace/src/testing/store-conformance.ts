import assert from 'node:assert/strict'
import type { InstanceId, Json, TypeName } from '@omne-harness/workspace-contract'
import type { WorkspaceStore } from '../store.ts'
import type { RelationCommand } from '../transactions/governance.ts'
import type { AssociateCommand } from '../transactions/instances.ts'
import type { RegisterCommand } from '../transactions/register.ts'
import type { AdoptCommand } from '../transactions/sources.ts'

export type StoreConformanceCase = Readonly<{
  name: string
  run(make: () => Promise<WorkspaceStore>): Promise<void>
}>

const instance = (name: string) => `wsi_${name.padStart(26, '0')}` as InstanceId
const MATERIAL: Json = { scope: { root: '/a' }, list: [1, 'two', null, true], nested: { deep: {} } }

const register = (over: Partial<RegisterCommand> = {}): RegisterCommand => ({
  tenant: 'alice',
  operation: 'r1',
  digest: 'd-r1',
  workspace: 'wsp_1',
  instance: instance('1'),
  type: 'plain' as TypeName,
  node: 'node-1',
  occupancy: '/a',
  address: '/a',
  material: MATERIAL,
  ...over,
})

const second = (over: Partial<RegisterCommand> = {}): RegisterCommand =>
  register({
    operation: 'r2',
    digest: 'd-r2',
    workspace: 'wsp_2',
    instance: instance('2'),
    occupancy: '/b',
    address: '/b',
    ...over,
  })

const associate = (over: Partial<AssociateCommand> = {}): AssociateCommand => ({
  tenant: 'alice',
  operation: 'a1',
  digest: 'd-a1',
  workspace: 'wsp_1',
  instance: instance('3'),
  node: 'node-1',
  occupancy: '/c',
  address: '/c',
  material: { scope: { root: '/c' } },
  revision: 1,
  ...over,
})

const committed = <T>(answer: { kind: string; value?: T }): T => {
  assert.equal(answer.kind, 'committed', JSON.stringify(answer))
  return answer.value as T
}
const read = <T>(answer: { kind: string; value?: T }): T => {
  assert.equal(answer.kind, 'read', JSON.stringify(answer))
  return answer.value as T
}

const lamp = (version: string) => ({
  category: 'gadget',
  namespace: 'gadgets',
  name: 'lamp',
  root: 'shared' as const,
  version,
  entries: [{ path: 'MAIN.md', bytes: 2, digest: `f:${version}` }],
})

/** Alice adopts the sources of wsp_1 for a key: the packages read, or a reason to keep the last. */
const adopt = (
  key: string,
  read: AdoptCommand['read'],
  over: Partial<AdoptCommand> = {},
): AdoptCommand => ({
  tenant: 'alice',
  workspace: 'wsp_1',
  key,
  instance: instance('1'),
  read,
  ...over,
})

const DONE = { kind: 'done', value: null, changed: true }
const SAME = { kind: 'done', value: null, changed: false }
const DENIED = { kind: 'not-permitted' }

/** A change to a relation of wsp_1 by alice, on bob unless said otherwise. */
const change = (
  operation: string,
  kind: RelationCommand['change'],
  over: Partial<RelationCommand> = {},
): RelationCommand => ({
  tenant: 'alice',
  digest: `d-${operation}`,
  workspace: 'wsp_1',
  target: 'bob',
  ...over,
  operation,
  change: kind,
})
const destroy = (operation: string, tenant = 'alice', workspace = 'wsp_1') => ({
  tenant,
  operation,
  digest: `d-${operation}`,
  workspace,
})

/** What every implementation of the repository does the same way. */
export const storeConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'a registration is read back whole by its owner',
    async run(make) {
      const store = await make()
      assert.deepEqual(committed(await store.register(register())), {
        kind: 'done',
        value: { workspace: 'wsp_1', instance: instance('1'), type: 'plain' },
        changed: true,
      })
      assert.deepEqual(read(await store.state('alice', 'wsp_1')), {
        workspace: { workspace: 'wsp_1', type: 'plain', revision: 1 },
        relation: { role: 'owner' },
        instances: [
          {
            instance: instance('1'),
            workspace: 'wsp_1',
            node: 'node-1',
            occupancy: '/a',
            address: '/a',
            material: MATERIAL,
            state: 'active',
          },
        ],
      })
    },
  },
  {
    name: 'a tenant without a relation reads nothing: not the workspace, not its place in a list',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      assert.equal(read(await store.state('bob', 'wsp_1')), null)
      assert.equal(read(await store.state('alice', 'wsp_none')), null)
      assert.deepEqual(read(await store.memberships('bob')), [])
      assert.equal(read(await store.operation('bob', 'r1')), null)
    },
  },
  {
    name: 'memberships are the workspaces of that tenant, in the order of their identities',
    async run(make) {
      const store = await make()
      committed(await store.register(second()))
      committed(await store.register(register()))
      committed(
        await store.register(
          second({
            tenant: 'bob',
            operation: 'r3',
            workspace: 'wsp_3',
            instance: instance('9'),
            occupancy: '/z',
          }),
        ),
      )
      assert.deepEqual(
        read(await store.memberships('alice')).map(found => [
          found.workspace.workspace,
          found.relation.role,
        ]),
        [
          ['wsp_1', 'owner'],
          ['wsp_2', 'owner'],
        ],
      )
    },
  },
  {
    name: 'a position holds one active instance of a node, whoever asks',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      for (const tenant of ['alice', 'bob'])
        assert.deepEqual(committed(await store.register(second({ tenant, occupancy: '/a' }))), {
          kind: 'not-performed',
          reason: 'occupied',
        })
      assert.equal(read(await store.state('alice', 'wsp_2')), null)
      assert.equal(
        committed(await store.register(second({ occupancy: '/a', node: 'node-2' }))).kind,
        'done',
      )
    },
  },
  {
    name: 'an operation is done once: recalled with the same digest, a conflict with another',
    async run(make) {
      const store = await make()
      const first = committed(await store.register(register()))
      const again = committed(
        await store.register(register({ workspace: 'wsp_9', instance: instance('9') })),
      )
      assert.deepEqual(again, { ...first, changed: false })
      assert.deepEqual(committed(await store.register(register({ digest: 'other' }))), {
        kind: 'conflict',
      })
      assert.deepEqual(read(await store.memberships('alice')).length, 1)
      assert.deepEqual(read(await store.operation('alice', 'r1')), {
        tenant: 'alice',
        operation: 'r1',
        kind: 'register',
        digest: 'd-r1',
        value: { workspace: 'wsp_1', instance: instance('1'), type: 'plain' },
      })
    },
  },
  {
    name: 'an association is decided at a revision and moves it on',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      assert.deepEqual(committed(await store.associate(associate({ revision: 7 }))), {
        kind: 'stale',
      })
      assert.deepEqual(committed(await store.associate(associate({ tenant: 'bob' }))), {
        kind: 'not-permitted',
      })
      assert.deepEqual(committed(await store.associate(associate())), {
        kind: 'done',
        value: { instance: instance('3') },
        changed: true,
      })
      const state = read(await store.state('alice', 'wsp_1'))
      assert.equal(state?.workspace.revision, 2)
      assert.deepEqual(
        state?.instances.map(record => record.instance),
        [instance('1'), instance('3')],
      )
    },
  },
  {
    name: 'a dissociated instance is no longer among the instances and frees its position',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      const command = {
        tenant: 'alice',
        operation: 'd1',
        digest: 'd-d1',
        workspace: 'wsp_1',
        instance: instance('1'),
      }
      assert.deepEqual(committed(await store.dissociate(command)), {
        kind: 'done',
        value: null,
        changed: true,
      })
      const state = read(await store.state('alice', 'wsp_1'))
      assert.deepEqual(state?.instances, [])
      assert.equal(state?.workspace.revision, 2)
      assert.equal(committed(await store.register(second({ occupancy: '/a' }))).kind, 'done')
      assert.deepEqual(
        committed(await store.dissociate({ ...command, operation: 'd2', digest: 'd-d2' })),
        {
          kind: 'done',
          value: null,
          changed: false,
        },
      )
      assert.equal(read(await store.state('alice', 'wsp_1'))?.workspace.revision, 2)
    },
  },
  {
    name: 'granting participation relates the target, counts for it alone, and is done once',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 1)
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 0)
      const grant = change('g1', 'grant-participation')
      assert.deepEqual(committed(await store.govern(grant)), DONE)
      assert.deepEqual(read(await store.state('bob', 'wsp_1'))?.relation, {
        role: 'participant',
        superAdmin: false,
      })
      assert.equal(read(await store.state('bob', 'wsp_1'))?.workspace.revision, 2)
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 1)
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 1)
      assert.equal(read(await store.sourceRevision('carol', 'wsp_1')), 0)
      assert.deepEqual(committed(await store.govern(grant)), SAME)
      assert.deepEqual(committed(await store.govern(change('g2', 'grant-participation'))), SAME)
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 1)
      assert.equal(read(await store.state('bob', 'wsp_1'))?.workspace.revision, 2)
      assert.equal(read(await store.operation('alice', 'g1'))?.kind, 'grant-participation')
      assert.deepEqual(committed(await store.govern({ ...grant, change: 'remove' })), {
        kind: 'conflict',
      })
    },
  },
  {
    name: 'a relation changes as the policy decides: super-admin given and taken, a participant removed, one that leaves',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      committed(await store.govern(change('g1', 'grant-participation')))
      committed(await store.govern(change('g2', 'grant-participation', { target: 'carol' })))
      assert.deepEqual(committed(await store.govern(change('a1', 'grant-admin'))), DONE)
      assert.deepEqual(read(await store.state('bob', 'wsp_1'))?.relation, {
        role: 'participant',
        superAdmin: true,
      })
      const byBob = { tenant: 'bob', target: 'carol' }
      assert.deepEqual(committed(await store.govern(change('b1', 'grant-admin', byBob))), DENIED)
      assert.deepEqual(committed(await store.govern(change('b2', 'remove', byBob))), DONE)
      assert.equal(read(await store.state('carol', 'wsp_1')), null)
      assert.deepEqual(read(await store.memberships('carol')), [])
      assert.equal(read(await store.sourceRevision('carol', 'wsp_1')), 2)
      assert.deepEqual(committed(await store.govern(change('a2', 'revoke-admin'))), DONE)
      assert.deepEqual(read(await store.state('bob', 'wsp_1'))?.relation, {
        role: 'participant',
        superAdmin: false,
      })
      const leaving = change('b3', 'leave', { tenant: 'bob', target: 'alice' })
      assert.deepEqual(committed(await store.govern(leaving)), DONE)
      assert.equal(read(await store.state('bob', 'wsp_1')), null)
      assert.deepEqual(read(await store.state('alice', 'wsp_1'))?.relation, { role: 'owner' })
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 4)
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 1)
    },
  },
  {
    name: 'what the policy refuses changes nothing, and a workspace that is not there is refused the same way',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      const stranger = { tenant: 'mallory', target: 'mallory' }
      for (const answer of [
        await store.govern(change('m1', 'grant-participation', stranger)),
        await store.govern(change('m2', 'grant-participation', { workspace: 'wsp_none' })),
        await store.govern(change('m3', 'remove', { target: 'alice' })),
        await store.govern(change('m4', 'leave')),
        await store.destroy(destroy('m5', 'mallory')),
        await store.destroy(destroy('m6', 'alice', 'wsp_none')),
      ])
        assert.deepEqual(committed(answer), DENIED)
      assert.deepEqual(committed(await store.govern(change('m7', 'grant-admin'))), {
        kind: 'not-performed',
        reason: 'not-a-participant',
      })
      assert.equal(read(await store.state('mallory', 'wsp_1')), null)
      assert.equal(read(await store.state('alice', 'wsp_1'))?.workspace.revision, 1)
      assert.equal(read(await store.operation('alice', 'm7')), null)
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 0)
    },
  },
  {
    name: 'destroying ends every relation and every association in one commit, counts for each tenant, and is done once',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      committed(await store.register(second()))
      committed(await store.govern(change('g1', 'grant-participation')))
      committed(await store.associate(associate({ revision: 2 })))
      assert.deepEqual(committed(await store.destroy(destroy('x1'))), DONE)
      assert.equal(read(await store.state('alice', 'wsp_1')), null)
      assert.equal(read(await store.state('bob', 'wsp_1')), null)
      assert.deepEqual(
        read(await store.memberships('alice')).map(found => found.workspace.workspace),
        ['wsp_2'],
      )
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 2)
      assert.equal(read(await store.sourceRevision('bob', 'wsp_1')), 2)
      assert.equal(read(await store.sourceRevision('alice', 'wsp_2')), 1)
      assert.equal(read(await store.state('alice', 'wsp_2'))?.instances.length, 1)
      assert.deepEqual(committed(await store.destroy(destroy('x1'))), SAME)
      assert.deepEqual(committed(await store.destroy(destroy('x2'))), DENIED)
      assert.equal(read(await store.operation('alice', 'x1'))?.kind, 'destroy')
      const first = register({
        operation: 'r9',
        digest: 'd-r9',
        workspace: 'wsp_9',
        instance: instance('9'),
      })
      assert.equal(committed(await store.register(first)).kind, 'done')
      const freed = second({
        operation: 'r8',
        digest: 'd-r8',
        workspace: 'wsp_8',
        instance: instance('8'),
        occupancy: '/c',
        address: '/c',
      })
      assert.equal(committed(await store.register(freed)).kind, 'done')
    },
  },
  {
    name: 'an adoption records a reading under its key, and the key keeps it',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      assert.deepEqual(read(await store.adoption('alice', 'wsp_1', 'k1')), null)
      const first = committed(
        await store.adopt(adopt('k1', { kind: 'read', packages: [lamp('v1')] })),
      )
      assert.equal(first.kind, 'adopted')
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 2)
      const again = committed(
        await store.adopt(adopt('k1', { kind: 'read', packages: [lamp('v2')] })),
      )
      assert.deepEqual(again, first)
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 2)
      const stored = read(await store.adoption('alice', 'wsp_1', 'k1'))
      assert.deepEqual(stored, {
        adoption: (first as { adoption: unknown }).adoption,
        reading: (first as { reading: unknown }).reading,
      })
      assert.deepEqual(stored?.reading?.packages, [lamp('v1')])
      assert.deepEqual(stored?.adoption, {
        workspace: 'wsp_1',
        tenant: 'alice',
        key: 'k1',
        instance: instance('1'),
        revision: 2,
        fresh: true,
        reason: null,
      })
    },
  },
  {
    name: 'a reading like the last one is not recorded again; a kept one points at the last, or at none',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      const none = committed(await store.adopt(adopt('k0', { kind: 'kept', reason: 'gone' })))
      assert.deepEqual(none, {
        kind: 'adopted',
        adoption: {
          workspace: 'wsp_1',
          tenant: 'alice',
          key: 'k0',
          instance: instance('1'),
          revision: 0,
          fresh: false,
          reason: 'gone',
        },
        reading: null,
      })
      // What a kept key reads back is what it was given: not fresh, with its reason.
      assert.deepEqual(read(await store.adoption('alice', 'wsp_1', 'k0')), {
        adoption: (none as { adoption: unknown }).adoption,
        reading: null,
      })
      committed(await store.adopt(adopt('k1', { kind: 'read', packages: [lamp('v1')] })))
      const same = committed(
        await store.adopt(adopt('k2', { kind: 'read', packages: [lamp('v1')] })),
      )
      assert.equal((same as { adoption: { revision: number } }).adoption.revision, 2)
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 2)
      const kept = committed(await store.adopt(adopt('k3', { kind: 'kept', reason: 'busy' })))
      assert.equal((kept as { adoption: { revision: number } }).adoption.revision, 2)
      assert.deepEqual((kept as { reading: { packages: unknown } }).reading.packages, [lamp('v1')])
      committed(await store.adopt(adopt('k4', { kind: 'read', packages: [lamp('v2')] })))
      assert.equal(read(await store.sourceRevision('alice', 'wsp_1')), 3)
    },
  },
  {
    name: 'a tenant with no relation adopts nothing, and tenants keep apart',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      assert.deepEqual(
        committed(
          await store.adopt(adopt('k1', { kind: 'read', packages: [] }, { tenant: 'bob' })),
        ),
        DENIED,
      )
      assert.equal(read(await store.adoption('bob', 'wsp_1', 'k1')), null)
      committed(await store.adopt(adopt('k1', { kind: 'read', packages: [lamp('v1')] })))
      assert.equal(read(await store.adoption('bob', 'wsp_1', 'k1')), null)
    },
  },
  {
    name: 'a super-admin destroys; a participant does not',
    async run(make) {
      const store = await make()
      committed(await store.register(register()))
      committed(await store.govern(change('g1', 'grant-participation')))
      assert.deepEqual(committed(await store.destroy(destroy('x1', 'bob'))), DENIED)
      committed(await store.govern(change('a1', 'grant-admin')))
      assert.deepEqual(committed(await store.destroy(destroy('x2', 'bob'))), DONE)
      assert.equal(read(await store.state('alice', 'wsp_1')), null)
    },
  },
]
