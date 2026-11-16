export type Answer<I, O> = (input: I) => O | Promise<O>

export interface Script<I, O> {
  always(answer: Answer<I, O>): void
  once(answer: Answer<I, O>): void
  readonly calls: readonly I[]
}

export type In<F> = F extends (input: infer I, ...rest: never[]) => unknown ? I : never
export type Out<F> = F extends (...input: never[]) => Promise<infer O> ? O : never
export type ScriptOf<F> = Script<In<F>, Out<F>>

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
