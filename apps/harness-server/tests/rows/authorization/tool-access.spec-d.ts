import { expectTypeOf, test } from 'vitest'
import type { ToolAccessGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from '@omne-harness/tool-host-local'
import { createToolAccessGuard } from '../../../src/rows/authorization/index.ts'

test('one qualification object satisfies both Tool consumers', () => {
  expectTypeOf<ReturnType<typeof createToolAccessGuard>>().toExtend<ToolAccessGuard<unknown>>()
  expectTypeOf<ReturnType<typeof createToolAccessGuard>>().toExtend<
    StartCoordinatorAccess<unknown>
  >()
})
