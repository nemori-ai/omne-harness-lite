import { expectTypeOf, test } from 'vitest'
import type {
  AssemblyLifetimePort,
  AssemblyCloseReport,
  LifetimeRegistration,
  OwnedWork,
} from '../src/index.ts'
import { createAssemblyLifetime } from '../src/index.ts'
import { AssemblyLifetimeService, startAssemblyWork } from '../src/cordis.ts'
import type { Context } from '@deepseek-ai/cordis'

test('the Service exposes the row protocol without assembly control', () => {
  expectTypeOf<AssemblyLifetimeService>().toExtend<AssemblyLifetimePort>()
  expectTypeOf<AssemblyLifetimeService['register']>().toEqualTypeOf<
    (work: OwnedWork) => LifetimeRegistration
  >()
  expectTypeOf(AssemblyLifetimeService.provide).toEqualTypeOf<'assemblyLifetime'>()
  const lifetime = createAssemblyLifetime(['row'], () => {})
  expectTypeOf(lifetime.close()).toEqualTypeOf<Promise<AssemblyCloseReport>>()
  expectTypeOf(lifetime.port('row')).not.toHaveProperty('close')
  expectTypeOf(lifetime.port('row')).not.toHaveProperty('closed')
  expectTypeOf(startAssemblyWork).toEqualTypeOf<
    (ctx: Context, setup: () => Promise<void>, close: () => Promise<void>) => void
  >()
})
