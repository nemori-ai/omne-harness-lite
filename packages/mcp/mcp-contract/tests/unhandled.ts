// A case that leaves a promise rejected with nobody to hear it has failed. This is a setup file
// of `vitest.config.ts`: its hooks apply to every case file of the package, so a new file cannot
// leave the guard out. Without it the runner reports the rejection as an error outside any test,
// and a differential mutation run then counts a mutant that raises one, while every case passes,
// as a run error, not as killed. The same guard, byte for byte in its hooks, is in
// `@omne-harness/mcp-host-local` (`tests/unhandled.ts`).
import { afterAll, afterEach, beforeAll, expect } from 'vitest'

const seen: unknown[] = []
const record = (reason: unknown): void => {
  seen.push(reason)
}

beforeAll(() => {
  process.on('unhandledRejection', record)
  process.on('uncaughtException', record)
})

afterEach(async () => {
  // A rejection surfaces after the microtasks of the case; one turn of the event loop lets it in.
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(seen.splice(0), 'unhandled rejections or uncaught exceptions during the case').toEqual([])
})

afterAll(async () => {
  await new Promise<void>(resolve => setImmediate(resolve))
  process.off('unhandledRejection', record)
  process.off('uncaughtException', record)
  expect(seen.splice(0), 'unhandled rejections or uncaught exceptions after the last case').toEqual(
    [],
  )
})
