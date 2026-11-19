import {
  operationId,
  typeName,
  type OperationId,
  type TypeName,
} from '@omne-harness/workspace-contract'
import {
  createCatalog,
  createGovernance,
  createInstances,
  createManagementTypes,
} from '@omne-harness/workspace'
import {
  createMemoryStore,
  fakeAuthority,
  fakeMinting,
  fakeWorld,
  type TypeHarness,
} from '@omne-harness/workspace/testing'

export const op = (text: string) => operationId(text) as OperationId
export const named = (text: string) => typeName(text) as TypeName

/** The services over a memory store and a fake world with a base type and a type that extends it. */
export function world() {
  const things = fakeWorld()
  const authority = fakeAuthority()
  const store = createMemoryStore()
  const types = createManagementTypes()
  types.contribute(things.type('plain'))
  const versioned = types.contribute(things.type('versioned', { extends: 'plain', copies: true }))
  const deps = { authority, store, types, minting: fakeMinting(), node: 'node-1' }
  return {
    things,
    authority,
    store,
    /** Withdraws the type that extends the base one, as an assembly that unloads it would. */
    withdrawVersioned: () => versioned.release(),
    governance: createGovernance(deps),
    instances: createInstances(deps),
    catalog: createCatalog(deps),
  }
}

/** A harness over the fake world, so the conformance cases can be run without anything physical. */
export function fakeHarness(options: {
  copies: boolean
  broken?: 'admits-all' | 'follows'
}): TypeHarness {
  const things = fakeWorld()
  const subject = things.type('subject', { extends: 'plain', copies: options.copies })
  const broken = options.broken
  const type =
    broken === undefined
      ? subject
      : {
          ...subject,
          admits: broken === 'admits-all' ? () => ({ kind: 'admitted' }) as const : subject.admits,
          inspect:
            broken === 'follows'
              ? async (material: unknown) => {
                  const { address } = material as { address: string }
                  const thing = things.things.get(address)!
                  return subject.inspect({ ...(material as object), identity: thing.identity })
                }
              : subject.inspect,
        }
  let count = 0
  const thing = (address: string) => things.things.get(address)!
  return {
    types: [things.type('plain'), type],
    subject: subject.name,
    async fresh() {
      const address = `/things/${++count}`
      things.put(address, { kinds: ['plain', 'subject'] })
      return address
    },
    async copy(of) {
      if (!options.copies) return null
      const address = `/things/${++count}`
      things.put(address, { kinds: ['plain', 'subject'], resource: thing(of).resource })
      return address
    },
    illegal: async () => ['/nowhere'],
    async unrecognised() {
      const address = `/things/${++count}`
      things.put(address, { kinds: ['plain'] })
      return address
    },
    async remove(address) {
      thing(address).state = 'gone'
      return async () => {
        thing(address).state = 'present'
      }
    },
    async replace(address) {
      things.put(address, { kinds: ['plain', 'subject'] })
    },
    async blind(address) {
      thing(address).state = 'versionless'
      return true
    },
    async advance(address) {
      thing(address).version = 'v2'
      return true
    },
    expected: async address => ({ directory: address, basis: thing(address).version }),
    digest: async address => JSON.stringify(thing(address)),
  }
}
