// Compile-time shape of the new address (#1233 spec C2, C3): steps 1 to 5 are one synchronous
// function, and `access` is given whole or not at all.
import { expectTypeOf, test } from 'vitest'
import { admit } from '../src/pipeline/pipeline.ts'
import { createServerEntry, type ServerEntryAccess } from '../src/index.ts'
import { createAccessRegistry } from '../src/index.ts'
import { testIdentity } from './support/pipeline-kit.ts'

test('steps 1 to 5 return no promise: looking up and entering cannot be split by a take-down', () => {
  type Admitted = ReturnType<typeof admit>
  expectTypeOf<Admitted extends PromiseLike<unknown> ? true : false>().toEqualTypeOf<false>()
})

test('access is all three or none', () => {
  const registry = createAccessRegistry()
  const identity = testIdentity().port
  expectTypeOf({ registry, identity, graceMs: 5000 }).toExtend<ServerEntryAccess>()
  // @ts-expect-error the identity port and the grace are missing
  const partial: ServerEntryAccess = { registry }
  void partial
  type Input = Parameters<typeof createServerEntry>[0]
  expectTypeOf<undefined>().toExtend<Input['access']>()
})
