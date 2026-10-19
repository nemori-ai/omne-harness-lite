import { expectTypeOf, it } from 'vitest'
import type {
  ToolConfiguration,
  ToolDependencies,
  ToolLedgerAdmissions,
  ToolLedgerQueues,
} from '@omne-harness/tool'
import type { ToolAuthorLimits, ToolClock } from '@omne-harness/tool-contract'

it('configuration extends the author limits with the runtime budgets', () => {
  expectTypeOf<ToolConfiguration>().toExtend<ToolAuthorLimits>()
  expectTypeOf<ToolConfiguration['resultPageBytes']>().toEqualTypeOf<number>()
  expectTypeOf<ToolConfiguration['ledgerCommitAttempts']>().toEqualTypeOf<number>()
  expectTypeOf<ToolConfiguration['driverStepsPerRun']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<ToolConfiguration['driverRetryDelayMs']>().toEqualTypeOf<number | undefined>()
})

it('dependencies name each port the runtime consumes', () => {
  expectTypeOf<ToolDependencies<string, never, unknown>['clock']>().toEqualTypeOf<ToolClock>()
  expectTypeOf<ToolDependencies<string, never, unknown>['admissions']>().toEqualTypeOf<
    ToolLedgerAdmissions<string>
  >()
  expectTypeOf<ToolDependencies<string, never, unknown>['queues']>().toEqualTypeOf<
    ToolLedgerQueues<string>
  >()
})
