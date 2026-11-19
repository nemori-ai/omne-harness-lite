import assert from 'node:assert/strict'
import type { Access } from '@omne-harness/legal-identity'
import {
  operationId,
  type InstanceId,
  type ManagementType,
  type OperationId,
  type RegisteredWorkspace,
  type TypeName,
  type WorkspaceCatalog,
  type WorkspaceGovernance,
  type WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import { createCatalog } from '../catalog.ts'
import { createGovernance } from '../governance.ts'
import { createInstances } from '../instances.ts'
import { createManagementTypes } from '../types.ts'
import {
  fakeAccess,
  fakeAuthority,
  fakeMinting,
  fakeWorkspaceId,
  type FakeAuthority,
} from './fakes.ts'
import { createMemoryStore, type MemoryStore } from './memory-store.ts'

/**
 * What a management type has to supply to be put through the rules every type obeys. The cases
 * below never name a type: they ask the harness for addresses and for changes to the world.
 */
export type TypeHarness = Readonly<{
  /** Every type to contribute: the subject and the types it extends. */
  types: readonly ManagementType[]
  subject: TypeName
  /** A new address the subject recognises. Each call is a different resource. */
  fresh(): Promise<string>
  /** Another materialisation of the resource at this address; null when the type knows no second one. */
  copy(of: string): Promise<string | null>
  /** Addresses no type may take, one for each way an address can be illegal. */
  illegal(): Promise<readonly string[]>
  /** A legal address the subject does not recognise; null when it recognises every legal address. */
  unrecognised(): Promise<string | null>
  /** Makes the resource at this address unreachable and returns the way to put it back. */
  remove(address: string): Promise<() => Promise<void>>
  /** Puts another resource of the same name where this one was. */
  replace(address: string): Promise<void>
  /** Makes the version unreadable while the resource stays; false when the type has no version to lose. */
  blind(address: string): Promise<boolean>
  /** Moves the resource to a new version; false when the type has no versions. */
  advance(address: string): Promise<boolean>
  /** The root directory and load basis a verification of this address must give now. */
  expected(address: string): Promise<Readonly<{ directory: string; basis: string }>>
  /** A digest of everything at the address, to show that nothing was written. */
  digest(address: string): Promise<string>
}>

export type TypeConformanceCase = Readonly<{
  name: string
  run(harness: TypeHarness): Promise<void>
}>

type World = Readonly<{
  harness: TypeHarness
  authority: FakeAuthority
  store: MemoryStore
  governance: WorkspaceGovernance<string>
  instances: WorkspaceInstances<string>
  catalog: WorkspaceCatalog<string>
  operation(): OperationId
  registered(caller: Access<string>, address: string): Promise<RegisteredWorkspace>
}>

function worldOf(harness: TypeHarness): World {
  const authority = fakeAuthority()
  const store = createMemoryStore()
  const types = createManagementTypes()
  for (const type of harness.types) types.contribute(type)
  const deps = { authority, store, types, minting: fakeMinting(), node: 'node-1' }
  const governance = createGovernance(deps)
  let operations = 0
  const operation = () => operationId(`op-${++operations}`) as OperationId
  return {
    harness,
    authority,
    store,
    governance,
    instances: createInstances(deps),
    catalog: createCatalog(deps),
    operation,
    async registered(caller, address) {
      const answer = await governance.register(caller, { operation: operation(), address })
      assert.equal(answer.kind, 'done', `register ${address}: ${JSON.stringify(answer)}`)
      return (answer as Extract<typeof answer, { kind: 'done' }>).value
    },
  }
}

const OWNER = fakeAccess(1)
const OTHER = fakeAccess(2)

const scenario = (name: string, run: (world: World) => Promise<void>): TypeConformanceCase => ({
  name,
  run: harness => run(worldOf(harness)),
})

/** The cells of the two tables every management type answers the same way: instances by type, and verifying an attachment. */
export const typeConformanceCases: readonly TypeConformanceCase[] = [
  scenario(
    'instances: an illegal address is not performed, with a reason, named type or not',
    async w => {
      const addresses = await w.harness.illegal()
      assert.ok(addresses.length > 0, 'the harness names no illegal address')
      for (const address of addresses)
        for (const type of [undefined, w.harness.subject]) {
          const answer = await w.governance.register(OWNER, {
            operation: w.operation(),
            address,
            ...(type === undefined ? {} : { type }),
          })
          assert.equal(answer.kind, 'not-performed', `${address}: ${JSON.stringify(answer)}`)
        }
      assert.deepEqual(await w.catalog.list(OWNER), { kind: 'read', value: [] })
    },
  ),

  scenario(
    'instances: a position another active instance holds is refused without saying whose',
    async w => {
      const address = await w.harness.fresh()
      await w.registered(OWNER, address)
      for (const caller of [OWNER, OTHER])
        assert.deepEqual(
          await w.governance.register(caller, { operation: w.operation(), address }),
          { kind: 'not-performed', reason: 'occupied' },
        )
    },
  ),

  scenario(
    'instances: a legal address the named type does not recognise is not performed',
    async w => {
      const address = await w.harness.unrecognised()
      if (address === null) return // Not applicable: this type recognises every legal address.
      const answer = await w.governance.register(OWNER, {
        operation: w.operation(),
        address,
        type: w.harness.subject,
      })
      assert.equal(answer.kind, 'not-performed')
    },
  ),

  scenario(
    'instances: the first instance is admitted and the most specific type takes it',
    async w => {
      const address = await w.harness.fresh()
      const made = await w.registered(OWNER, address)
      assert.equal(made.type, w.harness.subject)
      const view = await w.catalog.describe(OWNER, made.workspace)
      assert.equal(view.kind, 'read')
      if (view.kind !== 'read') return
      assert.equal(view.value.type, w.harness.subject)
      assert.equal(view.value.standing, 'owner')
      assert.deepEqual(
        view.value.instances.map(instance => [instance.instance, instance.address]),
        [[made.instance, address]],
      )
    },
  ),

  scenario(
    'instances: a second one is admitted only when the type says it is the same resource',
    async w => {
      const first = await w.harness.fresh()
      const made = await w.registered(OWNER, first)
      const copy = await w.harness.copy(first)
      const second = copy ?? (await w.harness.fresh())
      const answer = await w.instances.associate(OWNER, {
        operation: w.operation(),
        workspace: made.workspace,
        address: second,
      })
      assert.equal(answer.kind, copy === null ? 'not-performed' : 'done', JSON.stringify(answer))
      const view = await w.catalog.describe(OWNER, made.workspace)
      assert.equal(view.kind === 'read' && view.value.instances.length, copy === null ? 1 : 2)
    },
  ),

  scenario('instances: a materialisation of another resource is never admitted', async w => {
    const made = await w.registered(OWNER, await w.harness.fresh())
    const answer = await w.instances.associate(OWNER, {
      operation: w.operation(),
      workspace: made.workspace,
      address: await w.harness.fresh(),
    })
    assert.equal(answer.kind, 'not-performed', JSON.stringify(answer))
  }),

  scenario(
    'instances: a new materialisation is not an instance until someone associates it',
    async w => {
      const first = await w.harness.fresh()
      const made = await w.registered(OWNER, first)
      await w.harness.copy(first)
      const view = await w.catalog.describe(OWNER, made.workspace)
      assert.equal(view.kind === 'read' && view.value.instances.length, 1)
    },
  ),

  scenario(
    'instances: an unknown type name is not performed; a named type is the type',
    async w => {
      const address = await w.harness.fresh()
      assert.deepEqual(
        await w.governance.register(OWNER, {
          operation: w.operation(),
          address,
          type: 'no-such-type' as TypeName,
        }),
        { kind: 'not-performed', reason: 'type-unknown' },
      )
      const answer = await w.governance.register(OWNER, {
        operation: w.operation(),
        address,
        type: w.harness.subject,
      })
      assert.equal(answer.kind === 'done' && answer.value.type, w.harness.subject)
    },
  ),

  scenario('instances: a dissociated instance frees its position', async w => {
    const address = await w.harness.fresh()
    const made = await w.registered(OWNER, address)
    const dissociated = await w.instances.dissociate(OWNER, {
      operation: w.operation(),
      workspace: made.workspace,
      instance: made.instance,
    })
    assert.deepEqual(dissociated, { kind: 'done', value: null, changed: true })
    const again = await w.registered(OTHER, address)
    assert.notDeepEqual(again.workspace, made.workspace)
  }),

  scenario(
    'instances: registering, verifying, associating and dissociating write nothing',
    async w => {
      const address = await w.harness.fresh()
      const before = await w.harness.digest(address)
      const made = await w.registered(OWNER, address)
      await w.instances.verify(OWNER, made)
      await w.catalog.describe(OWNER, made.workspace)
      assert.equal(await w.harness.digest(address), before)

      // Making a copy is the harness's own change to the world; the digests are taken after it.
      const copy = await w.harness.copy(address)
      const digests = async () =>
        Promise.all([address, ...(copy === null ? [] : [copy])].map(w.harness.digest))
      const withCopy = await digests()
      if (copy !== null)
        await w.instances.associate(OWNER, {
          operation: w.operation(),
          workspace: made.workspace,
          address: copy,
        })
      await w.instances.dissociate(OWNER, {
        operation: w.operation(),
        workspace: made.workspace,
        instance: made.instance,
      })
      assert.deepEqual(await digests(), withCopy)
    },
  ),

  scenario('verifying: all holds answers the root, the attachment and the evidence', async w => {
    const address = await w.harness.fresh()
    const made = await w.registered(OWNER, address)
    const expected = await w.harness.expected(address)
    const answer = await w.instances.verify(OWNER, made)
    assert.equal(answer.kind, 'attachable', JSON.stringify(answer))
    if (answer.kind !== 'attachable') return
    assert.equal(answer.directory, expected.directory)
    assert.deepEqual(answer.attachment, { instance: made.instance, basis: expected.basis })
    assert.equal(answer.evidence.owner, 'workspace')
    assert.match(answer.evidence.digest, /^[0-9a-f]{64}$/)
    assert.deepEqual(await w.instances.verify(OWNER, made), answer)
  }),

  scenario(
    'verifying: a caller who is not a member, or is not admitted, is not permitted',
    async w => {
      const made = await w.registered(OWNER, await w.harness.fresh())
      w.authority.standingIs(() => 'not-member')
      assert.deepEqual(await w.instances.verify(OWNER, made), { kind: 'not-permitted' })
      w.authority.standingIs(() => 'member')
      w.authority.admits(() => 'denied')
      assert.deepEqual(await w.instances.verify(OWNER, made), { kind: 'not-permitted' })
    },
  ),

  scenario('verifying: a basis that cannot be read is unavailable, never yes or no', async w => {
    const made = await w.registered(OWNER, await w.harness.fresh())
    for (const answer of ['unavailable', 'throw'] as const) {
      w.authority.standingIs(() => answer)
      assert.equal((await w.instances.verify(OWNER, made)).kind, 'unavailable')
      w.authority.standingIs(() => 'member')
      w.authority.admits(() => answer)
      assert.equal((await w.instances.verify(OWNER, made)).kind, 'unavailable')
      w.authority.admits(() => 'allowed')
    }
    w.store.fail('unreadable')
    assert.equal((await w.instances.verify(OWNER, made)).kind, 'unavailable')
  }),

  scenario('verifying: no relation and no such workspace answer the same', async w => {
    const made = await w.registered(OWNER, await w.harness.fresh())
    const stranger = await w.instances.verify(OTHER, made)
    const missing = await w.instances.verify(OTHER, {
      workspace: fakeWorkspaceId(999),
      instance: made.instance,
    })
    assert.deepEqual(stranger, { kind: 'not-permitted' })
    assert.deepEqual(missing, stranger)
    assert.deepEqual(await w.catalog.describe(OTHER, made.workspace), stranger)
    assert.deepEqual(await w.catalog.list(OTHER), { kind: 'read', value: [] })
  }),

  scenario(
    'verifying: an instance of another workspace, or a dissociated one, is not permitted',
    async w => {
      const one = await w.registered(OWNER, await w.harness.fresh())
      const two = await w.registered(OWNER, await w.harness.fresh())
      assert.deepEqual(
        await w.instances.verify(OWNER, { workspace: one.workspace, instance: two.instance }),
        { kind: 'not-permitted' },
      )
      await w.instances.dissociate(OWNER, {
        operation: w.operation(),
        workspace: one.workspace,
        instance: one.instance,
      })
      assert.deepEqual(await w.instances.verify(OWNER, one), { kind: 'not-permitted' })
      assert.deepEqual(
        await w.instances.verify(OWNER, {
          workspace: one.workspace,
          instance: 'wsi_zzzzzzzzzzzzzzzzzzzzzzzzzz' as InstanceId,
        }),
        { kind: 'not-permitted' },
      )
    },
  ),

  scenario(
    'verifying: an unreachable resource is an unavailable instance until it is back',
    async w => {
      const address = await w.harness.fresh()
      const made = await w.registered(OWNER, address)
      const restore = await w.harness.remove(address)
      const gone = await w.instances.verify(OWNER, made)
      assert.equal(gone.kind, 'instance-unavailable', JSON.stringify(gone))
      const view = await w.catalog.describe(OWNER, made.workspace)
      assert.equal(
        view.kind === 'read' && view.value.instances[0]?.availability.kind,
        'unavailable',
      )
      await restore()
      assert.equal((await w.instances.verify(OWNER, made)).kind, 'attachable')
    },
  ),

  scenario('verifying: another resource under the same name is not followed', async w => {
    const address = await w.harness.fresh()
    const made = await w.registered(OWNER, address)
    await w.harness.replace(address)
    assert.equal((await w.instances.verify(OWNER, made)).kind, 'instance-unavailable')
  }),

  scenario('verifying: a version that cannot be read is an unavailable instance', async w => {
    const address = await w.harness.fresh()
    const made = await w.registered(OWNER, address)
    if (!(await w.harness.blind(address))) return // Not applicable: this type has no version to lose.
    assert.equal((await w.instances.verify(OWNER, made)).kind, 'instance-unavailable')
  }),

  scenario('verifying: a new version is a new basis, not an illegal attachment', async w => {
    const address = await w.harness.fresh()
    const made = await w.registered(OWNER, address)
    const first = await w.instances.verify(OWNER, made)
    if (!(await w.harness.advance(address))) return // Not applicable: this type has no versions.
    const second = await w.instances.verify(OWNER, made)
    assert.equal(second.kind, 'attachable')
    if (first.kind !== 'attachable' || second.kind !== 'attachable') return
    assert.notEqual(second.attachment.basis, first.attachment.basis)
    assert.equal(second.attachment.basis, (await w.harness.expected(address)).basis)
  }),
]
