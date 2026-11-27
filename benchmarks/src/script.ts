const padded = (value: number): string => String(value).padStart(4, '0')

export const roundMark = (round: number): string => `mk-round-${padded(round)}`

export const callId = (round: number, step: number, call = 1): string =>
  `call_r${padded(round)}_s${padded(step)}_c${padded(call)}`

export type Call = Readonly<{ tool: string; arguments: Readonly<Record<string, unknown>> }>

export type RoundShape = Readonly<{
  steps: readonly (readonly Call[])[]
}>

export const LIST: Call = { tool: 'Files', arguments: { command: 'list', params: { path: '.' } } }

export function scriptOf(rounds: readonly RoundShape[]): object {
  const rules: object[] = []
  rounds.forEach((shape, index) => {
    const round = index + 1
    shape.steps.forEach((calls, at) => {
      const step = at + 1
      rules.push({
        when: {
          has: [step === 1 ? roundMark(round) : callId(round, step - 1)],
          lacks: [callId(round, step)],
        },
        call: calls.map((call, order) => ({ id: callId(round, step, order + 1), ...call })),
      })
    })
    const last = shape.steps.length === 0 ? roundMark(round) : callId(round, shape.steps.length)
    rules.push({
      when: { has: [last], lacks: [roundMark(round + 1)] },
      say: `finished ${roundMark(round)}`,
    })
  })
  return { steps: rules.reverse() }
}

export const requestsOf = (shape: RoundShape): number => shape.steps.length + 1
