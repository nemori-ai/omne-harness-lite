import assert from 'node:assert/strict'
import type { InstanceId, Json, TypeName } from '@omne-harness/workspace-contract'
import type { WorkspaceStore } from '../store.ts'
import type { AssociateCommand } from '../transactions/instances.ts'
import type { RegisterCommand } from '../transactions/register.ts'

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
      assert.deepEqual(committed(await store.dissociate({ ...command, operation: 'd2', digest: 'd-d2' })), {
        kind: 'done',
        value: null,
        changed: false,
      })
      assert.equal(read(await store.state('alice', 'wsp_1'))?.workspace.revision, 2)
    },
  },
]
