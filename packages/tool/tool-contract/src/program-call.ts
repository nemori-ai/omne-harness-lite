import type { ToolExecutionContext, ToolExecutionScope } from './author-context.ts'

const fromPrograms = new WeakSet<ToolExecutionContext>()

/** Whether this call was made by a program. Only such a call computes and keeps a value for a program. */
export function isProgramCall(context: ToolExecutionContext): boolean {
  return fromPrograms.has(context)
}

/** The host marks the scope it hands the author, after every attachment that makes a new context. */
export function markProgramCall(scope: ToolExecutionScope): ToolExecutionScope {
  fromPrograms.add(scope.context)
  return scope
}
