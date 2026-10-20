import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
} from '@omne-harness/model-contract/testing'
import { expect, it } from 'vitest'

it('the scripted provider transport passes each of the six transport obligations directly', async () => {
  const report = await checkModelProviderConformance({ subject: createScriptedConformanceSubject })
  const ids = [
    'transport-sends-only-at-start',
    'repeated-transport-step-sends-nothing',
    'materialization-receipt-matches-request',
    'fact-stream-ends-once',
    'interruption-is-confirmed',
    'transport-close-is-idempotent',
  ]
  expect(report.results.filter(result => ids.includes(result.obligation))).toEqual(
    ids.map(obligation => ({ obligation, status: 'pass', detail: '' })),
  )
})
