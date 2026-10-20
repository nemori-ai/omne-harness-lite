// The independent execution wrapper (P11 "独立消费与失败解释"). It checks the scope, hands the
// context to the author, and settles the scope after the author returns or throws.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolExecutionScope, ToolExecutor } from '@omne-harness/tool-contract'
import { describeThrown } from './independent-scope.ts'
import { judgeAuthorLimits } from './limits.ts'

export type ExecuteToolFailure = Readonly<{ reason: string; effect: 'not-started' | 'unknown' }>

function scopeMismatch(scope: unknown): string | null {
  if (typeof scope !== 'object' || scope === null) return 'the scope is not an object'
  if (typeof Reflect.get(scope, 'finish') !== 'function') return 'the scope has no finish'
  const context: unknown = Reflect.get(scope, 'context')
  if (typeof context !== 'object' || context === null) return 'the scope has no context'
  if (Reflect.get(context, 'mode') !== 'independent') return 'the scope context is not independent'
  const limits = judgeAuthorLimits(Reflect.get(scope, 'limits'), 'limits')
  if ('failure' in limits) return `${limits.failure.field}: ${limits.failure.reason}`
  return null
}

/**
 * Runs one executor inside an independent scope. A scope that is not independent or whose
 * limits are not positive safe integers is refused before the author runs. The value of R is
 * given only after `finish('returned')` succeeded, so the return barrier holds.
 */
export async function executeTool<A, R, E>(
  argumentsValue: A,
  executor: ToolExecutor<A, R, E>,
  environment: E,
  scope: ToolExecutionScope,
): Promise<Outcome<R, ExecuteToolFailure>> {
  const mismatch = scopeMismatch(scope)
  if (mismatch !== null) return fail({ reason: mismatch, effect: 'not-started' })
  let value: R
  try {
    value = await executor.execute(argumentsValue, environment, scope.context)
  } catch (error: unknown) {
    await scope.finish('failed')
    return fail({ reason: describeThrown(error), effect: 'unknown' })
  }
  const closed = await scope.finish('returned')
  if ('failure' in closed)
    return fail({ reason: `${closed.failure.kind}: ${closed.failure.reason}`, effect: 'unknown' })
  return succeed(value)
}
