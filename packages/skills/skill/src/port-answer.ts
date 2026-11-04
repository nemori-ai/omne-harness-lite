// How a port answer is taken, by the contract SPEC "端口答复的统一处置": a port that rejects has
// not answered, and an answer is read by its `kind` only when it is an object with a text `kind`.
// The compiler proves the closed sets of the port types; the runtime does not, so the services
// read every answer through these two functions before they trust it.

/** The answer of a port call, or `undefined` when the port rejected or threw. */
export async function answered<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call()
  } catch {
    return undefined
  }
}

/** The `kind` of a port answer, when the answer is an object with a text `kind`. */
export function kindOf(answer: unknown): string | undefined {
  return typeof answer === 'object' && answer !== null && 'kind' in answer
    ? typeof answer.kind === 'string'
      ? answer.kind
      : undefined
    : undefined
}
