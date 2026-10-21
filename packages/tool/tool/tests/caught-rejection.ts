import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { fail } from '@omne-harness/operation-result'
import { admitCall, startHarness } from './start-values.ts'

const original = new TypeError('failure marker write defect')
const unhandled: unknown[] = []
const listener = (error: unknown) => unhandled.push(error)
process.on('unhandledRejection', listener)
try {
  const harness = startHarness({
    bindingPort: base => ({
      ...base,
      start: async () =>
        fail({ kind: 'unavailable', dependency: 'executor', diagnostic: 'refused' }),
    }),
    commands: base => ({
      ...base,
      recordStart: async input => {
        if (input.operation === 'op-c1/start-failed') throw original
        return base.recordStart(input)
      },
    }),
  })
  await admitCall(harness, 'c1')
  let caught: unknown
  try {
    await harness.runOnce('c1')
  } catch (error) {
    caught = error
  }
  await setImmediate()
  await setImmediate()
  assert.equal(caught, original)
  assert.equal((await harness.state('c1')).phase, 'starting')
  process.stdout.write(
    JSON.stringify({ caughtSameError: caught === original, unhandledRejections: unhandled.length }),
  )
  assert.equal(unhandled.length, 0)
} finally {
  process.removeListener('unhandledRejection', listener)
}
