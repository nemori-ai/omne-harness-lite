import { expect, it } from 'vitest'
import { faultIsTransient, type ModelFaultCause } from '@omne-harness/model-contract'

const causes: Readonly<Record<ModelFaultCause, boolean>> = {
  'profile-withdrawn': false,
  excluded: false,
  modality: false,
  credential: false,
  'input-rejected': false,
  'input-over-limit': false,
  'replay-rejected': false,
  'upstream-unavailable': true,
  'stream-lost': true,
  'runtime-lost': true,
  persistence: false,
  'policy-unavailable': false,
  'upstream-protocol': false,
  unclassified: false,
}

it('names exactly upstream-unavailable, stream-lost and runtime-lost as transient', () => {
  expect(Object.keys(causes)).toHaveLength(14)
  for (const [cause, transient] of Object.entries(causes))
    expect(faultIsTransient(cause as ModelFaultCause), cause).toBe(transient)
})
