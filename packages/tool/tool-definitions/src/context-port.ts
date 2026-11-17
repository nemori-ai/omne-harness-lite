import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type ContextPort<T> = Readonly<{
  of(context: ToolExecutionContext): T | undefined
  /** Attach after other context-producing attachments. Finish removes the port before delegation. */
  attach(scope: ToolExecutionScope, value: T): ToolExecutionScope
}>

export function contextPort<T extends object>(): ContextPort<T> {
  const attachments = new WeakMap<ToolExecutionContext, T>()
  return {
    of: context => attachments.get(context),
    attach(scope, value) {
      const context = scope.context
      attachments.set(context, value)
      let finished: ReturnType<ToolExecutionScope['finish']> | undefined
      return {
        context,
        limits: scope.limits,
        finish(exit) {
          if (finished !== undefined) return finished
          attachments.delete(context)
          const completion =
            Promise.withResolvers<Awaited<ReturnType<ToolExecutionScope['finish']>>>()
          finished = completion.promise
          try {
            completion.resolve(scope.finish(exit))
          } catch (error) {
            completion.reject(error)
          }
          return finished
        },
      }
    },
  }
}
