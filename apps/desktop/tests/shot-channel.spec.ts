import { describe, expect, it } from 'vitest'
import { overlayChannel } from '../src/page/shot/channel.ts'

const SEARCH = '?screen=main&capture=3'

function recorder(fail = () => false) {
  const sent: string[] = []
  const fetcher = async (input: string, init: RequestInit) => {
    const body = init.body
    const size =
      body instanceof Blob ? body.size : body instanceof Uint8Array ? body.byteLength : -1
    sent.push(`${init.method ?? 'GET'} ${input}${body === undefined ? '' : ` ${String(size)}`}`)
    if (fail()) throw new TypeError('network')
  }
  return { sent, fetcher }
}

describe('what an overlay page tells the main process', () => {
  it('reports that it is in use once, with its screen and capture', () => {
    const { sent, fetcher } = recorder()
    const channel = overlayChannel(SEARCH, fetcher)
    channel.active()
    channel.active()
    expect(sent).toEqual(['POST /device/screen/active?screen=main&capture=3'])
  })

  it('hands in one answer: the picture, or an empty body for a cancel, and nothing after it', async () => {
    const { sent, fetcher } = recorder()
    const channel = overlayChannel(SEARCH, fetcher)
    await channel.picture(new Blob([new Uint8Array([1, 2, 3])]))
    await channel.cancel()
    await channel.picture(new Blob([new Uint8Array([4])]))
    expect(sent).toEqual(['POST /device/screen/choice?screen=main&capture=3 3'])
    const cancelling = recorder()
    await overlayChannel(SEARCH, cancelling.fetcher).cancel()
    expect(cancelling.sent).toEqual(['POST /device/screen/choice?screen=main&capture=3 0'])
  })

  it('lets the person try again when the answer did not get through', async () => {
    let failing = true
    const { sent, fetcher } = recorder(() => failing)
    const channel = overlayChannel(SEARCH, fetcher)
    await channel.picture(new Blob([new Uint8Array([1])]))
    failing = false
    await channel.cancel()
    expect(sent).toEqual([
      'POST /device/screen/choice?screen=main&capture=3 1',
      'POST /device/screen/choice?screen=main&capture=3 0',
    ])
  })
})
