import { expectTypeOf, test } from 'vitest'
import type {
  ContextReader,
  ContextSnapshotReader,
  RuntimeContextOperations,
  ContextSessionInitializer,
  ContextSourceRegistrations,
} from '../src/index.ts'
import type { RuntimeContextService } from '../src/cordis.ts'

test('observation extends the narrow dependency and the Cordis ABC uses the public operation signatures', () => {
  expectTypeOf<ContextSnapshotReader>().toExtend<ContextReader>()
  expectTypeOf<RuntimeContextService['bind']>().toEqualTypeOf<RuntimeContextOperations['bind']>()
  expectTypeOf<RuntimeContextService['registerSource']>().toEqualTypeOf<
    ContextSourceRegistrations['registerSource']
  >()
  expectTypeOf<ContextSessionInitializer>().not.toHaveProperty('bind')
  expectTypeOf<RuntimeContextService>().not.toHaveProperty('initializeContextSession')
  expectTypeOf<ContextReader>().not.toHaveProperty('snapshot')
})
