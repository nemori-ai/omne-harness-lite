const padded = (value: number): string => String(value).padStart(4, '0')

export const roundMark = (round: number): string => `mk-round-${padded(round)}`

export const callId = (round: number, step: number, call = 1): string =>
  `call_r${padded(round)}_s${padded(step)}_c${padded(call)}`

export type Call = Readonly<{ tool: string; arguments: Readonly<Record<string, unknown>> }>

export type RoundShape = Readonly<{
  steps: readonly (readonly Call[])[]
  inputBytes?: number
  attachBytes?: number
}>

const LINE = 'the quick brown fox jumps over the lazy dog and runs on\n'

export const filled = (bytes: number): string =>
  LINE.repeat(Math.ceil(bytes / LINE.length)).slice(0, bytes)

export const MAX_INPUT_BYTES = 120_000

export function inputOf(round: number, shape: RoundShape): string {
  const head = `please work ${roundMark(round)}`
  const more = (shape.inputBytes ?? 0) - head.length - 1
  if ((shape.inputBytes ?? 0) > MAX_INPUT_BYTES)
    throw new Error(`an input of ${String(shape.inputBytes)} bytes does not fit one argument`)
  return more > 0 ? `${head}\n${filled(more)}` : head
}

export const SUMMARY_WORDS = 'Summarize the conversation so far for a later request'

export const readOf = (file: string): Call => ({
  tool: 'Files',
  arguments: { command: 'read', params: { path: file } },
})

export const BACKGROUND: Call = {
  tool: 'Shell',
  arguments: {
    command: 'execute',
    intent: 'wait in the background',
    params: { script: 'sleep 3600', run_in_background: true },
  },
}

export const LIST: Call = { tool: 'Files', arguments: { command: 'list', params: { path: '.' } } }

export type Place = Readonly<{ round: number; step: number | 'end' }>

export type Script = Readonly<{
  script: Readonly<{ steps: readonly object[] }>
  places: readonly (Place | null)[]
}>

export function scriptOf(rounds: readonly RoundShape[], first: readonly object[] = []): Script {
  const rules: { rule: object; place: Place }[] = []
  rounds.forEach((shape, index) => {
    const round = index + 1
    shape.steps.forEach((calls, at) => {
      const step = at + 1
      rules.push({
        place: { round, step },
        rule: {
          when: {
            has: [step === 1 ? roundMark(round) : callId(round, step - 1)],
            lacks: [callId(round, step)],
          },
          call: calls.map((call, order) => ({ id: callId(round, step, order + 1), ...call })),
        },
      })
    })
    const last = shape.steps.length === 0 ? roundMark(round) : callId(round, shape.steps.length)
    rules.push({
      place: { round, step: 'end' },
      rule: {
        when: { has: [last], lacks: [roundMark(round + 1)] },
        say: `finished ${roundMark(round)}`,
      },
    })
  })
  rules.reverse()
  return {
    script: { steps: [...first, ...rules.map(item => item.rule)] },
    places: [...first.map(() => null), ...rules.map(item => item.place)],
  }
}

export const requestsOf = (shape: RoundShape): number => shape.steps.length + 1
