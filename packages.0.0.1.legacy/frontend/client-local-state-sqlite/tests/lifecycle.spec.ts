import { openStorage } from '@omne-harness-lite/storage-sql'
import { expect, test } from 'vitest'
import { openClientLocalState, type ClientLocalStateInstance } from '../src/index.ts'
import { fixtures } from './support.ts'

const fixture = fixtures()
test('close retains a read that synchronously reenters through the public storage factory', async () => {
  const gate = Promise.withResolvers<void>()
  let state: ClientLocalStateInstance
  let armed = false
  let closed = false
  let closing: Promise<void> | undefined
  state = await openClientLocalState(
    { directory: await fixture.directory() },
    {
      storage: {
        async open(file) {
          const raw = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
          return {
            read: work => {
              if (!armed) return raw.read(work)
              armed = false
              closing = state.close().then(() => {
                closed = true
              })
              return gate.promise.then(() => raw.read(work))
            },
            write: work => raw.write(work),
            atomic: work => raw.atomic(work),
            close: () => raw.close(),
          }
        },
      },
    },
  )
  armed = true
  const reading = state.read()
  try {
    await new Promise(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    gate.resolve()
    expect((await reading).kind).toBe('read')
    await closing
    expect(closed).toBe(true)
  } finally {
    gate.resolve()
    await reading
    await state.close()
  }
})
