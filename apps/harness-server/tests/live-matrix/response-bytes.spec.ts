import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { setImmediate } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { observeResponseBytes } from './response-bytes.ts'

it.each([true, false])(
  'the capture leaves both frames for a late stream reader (same chunk: %s)',
  async together => {
    const response = new IncomingMessage(new Socket())
    const start = Buffer.from('event: message_start\n\n')
    const block = Buffer.from('event: content_block_start\n\n')
    const recorded: Buffer[] = []
    observeResponseBytes(response, chunk => recorded.push(Buffer.from(chunk)))
    response.push(together ? Buffer.concat([start, block]) : start)
    await setImmediate()
    const delivered: Buffer[] = []
    const consume = async () => {
      for await (const chunk of response) delivered.push(Buffer.from(chunk as Uint8Array))
    }
    const reading = consume()
    if (!together) response.push(block)
    response.push(null)
    await reading
    expect(Buffer.concat(delivered)).toEqual(Buffer.concat([start, block]))
    expect(Buffer.concat(recorded)).toEqual(Buffer.concat(delivered))
  },
)

it('the observer leaves an unclaimed response paused through cancellation', async () => {
  const response = new IncomingMessage(new Socket())
  const observed: Buffer[] = []
  observeResponseBytes(response, chunk => observed.push(chunk))
  response.push(Buffer.from('partial'))
  await setImmediate()
  response.destroy()
  expect(observed).toEqual([])
})
