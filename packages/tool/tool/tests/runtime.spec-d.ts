import type { ToolBodyCustody } from '@omne-harness/tool-contract/provider'
import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  FixedToolRequest,
  Reply,
  ToolState,
  ToolResult,
  ToolResultVersion,
} from '@omne-harness/tool-contract'
import type {
  Mutation,
  CallAccess,
  ToolClock,
  ToolFinalCustody,
  ToolOutputCustody,
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
  type ResultRecord,
  type ToolLedgerPorts,
  type ToolLedgerControls,
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
      ToolLedgerStore,
      ToolLedgerGuards<P, ContentBlock>,
      ToolClock,
      ToolLedgerConfiguration,
      ToolLedgerPorts<P>,
    ]
  >()
  expectTypeOf(createToolLedger<P, ContentBlock>).returns.toEqualTypeOf<
    Readonly<{
      maintenance: Readonly<{
        reclaim(
          input: CallAccess<P>,
        ): Reply<Readonly<{ kind: 'idle' | 'blocked' | 'pending' | 'deleted' }>>
        expire(input: CallAccess<P>): Reply<
          Readonly<{
            expiredBodies: number
            expiredLeases: number
            cleanupPending: boolean
          }>
        >
      }>
      delivery: Readonly<{
        read(
          input: CallAccess<P> & Readonly<{ result: ToolResultVersion }>,
        ): Reply<ToolResult<ContentBlock>>
      }>
      bodyCustody: ToolBodyCustody<P>
      rawCustody: Pick<ToolOutputCustody<P>, 'preserve' | 'inspect'>
      finalCustody: ToolFinalCustody<P, ContentBlock>
      controls: ToolLedgerControls<P>
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

it('the result ledger accepts channel references and cannot store a complete ToolResult', () => {
  expectTypeOf<ResultRecord['value']['kind']>().toEqualTypeOf<'channels'>()
  expectTypeOf<ToolResult<ContentBlock>>().not.toExtend<ResultRecord['value']>()
})
