import { describe, expect, it } from 'vitest'
import { adoption, assemble, fixture } from './fixtures.js'

const failures = {
  invalid: { kind: 'invalid', field: '/messages/1/blocks/0', reason: 'orphan-tool-call' },
  unsupported: { kind: 'unsupported', field: 'image', adapter: adoption },
  denied: { kind: 'denied', action: 'plan' },
  unavailable: { kind: 'unavailable', dependency: 'supplier', diagnostic: 'down' },
} as const
const kinds = ['invalid', 'unsupported', 'denied', 'unavailable'] as const

const answers = (step: 'preparation' | 'meter') => ({
  invalid: { kind: 'invalid', field: `${step}./messages/1/blocks/0`, reason: 'unsupported-format' },
  unsupported: { kind: 'invalid', field: `${step}.image`, reason: 'unsupported-format' },
  denied: { kind: 'denied', action: 'assemble', diagnostic: `Model ${step} refused plan` },
  unavailable: { kind: 'unavailable', owner: step },
})

describe('a failure of a supplier keeps its kind (RQ-05)', () => {
  it.each(kinds)('the rules answer %s', async kind => {
    const f = fixture()
    const result = await assemble(
      f.input,
      { ...f.ports, plan: () => ({ failure: failures[kind] }) },
      f.policies,
    )
    expect(result).toEqual(expect.objectContaining(answers('preparation')[kind]))
  })

  it.each(kinds)('the meter answers %s', async kind => {
    const f = fixture()
    const meter = { ...f.ports.meter, measure: async () => ({ failure: failures[kind] }) }
    const result = await assemble(f.input, { ...f.ports, meter }, f.policies)
    expect(result).toEqual(expect.objectContaining(answers('meter')[kind]))
  })
})
