import { expectTypeOf, test } from 'vitest'
import type {
  ClientLocalState,
  LocalSnapshot,
  SnapshotToken,
  LocalStateStorageFactory,
  LocalStateStorage,
} from '../src/index.ts'

test('external state consumers retain instance credentials and asynchronous CAS outcomes', () => {
  expectTypeOf<ClientLocalState['read']>().returns.extract<Promise<unknown>>()
  expectTypeOf<LocalSnapshot['token']>().toEqualTypeOf<SnapshotToken>()
  // A structural object is not a credential issued by a state instance.
  // @ts-expect-error snapshot credentials are opaque
  const forged: SnapshotToken = {}
  void forged
  expectTypeOf<ClientLocalState['compareAndReplace']>().parameters.toEqualTypeOf<
    [SnapshotToken, unknown, string]
  >()
  expectTypeOf<LocalStateStorageFactory['open']>().toEqualTypeOf<
    (file: string) => Promise<LocalStateStorage>
  >()
})
