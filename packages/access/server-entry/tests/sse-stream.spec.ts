// The serial SSE writer on a response whose client has already gone: it enters the closed state at
// once, so a registration that happens after the disconnect releases immediately and no heartbeat
// is ever armed against a destroyed response.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SseStream } from '../src/sse.ts'
import { sleep } from './support/harness.ts'
import { holdResponse, type HeldResponse } from './support/held-response.ts'

let held: HeldResponse | undefined
afterEach(async () => {
  await held?.dispose()
  held = undefined
})

describe('SseStream on a disconnected response', () => {
  it('is closed at construction: onClose fires at once, finished resolves, nothing is written', async () => {
    held = await holdResponse()
    await held.disconnect()
    const { res } = held
    expect(res.destroyed).toBe(true)
    const write = vi.spyOn(res, 'write')
    const stream = new SseStream(res, 20)
    expect(stream.closed).toBe(true)
    let closeCalls = 0
    stream.onClose(() => {
      closeCalls += 1
    })
    expect(closeCalls).toBe(1)
    stream.open(200, '{"first":true}')
    stream.event('{"second":true}')
    stream.end()
    await expect(
      Promise.race([stream.finished.then(() => 'finished'), sleep(200).then(() => 'hung')]),
    ).resolves.toBe('finished')
    await sleep(80)
    expect(write).not.toHaveBeenCalled()
  })
})
