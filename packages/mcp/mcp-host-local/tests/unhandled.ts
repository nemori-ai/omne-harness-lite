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
