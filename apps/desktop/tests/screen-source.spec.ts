import { describe, expect, it } from 'vitest'
import { hostScreen } from '../src/page/screen-source.ts'

type Sent = Readonly<{ path: string; method: string }>

function fetchOf(answers: Record<string, () => Response | Promise<Response>>) {
  const sent: Sent[] = []
  const fetcher = async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    sent.push({ path: input, method })
    const answer = answers[`${method} ${input}`]
    if (answer === undefined) return new Response('not found', { status: 404 })
    return answer()
  }
  return { fetcher, sent }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('the screenshots of the desktop host', () => {
  it('is available only when the host says it has a screen backend', async () => {
    expect(
      await hostScreen(
        fetchOf({ 'GET /device/screen': () => json(200, { available: true }) }).fetcher,
      ).available(),
    ).toBe(true)
    expect(
      await hostScreen(
        fetchOf({ 'GET /device/screen': () => json(200, { available: false }) }).fetcher,
      ).available(),
    ).toBe(false)
    expect(await hostScreen(fetchOf({}).fetcher).available()).toBe(false)
    expect(
      await hostScreen(
        fetchOf({ 'GET /device/screen': () => new Response('<html>') }).fetcher,
      ).available(),
    ).toBe(false)
    expect(await hostScreen(async () => Promise.reject(new Error('offline'))).available()).toBe(
      false,
    )
  })

  it('takes the picture and the time it was taken from a capture', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const { fetcher, sent } = fetchOf({
      'POST /device/screen': () =>
        new Response(png, {
          headers: { 'content-type': 'image/png', 'x-omne-taken-at': '1700000000000' },
        }),
    })
    expect(await hostScreen(fetcher).capture()).toEqual({
      kind: 'shot',
      png,
      takenAt: 1_700_000_000_000,
    })
    expect(sent).toEqual([{ path: '/device/screen', method: 'POST' }])
  })

  it('takes a picture without the time it was taken as a failed capture', async () => {
    const answer = () =>
      new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
    expect(await hostScreen(fetchOf({ 'POST /device/screen': answer }).fetcher).capture()).toEqual({
      kind: 'failed',
      reason: '截图没有成功',
    })
  })

  it('reads a missing permission, a failure with its reason, and anything else as a failure', async () => {
    const capture = (answer: () => Response) =>
      hostScreen(fetchOf({ 'POST /device/screen': answer }).fetcher).capture()
    expect(await capture(() => json(403, { reason: 'not-authorized' }))).toEqual({
      kind: 'not-authorized',
    })
    expect(await capture(() => json(500, { reason: 'failed', detail: '屏幕后端出错' }))).toEqual({
      kind: 'failed',
      reason: '屏幕后端出错',
    })
    expect(await capture(() => new Response('oops', { status: 502 }))).toEqual({
      kind: 'failed',
      reason: '截图没有成功',
    })
  })

  it('asks the host to open the screen recording settings', async () => {
    const { fetcher, sent } = fetchOf({
      'POST /device/screen/settings': () => new Response(null, { status: 204 }),
    })
    hostScreen(fetcher).openSettings?.()
    await Promise.resolve()
    expect(sent).toEqual([{ path: '/device/screen/settings', method: 'POST' }])
  })
})
