import { expectTypeOf, it } from 'vitest'
import type { ToolConfiguration, ToolDependencies } from '@omne-harness/tool'
import type { ToolAuthorLimits, ToolClock } from '@omne-harness/tool-contract'

it('configuration extends the author limits with the runtime budgets', () => {
  expectTypeOf<ToolConfiguration>().toExtend<ToolAuthorLimits>()
  expectTypeOf<ToolConfiguration['resultPageBytes']>().toEqualTypeOf<number>()
})

it('dependencies name each port the runtime consumes', () => {
  expectTypeOf<ToolDependencies<string, never, unknown>['clock']>().toEqualTypeOf<ToolClock>()
})
