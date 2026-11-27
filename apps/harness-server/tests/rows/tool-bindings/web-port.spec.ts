import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WEB_PORT, webPortEntry } from '../../../src/rows/tool-bindings/web-port.ts'

const LIMITS = { maxRedirects: 2, timeoutMs: 5000, maxBodyBytes: 65_536 }

let server: Server
let origin = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/text') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      return response.end('sunny in Oslo')
    }
    if (request.url === '/page') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return response.end('<html><body><h1>Forecast</h1><p>Sunny</p></body></html>')
    }
    if (request.url === '/picture') {
      response.writeHead(200, { 'content-type': 'image/png' })
      return response.end(Buffer.from([137, 80, 78, 71]))
    }
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('no')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const port = () => {
  const entry = webPortEntry(LIMITS)
  const made = entry.item.make({ principal: 'alice-principal', tenant: 'alice' }) as {
    fetch(input: unknown): Promise<unknown>
  }
  return { entry, fetch: made.fetch }
}

describe("the web port lent to plugins' code (C23)", () => {
  it('is the item web on plugin.ports, and says what fetch takes and answers', () => {
    const { entry } = port()
    expect([entry.point, entry.key, Object.keys(entry.item.methods)]).toEqual([
      'plugin.ports',
      WEB_PORT,
      ['fetch'],
    ])
    expect(entry.item.methods.fetch.takes).toContain('only GET')
  })

  it('answers the final address, the media type, the text and whether it was cut', async () => {
    const { fetch } = port()
    expect(await fetch({ url: `${origin}/text` })).toEqual({
      outcome: 'done',
      value: {
        finalUrl: `${origin}/text`,
        mediaType: 'text/plain',
        text: 'sunny in Oslo',
        truncated: false,
      },
    })
    expect(await fetch({ url: `${origin}/page` })).toMatchObject({
      outcome: 'done',
      value: { mediaType: 'text/html', text: expect.stringContaining('Forecast') },
    })
  })

  it('refuses with the reason of Web', async () => {
    const { fetch } = port()
    expect(await fetch({ url: `${origin}/missing` })).toEqual({
      outcome: 'refused',
      reason: 'upstream',
      kind: 'upstream',
      status: 404,
    })
    expect(await fetch({ url: `${origin}/picture` })).toEqual({
      outcome: 'refused',
      reason: 'not-text',
      kind: 'not-text',
      mediaType: 'image/png',
    })
    for (const input of [{ url: 'not an address' }, { url: 'file:///etc/hosts' }, {}, null])
      expect(await fetch(input)).toMatchObject({ outcome: 'refused', reason: 'invalid-url' })
  })
})
