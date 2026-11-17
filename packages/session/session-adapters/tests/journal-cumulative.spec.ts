import { expect, it } from 'vitest'
import { scene } from './fixtures/journal-facts.ts'
import { random } from './fixtures/property.ts'
import { emptySessionView, fold } from '../src/journal/index.ts'
import { currentExecution, currentRows, executionFromRows } from '../src/journal/current.ts'

it('preserves cumulative positions and denial history when source rows leave the current projection', () => {
  const sample = scene(random(42), { executions: 1, rounds: 24, finish: false })
  let full = emptySessionView()
  let window = emptySessionView()
  let inputs = 0,
    requests = 0,
    sequence = 0,
    totalDenials = 0,
    consecutiveDenials = 0
  let lastAdmission: unknown = null,
    admissionBasis: unknown = null
  for (const batch of sample.log) {
    full = fold(full, batch)
    window = fold(window, batch)
    for (const fact of batch.facts) {
      if (fact.kind === 'input.accepted') inputs += 1
      if (fact.kind === 'request.adopted') requests += 1
      if (fact.kind === 'reply.judged') {
        sequence = fact.sequence
        admissionBasis = fact.basis
        if (fact.fact.decision === 'rejected') {
          totalDenials += 1
          consecutiveDenials += 1
        } else {
          consecutiveDenials = 0
          lastAdmission = fact.fact.source
        }
      }
    }
    const expected = {
      inputs,
      requests,
      sequence,
      totalDenials,
      consecutiveDenials,
      lastAdmission,
      admissionBasis,
    }
    const own = window.executions.get(batch.execution)!
    expect(own).toMatchObject({ summary: expected })
    expect(full.executions.get(batch.execution)).toMatchObject({ summary: expected })
    // Isolate the cumulative state obligation; lifecycle selection is verified separately.
    const selected = currentExecution({ ...own, inputs: [], requests: [], admissions: [] })
    const restored = executionFromRows(
      batch.execution,
      [...currentRows(selected)].map(([key, value]) => ({ key, value })),
    )
    window = { ...window, executions: new Map([[batch.execution, { ...own, ...restored }]]) }
  }
  expect(sequence).toBeGreaterThan(10)
  expect(totalDenials).toBeGreaterThan(0)
  expect(requests).toBeGreaterThan(sequence)
  const original = sample.log.find(batch => batch.facts.some(fact => fact.kind === 'reply.judged'))!
  const current = window.executions.get(original.execution)!
  const restored = fold({ ...window, head: 0 }, original).executions.get(original.execution)!
  expect(restored.summary).toEqual(current.summary)
  expect(restored.admissions).toContainEqual(expect.objectContaining({ sequence: 1 }))
})
