import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  type ManagedResource,
  type RecoveryAuthority,
  type ResourceRecovery,
} from '@omne-harness/execution-environment-contract'
import { registryWith, resource, scope, scriptedProvider } from './doubles.ts'

function recoveringProvider(name: string, answers: Readonly<Record<string, ResourceRecovery>>) {
  const recovered: string[] = []
  const provider = scriptedProvider({
    name,
    recoverable: {
      list: async () => ({
        kind: 'listed',
        resources: Object.keys(answers).map(key => resource(key, name)),
      }),
      recover: async (managed: ManagedResource) => {
        recovered.push(managed.key)
        const answer = answers[managed.key]
        if (answer === undefined) throw new Error('unknown resource')
        return answer
      },
    },
  })
  return { provider, recovered }
}

const stopped: ResourceRecovery = { status: 'confirmedStopped', evidence: null }

it('stops the named resources only: another resource of the same scope and provider is not asked', async () => {
  const sorter = recoveringProvider('sorter', { named: stopped, bystander: stopped })
  const registry = registryWith([sorter.provider])
  expect(
    await registry.recoverResources(scope('scope-1'), createRecoveryAccess(), [
      resource('named', 'sorter'),
    ]),
  ).toEqual({
    kind: 'recovered',
    scope: scope('scope-1'),
    stopped: [resource('named', 'sorter')],
    pending: [],
    unsupported: [],
  })
  expect(sorter.recovered).toEqual(['named'])
  expect(sorter.provider.calls.list).toBe(0)
  expect(sorter.provider.calls.listAcquisitions).toBe(0)
})

it('sorts each named resource by the answer of its provider: stopped, pending, unsupported', async () => {
  const sorter = recoveringProvider('sorter', {
    stops: stopped,
    waits: { status: 'pending', evidence: null },
    refuses: { status: 'unsupported', evidence: null },
  })
  const plain = scriptedProvider({ name: 'plain' })
  const registry = registryWith([sorter.provider, plain])
  expect(
    await registry.recoverResources(scope('scope-1'), createRecoveryAccess(), [
      resource('stops', 'sorter'),
      resource('waits', 'sorter'),
      resource('refuses', 'sorter'),
      resource('throws', 'sorter'),
      resource('p1', 'plain'),
      resource('g1', 'gone'),
    ]),
  ).toEqual({
    kind: 'recovered',
    scope: scope('scope-1'),
    stopped: [resource('stops', 'sorter')],
    pending: [resource('waits', 'sorter'), resource('throws', 'sorter')],
    unsupported: [resource('refuses', 'sorter'), resource('p1', 'plain'), resource('g1', 'gone')],
  })
})

it('refuses with the authority answer, or unknown when the authority throws, and stops nothing', async () => {
  const answers: ('notAuthorized' | 'unavailable' | Error)[] = [
    'notAuthorized',
    'unavailable',
    new Error('authority down'),
  ]
  const asked: unknown[] = []
  const authority: RecoveryAuthority = {
    async authorizeRecovery(...args) {
      asked.push(args)
      const answer = answers.shift()
      if (answer instanceof Error) throw answer
      return answer ?? 'unavailable'
    },
  }
  const sorter = recoveringProvider('sorter', { named: stopped })
  const registry = registryWith([sorter.provider], authority)
  const access = createRecoveryAccess()
  const named = [resource('named', 'sorter')]
  expect(await registry.recoverResources(scope('scope-1'), access, named)).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await registry.recoverResources(scope('scope-1'), access, named)).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await registry.recoverResources(scope('scope-1'), access, named)).toEqual({
    kind: 'unknown',
    cause: 'authority',
  })
  expect(asked).toEqual([
    [access, scope('scope-1'), named],
    [access, scope('scope-1'), named],
    [access, scope('scope-1'), named],
  ])
  expect(sorter.recovered).toEqual([])
})

it('refuses a list that is no array before the authority is asked', async () => {
  let asked = 0
  const authority: RecoveryAuthority = {
    async authorizeRecovery() {
      asked += 1
      return 'authorized'
    },
  }
  const registry = registryWith([], authority)
  expect(
    await registry.recoverResources(scope('scope-1'), createRecoveryAccess(), null as never),
  ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
  expect(asked).toBe(0)
})
