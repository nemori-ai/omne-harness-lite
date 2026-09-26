import { expect, it } from 'vitest'
import {
  judgeValue,
  judgeInput,
  judgeConclusion,
  validate,
  POWER_CONCLUSIONS,
  POSITION_CONCLUSIONS,
} from '../src/index.ts'
import { variants, inputAt, outputsAt, recordAt } from './helpers.ts'

const powers = [
  { value: 'observe', mask: '10000000' },
  { value: 'rewrite', mask: '11110010' },
  { value: 'veto', mask: '11111111' },
]
for (const [variantIndex, variant] of variants.entries()) {
  it(`LE-INPUT-${variantIndex + 1}: explicit environment at ${variant.position} ${JSON.stringify(variant.dimension ?? {})}`, () => {
    const input = inputAt(variant)
    expect(judgeInput(input)).toHaveProperty('ok')
    const { environment, ...withoutEnvironment } = input
    expect(environment).toBe('env_1')
    expect(judgeInput(withoutEnvironment)).toEqual({ rejected: 'malformed' })
    expect(judgeInput({ ...input, environment: ' env_1' })).toEqual({ rejected: 'malformed' })
  })
  for (const [powerIndex, power] of powers.entries())
    for (const [kindIndex, output] of outputsAt(variant).entries())
      it(`LE-GRID-${variantIndex + 1}-${powerIndex + 1}-${kindIndex + 1}: ${variant.position} ${power.value} ${String(output.kind)}`, () => {
        const record = recordAt(variant, power.value, output)
        const powerAllowed = power.mask[kindIndex] === '1'
        const positionAllowed = variant.mask[kindIndex] === '1'
        expect(validate('Conclusion', record).valid).toBe(powerAllowed && positionAllowed)
        const rejection = !powerAllowed
          ? 'output_not_allowed_for_power'
          : output.kind === 'ask' &&
              ['before_persist_message', 'after_terminal'].includes(variant.position)
            ? 'ask_at_forbidden_position'
            : !positionAllowed
              ? 'output_not_allowed_at_position'
              : undefined
        const judged = judgeValue('Conclusion', record)
        const admitted = judgeInput(inputAt(variant))
        if ('rejected' in admitted) throw new Error('invalid independent grid input')
        const publicJudged = judgeConclusion(record, { input: admitted.ok, extensionName: 'g' })
        if (rejection === undefined) expect(judged).toHaveProperty('ok')
        else expect(judged).toEqual({ rejected: rejection })
        if (rejection === undefined) expect(publicJudged).toHaveProperty('ok')
        else expect(publicJudged).toEqual({ rejected: rejection })
      })
}
it('LE-TABLE-OWNERSHIP: public tables and every nested collection immutable', () => {
  expect(Object.isFrozen(POWER_CONCLUSIONS)).toBe(true)
  for (const values of Object.values(POWER_CONCLUSIONS)) expect(Object.isFrozen(values)).toBe(true)
  expect(Object.isFrozen(POSITION_CONCLUSIONS)).toBe(true)
  expect(Object.isFrozen(POSITION_CONCLUSIONS.after_model_call)).toBe(true)
  expect(Object.isFrozen(POSITION_CONCLUSIONS.after_action.each)).toBe(true)
})
