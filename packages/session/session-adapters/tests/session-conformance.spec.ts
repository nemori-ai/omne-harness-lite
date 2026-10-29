import { it, expect } from 'vitest'
import { sessionTransactionsConformance } from '@omne-harness/session-contract/testing'
import { sessionFixture } from './fixtures/session-conformance.ts'
for (const test of sessionTransactionsConformance<string>())
  it(`Session ${test.clause}: ${test.name}`, () => test.run(sessionFixture()))

for (const defect of ['execution', 'operation', 'missing-half'] as const)
  it(`JC-06 detects a faulty participation hook: ${defect}`, async () => {
    const fixture = sessionFixture(),
      original = fixture.publishMessageParticipation!
    fixture.publishMessageParticipation = async input => {
      if (defect === 'missing-half')
        return {
          execution: input.execution,
          operation: input.operation,
          joint: 'message',
          written: '1',
          handover: { owner: 'false-hook', record: 'none', revision: '1', digest: 'none' },
        }
      const value = await original(input)
      return { ...value, [defect]: `wrong-${value[defect]}` }
    }
    const test = sessionTransactionsConformance<string>().find(item => item.clause === 'JC-06')!
    await expect(test.run(fixture)).rejects.toThrow(
      defect === 'missing-half' ? 'Session half must exist' : 'original',
    )
  })
