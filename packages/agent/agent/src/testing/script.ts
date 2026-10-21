// One scripted port method: a standing answer, a queue of one-shot answers and the log of inputs.
// Every fixture of the testing entry is built from these, so a test scripts every port the same way.

/** How a scripted method answers one call. */
export type Answer<I, O> = (input: I) => O | Promise<O>

/** The control handle of one scripted method. */
export interface Script<I, O> {
  /** Every later call answers this way, unless a one-shot answer is queued. */
  always(answer: Answer<I, O>): void
  /** The next call answers this way, once. Queued answers are used in order. */
  once(answer: Answer<I, O>): void
  /** The inputs of every call so far, in call order. */
  readonly calls: readonly I[]
}

/** The single input of a port method. */
export type In<F> = F extends (input: infer I, ...rest: never[]) => unknown ? I : never
/** What a port method resolves to. */
export type Out<F> = F extends (...input: never[]) => Promise<infer O> ? O : never
/** The control handle that scripts one port method. */
export type ScriptOf<F> = Script<In<F>, Out<F>>

/** A scripted method and its control handle. */
export type ScriptedMethod<I, O> = Readonly<{
  call(input: I): Promise<O>
  script: Script<I, O>
}>

export function scriptedMethod<I, O>(initial: Answer<I, O>): ScriptedMethod<I, O> {
  let standing = initial
  const queued: Answer<I, O>[] = []
  const calls: I[] = []
  return {
    async call(input) {
      calls.push(input)
      const answer = queued.shift() ?? standing
      return answer(input)
    },
    script: {
      always(answer) {
        standing = answer
      },
      once(answer) {
        queued.push(answer)
      },
      calls,
    },
  }
}
