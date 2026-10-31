import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { FixedToolRequest, Reply, ToolState } from '@omne-harness/tool-contract'
import type {
  Mutation,
  ToolClock,
  ToolCommands,
  ToolProvider,
  ToolReads,
  ToolContentReader,
} from '@omne-harness/tool-contract/provider'
import {
  createToolLedger,
  createToolRuntime,
  type ToolConfiguration,
  type ToolDependencies,
  type ToolLedgerConfiguration,
  type ToolLedgerGuards,
  type ToolLedgerQueues,
  type ToolLedgerFacts,
  type ToolLedgerStore,
  type ToolLedgerPorts,
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

it('createToolRuntime dependencies carry no factory-level instance identity', () => {
  type Dependencies = ToolDependencies<{ subject: string }, ContentBlock, null>
  // @ts-expect-error TS2339: the runtime factory takes no instance identity; the host passes it to the driver.
  expectTypeOf<Dependencies['instance']>().toEqualTypeOf<never>()
  // @ts-expect-error Ordinary identity allocation belongs to source.resolve.
  expectTypeOf<Dependencies['invocationIdentities']>().toBeAny()
  expectTypeOf<Dependencies['operationIdentities']>().not.toBeNever()
  expectTypeOf<Dependencies['sourceIssuer']>().not.toBeNever()
})

it('createToolLedger takes the store, the guards, the clock and the ledger configuration', () => {
  type P = { subject: string }
  expectTypeOf(createToolLedger<P, ContentBlock>).parameters.toEqualTypeOf<
    [
      ToolLedgerStore<ContentBlock>,
      ToolLedgerGuards<P, ContentBlock>,
      ToolClock,
      ToolLedgerConfiguration,
      ToolLedgerPorts<P>,
    ]
  >()
  expectTypeOf(createToolLedger<P, ContentBlock>).returns.toEqualTypeOf<
    Readonly<{
      commands: ToolCommands<P, ContentBlock>
      reads: ToolReads<P, ContentBlock>
      admissions: Readonly<{
        admit(
          input: Mutation<P> & Readonly<{ request: FixedToolRequest }>,
        ): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
      }>
      queues: ToolLedgerQueues<P>
      facts: ToolLedgerFacts<P, ContentBlock>
    }>
  >()
  // The runtime configuration fits where the ledger configuration is asked for.
  expectTypeOf<ToolConfiguration>().toExtend<ToolLedgerConfiguration>()
})

it('ledger content provider is explicit and may be disabled with null', () => {
  expectTypeOf<ToolLedgerPorts<string>['content']>().toEqualTypeOf<Pick<
    ToolContentReader<string>,
    'read'
  > | null>()
})
