import { expectTypeOf, it } from 'vitest'
import type { Outcome } from '@omne-harness/kernel-basis'
import type {
  IndependentToolScopeInput,
  ToolExecutionScope,
  ToolExecutor,
} from '@omne-harness/tool-contract'
import {
  createIndependentToolScope,
  executeTool,
  type ExecuteToolFailure,
} from '@omne-harness/tool'

it('createIndependentToolScope takes the scope input and answers a scope or a field rejection', () => {
  expectTypeOf(createIndependentToolScope).parameter(0).toEqualTypeOf<IndependentToolScopeInput>()
  expectTypeOf(createIndependentToolScope).returns.toEqualTypeOf<
    Outcome<ToolExecutionScope, Readonly<{ field: string; reason: string }>>
  >()
})

it('executeTool keeps A, R and E from the executor and answers R or an effect-bearing failure', () => {
  type Args = Readonly<{ path: string }>
  type Env = Readonly<{ root: string }>
  expectTypeOf(executeTool<Args, number, Env>).parameters.toEqualTypeOf<
    [Args, ToolExecutor<Args, number, Env>, Env, ToolExecutionScope]
  >()
  expectTypeOf(executeTool<Args, number, Env>).returns.toEqualTypeOf<
    Promise<Outcome<number, ExecuteToolFailure>>
  >()
  expectTypeOf<ExecuteToolFailure>().toEqualTypeOf<
    Readonly<{ reason: string; effect: 'not-started' | 'unknown' }>
  >()
})
