import { expectTypeOf, test } from 'vitest'
import { admit } from '../src/pipeline/pipeline.ts'
import { createServerEntry, type ServerEntryAccess } from '../src/index.ts'
import { createAccessRegistry } from '../src/index.ts'
import { testIdentity } from './support/pipeline-kit.ts'

test('steps 1 to 5 return no promise: looking up and entering cannot be split by a take-down', () => {
  type Admitted = ReturnType<typeof admit>
  expectTypeOf<Admitted extends PromiseLike<unknown> ? true : false>().toEqualTypeOf<false>()
})

test('access is given whole or not at all', () => {
  const registry = createAccessRegistry()
  const identity = testIdentity().port
  expectTypeOf({
    registry,
    identity,
    graceMs: 5000,
    frameQueueBytes: 1 << 20,
    availabilityBacklog: 64,
  }).toExtend<ServerEntryAccess>()
  // @ts-expect-error the frame queue bound is required (#1249 spec 已定 6)
  const noBound: ServerEntryAccess = { registry, identity, graceMs: 5000, availabilityBacklog: 64 }
  void noBound
  // @ts-expect-error the availability backlog is required (#1249 spec 已定 9)
  const noBacklog: ServerEntryAccess = {
    registry,
    identity,
    graceMs: 5000,
    frameQueueBytes: 1 << 20,
  }
  void noBacklog
  const pipelineSide: ServerEntryAccess = {
    // @ts-expect-error the pipeline's side of the registry cannot mount `access/v1` (spec 已定 8)
    registry: { enter: registry.enter, subscribe: registry.subscribe },
    identity,
    graceMs: 5000,
    frameQueueBytes: 1 << 20,
    availabilityBacklog: 64,
  }
  void pipelineSide
  // @ts-expect-error the identity port and the grace are missing
  const partial: ServerEntryAccess = { registry }
  void partial
  type Input = Parameters<typeof createServerEntry>[0]
  expectTypeOf<undefined>().toExtend<Input['access']>()
})
