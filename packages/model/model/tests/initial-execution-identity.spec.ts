import { expect, it } from 'vitest'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { fixture } from './memory-fixture.ts'

function subject() {
  const f = fixture()
  const makeRun = () =>
    createModelInitialRun<typeof f.principal>({
      limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 2 },
      checkOriginRead: () => ({ ok: undefined }),
    })
  const run = makeRun()
  const core = createModelCommandsCore(
    { ...f.options, initialRun: run },
    new MemoryState(f.options),
  )
  return { core, run, otherRun: makeRun() }
}

it('constructs initial execution with the same factory run as its core', () => {
  const { core, run } = subject()
  expect(() => createModelInitialExecution({ core, run })).not.toThrow()
})

it('rejects a different valid factory run from the one held by its core', () => {
  const { core, otherRun } = subject()
  expect(() => createModelInitialExecution({ core, run: otherRun })).toThrow(TypeError)
})
