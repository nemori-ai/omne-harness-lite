import {
  memoryToolBindingRegistryFixture,
  type ToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'

type Fixture = ToolBindingRegistryFixture<string>

export const memory = (): Fixture => memoryToolBindingRegistryFixture()

export function withoutFibers(): Fixture {
  const { asFiber: _asFiber, endFiber: _endFiber, ...bare } = memoryToolBindingRegistryFixture()
  return bare
}

export const WITHOUT_FIBER_CASES: Readonly<Record<string, string>> = {
  'the same fiber registering the same key with the same digest is recognised': 'asFiber',
  'another digest or another fiber on a held key is a conflict and the original stands': 'asFiber',
  'a successor registers once the original released, with a new token and a later ordinal':
    'asFiber',
  'a late release of the original removes nothing and leaves the successor': 'asFiber',
  'two fibers racing for one key: the first in the ordering domain wins, the other conflicts':
    'asFiber',
  'the end of a fiber withdraws its contribution once': 'endFiber',
}
