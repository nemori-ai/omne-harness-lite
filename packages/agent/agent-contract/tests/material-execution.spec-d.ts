import { expectTypeOf, it } from 'vitest'
import type {
  AgentExecutionId,
  AgentMaterials,
  DurableEvidence,
  MaterialDescription,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'

type Port = AgentMaterials<string, ContentBlock>
type Input = Parameters<Port['preserve']>[0]

it('requires the execution of every preserve: the legacy input without it is gone', () => {
  expectTypeOf<Input['execution']>().toEqualTypeOf<AgentExecutionId>()
  expectTypeOf<Omit<Input, 'execution'>>().not.toExtend<Input>()
})

it('describes a material by its source alone, without its content', () => {
  expectTypeOf<Parameters<Port['describe']>[0]['source']>().toEqualTypeOf<DurableEvidence>()
  expectTypeOf<MaterialDescription>().toEqualTypeOf<
    Readonly<{ digest: string; size: number; kind: 'model' | 'tool' | 'facts' }>
  >()
})
