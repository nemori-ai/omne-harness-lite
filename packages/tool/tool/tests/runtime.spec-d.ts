import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ToolClock,
  ToolCommands,
  ToolProvider,
  ToolReads,
  ToolRuntime,
} from '@omne-harness/tool-contract'
import {
  createToolLedger,
  createToolRuntime,
  type ToolConfiguration,
  type ToolDependencies,
  type ToolLedgerConfiguration,
  type ToolLedgerGuards,
  type ToolLedgerStore,
} from '@omne-harness/tool'

it('createToolRuntime takes the dependencies and the configuration and answers a ToolProvider', () => {
  type P = { subject: string }
  expectTypeOf(createToolRuntime<P, ContentBlock, null>).parameters.toEqualTypeOf<
    [ToolDependencies<P, ContentBlock, null>, ToolConfiguration]
  >()
  expectTypeOf(createToolRuntime<P, ContentBlock, null>).returns.toEqualTypeOf<
    ToolProvider<P, ContentBlock>
  >()
})

it('createToolLedger takes the store, the guards, the clock and the ledger configuration', () => {
  type P = { subject: string }
  expectTypeOf(createToolLedger<P, ContentBlock>).parameters.toEqualTypeOf<
    [
      ToolLedgerStore<ContentBlock>,
      ToolLedgerGuards<P, ContentBlock>,
      ToolClock,
      ToolLedgerConfiguration,
    ]
  >()
  expectTypeOf(createToolLedger<P, ContentBlock>).returns.toEqualTypeOf<
    Readonly<{
      commands: ToolCommands<P, ContentBlock>
      reads: ToolReads<P, ContentBlock>
      admissions: Readonly<{ admit: ToolRuntime<P, ContentBlock>['admit'] }>
    }>
  >()
  // The runtime configuration fits where the ledger configuration is asked for.
  expectTypeOf<ToolConfiguration>().toExtend<ToolLedgerConfiguration>()
})
