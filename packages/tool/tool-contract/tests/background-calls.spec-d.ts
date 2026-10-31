import { expectTypeOf, test } from 'vitest'
import type { BlockValue, ProducerRegistration } from '@omne-harness/runtime-context-contract'
import { backgroundCallsBlock, type ToolBackgroundCallsValue } from '@omne-harness/tool-contract'
import { projectToolBackgroundCalls } from '@omne-harness/tool-contract/provider'
import { complete, input } from './background-calls-fixture.ts'

test('RC consumers receive the Tool-owned value through ContextBlocks', () => {
  expectTypeOf<BlockValue<'tool.background-calls'>>().toEqualTypeOf<ToolBackgroundCallsValue>()
  const registration: ProducerRegistration<'tool.background-calls', string> = {
    key: 'tool.background-calls',
    tenant: input.tenant,
    producer: { producer: 'fixture' },
    declaration: backgroundCallsBlock,
    scoped: false,
    async supply(input) {
      return projectToolBackgroundCalls({ input, source: complete() })
    },
  }
  expectTypeOf(registration.key).toEqualTypeOf<'tool.background-calls'>()
  // @ts-expect-error The declaration does not permit a stateful step update.
  expectTypeOf(backgroundCallsBlock.reduce).toBeNever()
})
