import { expectTypeOf, it } from 'vitest'
import type { AgentExecutionId, AgentMaterials } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'

type Input = Parameters<AgentMaterials<string, ContentBlock>['preserve']>[0]

it('accepts an explicit execution while retaining the legacy preserve input', () => {
  expectTypeOf<Input['execution']>().toEqualTypeOf<AgentExecutionId | undefined>()
  expectTypeOf<Omit<Input, 'execution'>>().toExtend<Input>()
  expectTypeOf<Input & { execution: AgentExecutionId }>().toExtend<Input>()
})
