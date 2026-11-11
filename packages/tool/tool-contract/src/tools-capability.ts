import type { ToolExecutionContext, ToolExecutionScope } from './author-context.ts'
import type { ToolForwardIntent } from './forwarding.ts'
import type { ToolResultVersion } from './identity.ts'
import type { ToolDefiniteFailure } from './operations.ts'
import type { ToolInvocationRef } from './reference.ts'
import type { Reply, ToolMessageContentBlock, ToolResult } from './results.ts'
import type {
  InspectArguments,
  SearchArguments,
  SearchPage,
  ToolsReadArguments,
  ToolUsageView,
} from './tools-protocol.ts'

export type ToolsExecuteAnswer =
  | Readonly<{
      kind: 'completed'
      reference: ToolInvocationRef
      result: ToolResultVersion
      value: ToolResult<ToolMessageContentBlock>
    }>
  | Readonly<{
      kind: 'pending'
      reference: ToolInvocationRef
      parent: ToolInvocationRef
      reason: 'waiting' | 'background' | 'commit-unknown'
    }>
  | Readonly<{ kind: 'association-unknown'; parent: ToolInvocationRef }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>
export interface ToolsCapability {
  search(input: SearchArguments): Reply<SearchPage>
  inspect(input: InspectArguments): Reply<ToolUsageView>
  execute(input: ToolForwardIntent): Promise<ToolsExecuteAnswer>
  readResult(input: ToolsReadArguments): Promise<ToolResult<ToolMessageContentBlock>>
}
const attachments = new WeakMap<ToolExecutionContext, ToolsCapability>()
export function toolsCapabilityOf(context: ToolExecutionContext): ToolsCapability | undefined {
  return attachments.get(context)
}

/** The attachment belongs to a fresh context and closes before the original scope finishes. */
export function attachToolsCapability(
  scope: ToolExecutionScope,
  capability: Readonly<{ value: ToolsCapability; close(): Promise<void> }>,
): ToolExecutionScope {
  const context: ToolExecutionContext = {
    mode: scope.context.mode,
    signal: scope.context.signal,
    body: scope.context.body,
    emit: update => scope.context.emit(update),
    wait: scope.context.wait.bind(scope.context),
  }
  attachments.set(context, capability.value)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      const completion = Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
      finished = completion.promise
      const run = async () => {
        const errors: unknown[] = []
        try {
          await capability.close()
        } catch (error) {
          errors.push(error)
        }
        let answer: Awaited<ReturnType<ToolExecutionScope['finish']>> | undefined
        try {
          answer = await scope.finish(exit)
        } catch (error) {
          errors.push(error)
        } finally {
          attachments.delete(context)
        }
        if (errors.length > 0) {
          if (answer !== undefined && 'failure' in answer) errors.push(answer.failure)
          if (errors.length === 1) throw errors[0]
          throw new AggregateError(errors, 'Tool scope cleanup failed')
        }
        if (answer === undefined) throw new Error('Tool scope finish returned no answer')
        return answer
      }
      void run().then(completion.resolve, completion.reject)
      return finished
    },
  }
}
