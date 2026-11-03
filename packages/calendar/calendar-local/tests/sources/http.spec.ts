import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import { createCalendarSourceAdapters } from '../../src/sources/index.ts'

const acquiredAt = instantSchema.parse('2026-11-03T00:00:00.000Z')
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of close.splice(0)) await dispose()
})
async function serve(handler: (response: ServerResponse, request: IncomingMessage) => void) {
  const server = createServer((request, response) => handler(response, request))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing port')
  close.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close(error => (error ? reject(error) : resolve()))
      }),
  )
  return `http://127.0.0.1:${address.port}`
}
function adapter(origin: string, limits = {}) {
  const value = createCalendarSourceAdapters({
    testEndpoints: { origins: { 'https://www.opm.gov': origin } },
    limits,
  }).find(source => source.sourceId === 'opm-federal-holidays-ics')
  if (!value) throw new Error('missing source')
  return value
}
const ics =
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260101\r\nSUMMARY:New Year\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
it('acquires exact bytes and never substitutes acquisition time for source knowledge', async () => {
  const origin = await serve(response => {
    response.writeHead(200, {
      'content-type': 'text/calendar',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.end(ics)
  })
  const result = await adapter(origin).acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') return
  expect(Buffer.from(result.material.content).toString()).toBe(ics)
  expect(result.material.knowledgeAsOf).toBe('2026-10-01T00:00:00.000Z')
  expect(result.material.transportEvidence?.[0]?.url).toBe(
    `${origin}/policy-data-oversight/pay-leave/federal-holidays/holidays.ics`,
  )
  expect(result.material.transportEvidence).toEqual([
    expect.objectContaining({
      method: 'GET',
      status: 200,
      lastModified: 'Thu, 01 Oct 2026 00:00:00 GMT',
      bodyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      knowledgeBasis: expect.stringContaining('#last-modified='),
    }),
  ])
  const first = await adapter(origin).probe({ previous: null, observedAt: acquiredAt })
  expect(first.kind).toBe('changed')
  expect((await adapter(origin).probe({ previous: first, observedAt: acquiredAt })).kind).toBe(
    'unchanged',
  )
})
it.each([304, 429, 503])('HTTP %s is failed, never unchanged', async status => {
  const origin = await serve(response => {
    response.writeHead(status)
    response.end()
  })
  expect((await adapter(origin).acquire({ acquiredAt })).kind).toBe('unavailable')
  expect((await adapter(origin).probe({ previous: null, observedAt: acquiredAt })).kind).toBe(
    'failed',
  )
})
it.each([
  'empty',
  'html',
  'missing knowledge',
  'invalid knowledge',
  'future knowledge',
  'truncated',
])('rejects %s response', async kind => {
  const origin = await serve(response => {
    const modified =
      kind === 'invalid knowledge'
        ? 'not a date'
        : kind === 'future knowledge'
          ? 'Thu, 01 Oct 2027 00:00:00 GMT'
          : 'Thu, 01 Oct 2026 00:00:00 GMT'
    response.writeHead(200, {
      'content-type': kind === 'html' ? 'text/html' : 'text/calendar',
      ...(kind === 'missing knowledge' ? {} : { 'last-modified': modified }),
    })
    response.end(
      kind === 'empty'
        ? ''
        : kind === 'html'
          ? '<html>blocked</html>'
          : kind === 'truncated'
            ? ics.slice(0, -20)
            : ics,
    )
  })
  expect((await adapter(origin).acquire({ acquiredAt })).kind).toBe('unavailable')
})
it('bounds bytes, wall time, redirects, disconnects and cancellation', async () => {
  const huge = await serve(response => {
    response.end('x'.repeat(200))
  })
  expect((await adapter(huge, { maxBodyBytes: 100 }).acquire({ acquiredAt })).kind).toBe(
    'unavailable',
  )
  const slow = await serve(() => {})
  expect((await adapter(slow, { timeoutMs: 30 }).acquire({ acquiredAt })).kind).toBe('unavailable')
  const signal = AbortSignal.abort()
  expect((await adapter(slow).acquire({ acquiredAt }, { signal })).kind).toBe('unavailable')
  const redirect = await serve(response => {
    response.writeHead(302, { location: 'http://169.254.169.254/latest' })
    response.end()
  })
  expect((await adapter(redirect).acquire({ acquiredAt })).kind).toBe('unavailable')
  const broken = await serve(response => {
    response.writeHead(200, { 'content-length': '100' })
    response.write('x')
    response.destroy()
  })
  expect((await adapter(broken).acquire({ acquiredAt })).kind).toBe('unavailable')
})
it('applies the timeout to streaming bytes and cancels an in-flight fetch', async () => {
  const origin = await serve(response => {
    response.writeHead(200, {
      'content-type': 'text/calendar',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.write('BEGIN:VCALENDAR\r\n')
  })
  expect((await adapter(origin, { timeoutMs: 30 }).acquire({ acquiredAt })).kind).toBe(
    'unavailable',
  )
  const received = Promise.withResolvers<void>()
  const streaming = await serve(response => {
    response.writeHead(200, {
      'content-type': 'text/calendar',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.write('BEGIN:VCALENDAR\r\n')
    received.resolve()
  })
  const abort = new AbortController()
  const pending = adapter(streaming).acquire({ acquiredAt }, { signal: abort.signal })
  await received.promise
  abort.abort()
  expect((await pending).kind).toBe('unavailable')
})
it('bounds redirect loops and never sends a request to an untrusted redirect target', async () => {
  let requests = 0
  const origin = await serve(response => {
    requests++
    response.writeHead(302, { location: '/again' })
    response.end()
  })
  expect((await adapter(origin).acquire({ acquiredAt })).kind).toBe('unavailable')
  expect(requests).toBe(4)
})

it('sends the fixed OPM browser User-Agent', async () => {
  let userAgent: string | undefined
  const origin = await serve((response, request) => {
    userAgent = request.headers['user-agent']
    response.writeHead(200, {
      'content-type': 'text/calendar',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.end(ics)
  })
  expect((await adapter(origin).acquire({ acquiredAt })).kind).toBe('acquired')
  expect(userAgent).toBe(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  )
})

it('follows a permitted redirect without changing bytes, method, or request headers', async () => {
  const requests: {
    path: string | undefined
    method: string | undefined
    agent: string | undefined
  }[] = []
  const origin = await serve((response, request) => {
    requests.push({
      path: request.url,
      method: request.method,
      agent: request.headers['user-agent'],
    })
    if (request.url !== '/calendar.ics') {
      response.writeHead(302, { location: '/calendar.ics' })
      response.end()
      return
    }
    response.writeHead(200, {
      'content-type': 'text/calendar',
      'last-modified': 'Thu, 01 Oct 2026 00:00:00 GMT',
    })
    response.end(ics)
  })
  const result = await adapter(origin, { maxRedirects: 1 }).acquire({ acquiredAt })
  expect(result.kind).toBe('acquired')
  if (result.kind !== 'acquired') throw new Error(result.reason)
  expect(Buffer.from(result.material.content).toString()).toBe(ics)
  expect(result.material.transportEvidence?.[0]?.url).toBe(`${origin}/calendar.ics`)
  expect(requests).toEqual([
    {
      path: '/policy-data-oversight/pay-leave/federal-holidays/holidays.ics',
      method: 'GET',
      agent: expect.stringContaining('Chrome/126'),
    },
    { path: '/calendar.ics', method: 'GET', agent: requests[0]?.agent },
  ])
})
