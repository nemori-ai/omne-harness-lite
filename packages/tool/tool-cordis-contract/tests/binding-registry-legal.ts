// The providers of the G7 suite that the contract allows. Each is built at the boundary of the
// binding registry: it wraps the registry and the handles the fixture defines itself, and never
// takes a control of a double.
import {
  memoryToolBindingRegistryFixture,
  type ToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'

type Fixture = ToolBindingRegistryFixture<string>

/** The conforming double with every handle. */
export const memory = (): Fixture => memoryToolBindingRegistryFixture()

/**
 * A registry whose fixture offers no fiber controls (G7 allows a provider that cannot name the
 * caller fiber in tests): the cases that need a fiber report not applicable, the others pass.
 */
export function withoutFibers(): Fixture {
  const { asFiber: _asFiber, endFiber: _endFiber, ...bare } = memoryToolBindingRegistryFixture()
  return bare
}

/** The cases of `withoutFibers` that report not applicable, by the handle they name. */
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
