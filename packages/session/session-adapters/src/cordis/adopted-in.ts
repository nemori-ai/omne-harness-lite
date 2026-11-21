import type { ExecutionView, RequestView } from '../journal/index.ts'

/** The request adopted last in the session, or the one adopted for the named model call. */
export function adoptedIn(
  executions: Iterable<ExecutionView>,
  reference: string | undefined,
): Readonly<{ execution: string; request: RequestView }> | null {
  let latest: Readonly<{ execution: string; request: RequestView }> | null = null
  for (const execution of executions) {
    const request =
      reference === undefined
        ? execution.adopted
        : (execution.requests.findLast(each => each.reference === reference) ?? null)
    if (request !== null && (latest === null || request.pub > latest.request.pub))
      latest = { execution: execution.execution, request }
  }
  return latest
}
