// The Exa client of `createWebAccess` against the Exa double of the local fixture: the request it
// sends, the mapping of a 200 answer, the status mapping, the shape failures, the key source and
// cancellation. No request leaves 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolCredentialFailure } from '@omne-harness/tool-contract/provider'
import type { ToolCredentialCapability } from '@omne-harness/tool-host-local'
import { createWebAccess, type ExaKeySource } from '@omne-harness/tool-host-local/web'
import { startWebFixture, type ExaAnswer, type WebFixture } from './fixture.ts'

let fixture: WebFixture
beforeAll(async () => {
  fixture = await startWebFixture()
})
afterAll(async () => {
  await fixture.close()
})

const never = () => new AbortController().signal
/** A capability that hands the key to the action once and counts the uses. */
function capability(key: string): ToolCredentialCapability<string> & { uses: number } {
  const holder = {
    uses: 0,
    async use<T>(
      action: (secret: string) => Promise<T>,
    ): Promise<Outcome<T, ToolCredentialFailure>> {
      holder.uses += 1
      return succeed(await action(key))
    },
  }
  return holder
}
function access(exaKey: ExaKeySource, timeoutMs = 3000) {
  return createWebAccess({
    search: { endpoint: new URL(fixture.url('/exa')), type: 'lite', highlightChars: 40, timeoutMs },
    fetch: { maxRedirects: 5, timeoutMs: 3000, maxBodyBytes: 1_000_000 },
    exaKey,
  })
}
const withKey = (key = 'test-key-123') => access(async () => succeed(capability(key)))
function answer(status: number, body: unknown, contentType?: string): ExaAnswer {
  return {
    status,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...(contentType === undefined ? {} : { contentType }),
  }
}
const exaRequests = () => fixture.seen.filter(request => request.path === '/exa')

describe('Web search: the Exa request and the mapping of its answer', () => {
  it('posts the lite request with the key header, the count and the highlight length, and maps the results', async () => {
    fixture.exa.answer = answer(200, {
      requestId: 'r1',
      resolvedSearchType: '',
      results: [
        {
          id: 'a',
          title: 'Node.js permissions',
          url: 'https://nodejs.org/api/permissions.html',
          publishedDate: '2026-05-01T00:00:00.000Z',
          highlights: [
            'The Permission Model is a mechanism',
            'for restricting access to resources and more words here',
          ],
          image: 'x',
        },
        { id: 'b', title: '', url: 'https://example.test/no-title', highlights: [] },
        { id: 'c', title: null, url: 'https://example.test/null-title' },
      ],
      costDollars: { total: 0.004 },
    })
    const before = exaRequests().length
    const result = await withKey().search({ query: '  node permissions ', limit: 3 }, never())
    const requests = exaRequests().slice(before)
    expect(requests.length).toBe(1)
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.headers['x-api-key']).toBe('test-key-123')
    expect(request?.headers['content-type']).toBe('application/json')
    expect(JSON.parse(request?.body ?? '')).toEqual({
      query: '  node permissions ',
      type: 'lite',
      numResults: 3,
      contents: { highlights: { maxCharacters: 40 } },
    })
    expect(result).toEqual({
      ok: [
        {
          title: 'Node.js permissions',
          url: 'https://nodejs.org/api/permissions.html',
          publishedAt: '2026-05-01T00:00:00.000Z',
          // Exa exceeds maxCharacters; the client cuts the joined highlights to it.
          excerpt: `${'The Permission Model is a mechanism for '.slice(0, 40)}…`,
        },
        {
          title: 'https://example.test/no-title',
          url: 'https://example.test/no-title',
          excerpt: '',
        },
        {
          title: 'https://example.test/null-title',
          url: 'https://example.test/null-title',
          excerpt: '',
        },
      ],
    })
    if ('ok' in result) {
      expect(result.ok[1]).not.toHaveProperty('publishedAt')
      expect([...(result.ok[0]?.excerpt ?? '')].length).toBe(41)
    }
  })

  it('zero results is a success with an empty array', async () => {
    fixture.exa.answer = answer(200, { requestId: 'r2', results: [] })
    expect(await withKey().search({ query: 'nothing', limit: 5 }, never())).toEqual({ ok: [] })
  })

  it.each([
    [401, { kind: 'denied' }],
    [402, { kind: 'quota-exhausted' }],
    [429, { kind: 'rate-limited' }],
    [400, { kind: 'upstream', status: 400 }],
    [403, { kind: 'upstream', status: 403 }],
    [500, { kind: 'upstream', status: 500 }],
    [503, { kind: 'upstream', status: 503 }],
  ] as const)('HTTP %i is %o', async (status, failure) => {
    fixture.exa.answer = answer(status, { requestId: 'e', error: 'x', tag: 'SOME_TAG' })
    expect(await withKey().search({ query: 'q', limit: 1 }, never())).toEqual({ failure })
  })

  it('an answer of the wrong shape, invalid JSON, or a non-JSON media type is unavailable with a diagnostic', async () => {
    fixture.exa.answer = answer(200, { requestId: 'r', results: [{ title: 'no url' }] })
    expect(await withKey().search({ query: 'q', limit: 1 }, never())).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('shape') },
    })
    fixture.exa.answer = answer(200, '{not json')
    expect(await withKey().search({ query: 'q', limit: 1 }, never())).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('JSON') },
    })
    fixture.exa.answer = answer(200, '<html>login</html>', 'text/html')
    expect(await withKey().search({ query: 'q', limit: 1 }, never())).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('text/html') },
    })
  })
})

describe('Web search: the key source', () => {
  it('a missing key is unconfigured and no request is sent', async () => {
    const before = exaRequests().length
    const source = vi.fn(async () => fail({ kind: 'missing' as const }))
    expect(await access(source).search({ query: 'q', limit: 1 }, never())).toEqual({
      failure: { kind: 'unconfigured' },
    })
    expect(source).toHaveBeenCalledTimes(1)
    expect(exaRequests().length).toBe(before)
  })

  it('maps the other credential failures: denied stays, invalid and unavailable become unavailable', async () => {
    const before = exaRequests().length
    expect(
      await access(async () => fail({ kind: 'denied', action: 'credentials' })).search(
        { query: 'q', limit: 1 },
        never(),
      ),
    ).toEqual({ failure: { kind: 'denied' } })
    expect(
      await access(async () =>
        fail({ kind: 'invalid', field: 'usage', reason: 'mismatch' }),
      ).search({ query: 'q', limit: 1 }, never()),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('usage') },
    })
    expect(
      await access(async () =>
        fail({ kind: 'unavailable', dependency: 'custody', diagnostic: 'offline' }),
      ).search({ query: 'q', limit: 1 }, never()),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('custody') },
    })
    expect(
      await access(async () => {
        throw new Error('source threw')
      }).search({ query: 'q', limit: 1 }, never()),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(exaRequests().length).toBe(before)
  })

  it('uses the capability once per search and a failed use is mapped too', async () => {
    fixture.exa.answer = answer(200, { results: [] })
    const held = capability('k')
    const web = access(async () => succeed(held))
    await web.search({ query: 'q', limit: 1 }, never())
    await web.search({ query: 'q', limit: 1 }, never())
    expect(held.uses).toBe(2)
    const revoked: ToolCredentialCapability<string> = {
      use: async () => fail({ kind: 'missing' }),
    }
    expect(
      await access(async () => succeed(revoked)).search({ query: 'q', limit: 1 }, never()),
    ).toEqual({
      failure: { kind: 'unconfigured' },
    })
  })
})

describe('Web search: time and cancellation', () => {
  it('a cancelled search is a network failure and is not sent again', async () => {
    const before = exaRequests().length
    const controller = new AbortController()
    const silent = createWebAccess({
      search: {
        endpoint: new URL(fixture.url('/silent')),
        type: 'lite',
        highlightChars: 40,
        timeoutMs: 10_000,
      },
      fetch: { maxRedirects: 5, timeoutMs: 3000, maxBodyBytes: 1_000_000 },
      exaKey: async () => succeed(capability('k')),
    })
    const pending = silent.search({ query: 'q', limit: 1 }, controller.signal)
    await new Promise(resolve => setTimeout(resolve, 200))
    controller.abort()
    expect(await pending).toEqual({
      failure: { kind: 'network', diagnostic: 'cancelled by the caller' },
    })
    expect(fixture.seen.filter(request => request.path === '/silent').length).toBe(1)
    expect(exaRequests().length).toBe(before)
  })

  it('a provider that never answers is timeout', async () => {
    const silent = createWebAccess({
      search: {
        endpoint: new URL(fixture.url('/silent')),
        type: 'lite',
        highlightChars: 40,
        timeoutMs: 600,
      },
      fetch: { maxRedirects: 5, timeoutMs: 3000, maxBodyBytes: 1_000_000 },
      exaKey: async () => succeed(capability('k')),
    })
    expect(await silent.search({ query: 'q', limit: 1 }, never())).toEqual({
      failure: { kind: 'timeout' },
    })
  })
})
