// The local fetch of `createWebAccess` against a `node:http` fixture on 127.0.0.1: media types,
// redirects, the total timeout, the decompressed byte cap, the read-only request and cancellation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { createWebAccess, type WebAccessOptions } from '@omne-harness/tool-host-local/web'
import { startWebFixture, type WebFixture } from './fixture.ts'

let fixture: WebFixture
beforeAll(async () => {
  fixture = await startWebFixture()
})
afterAll(async () => {
  await fixture.close()
})

const never = () => new AbortController().signal
function access(overrides: Partial<WebAccessOptions['fetch']> = {}) {
  return createWebAccess({
    search: {
      endpoint: new URL(fixture.url('/exa')),
      type: 'lite',
      highlightChars: 100,
      timeoutMs: 2000,
    },
    fetch: { maxRedirects: 5, timeoutMs: 5000, maxBodyBytes: 1_000_000, ...overrides },
    exaKey: async () => fail({ kind: 'missing' }),
  })
}
async function page(path: string, overrides: Partial<WebAccessOptions['fetch']> = {}) {
  const answer = await access(overrides).fetch({ url: fixture.url(path) }, never())
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
async function failure(url: string, overrides: Partial<WebAccessOptions['fetch']> = {}) {
  const answer = await access(overrides).fetch({ url }, never())
  if ('ok' in answer) throw new Error(`expected a failure, got ${JSON.stringify(answer.ok)}`)
  return answer.failure
}

describe('Web fetch: media types', () => {
  it('converts HTML to Markdown without scripts, styles, noscript, the title, or unsafe link targets', async () => {
    const result = await page('/html')
    expect(result).toMatchObject({ mediaType: 'text/html', truncated: false })
    expect(result.finalUrl).toBe(fixture.url('/html'))
    const markdown = result.markdown
    expect(markdown).toContain('# Heading')
    expect(markdown).toContain('[a link](https://example.test/next)')
    expect(markdown).toContain('a script link')
    expect(markdown).not.toContain('javascript:')
    expect(markdown).not.toContain('data:')
    expect(markdown).toContain('inline image')
    expect(markdown).toContain('![remote](https://example.test/a.png)')
    expect(markdown).toContain('```js\nconst a = 1\n```')
    expect(markdown).toContain('中文段落。')
    expect(markdown).not.toContain('alert')
    expect(markdown).not.toContain('color:red')
    expect(markdown).not.toContain('Enable JavaScript')
    expect(markdown).not.toContain('Fixture Title')
  })

  it('returns plain text, Markdown and JSON bodies as they are', async () => {
    expect(await page('/plain')).toMatchObject({
      mediaType: 'text/plain',
      markdown: 'plain 文本\nline 2',
    })
    expect(await page('/markdown')).toMatchObject({
      mediaType: 'text/markdown',
      markdown: '# Already\n\n*markdown*',
    })
    expect(await page('/json')).toMatchObject({
      mediaType: 'application/json',
      markdown: '{"a":[1,2],"b":"中"}',
    })
  })

  it('decodes by the charset of Content-Type', async () => {
    expect((await page('/latin1')).markdown).toBe('café')
  })

  it('an HTML tree too deep for the DOM conversion falls back to plain text instead of throwing', async () => {
    const result = await page('/deep')
    expect(result.markdown).toContain('deep')
    expect(result.markdown).not.toContain('<div>')
  })

  it('image and untyped bodies are not-text with the media type', async () => {
    expect(await failure(fixture.url('/png'))).toEqual({ kind: 'not-text', mediaType: 'image/png' })
    expect(await failure(fixture.url('/no-type'))).toEqual({
      kind: 'not-text',
      mediaType: 'application/octet-stream',
    })
  })

  it('a charset the decoder does not know is not-text with the parsed media type, not the raw header', async () => {
    expect(await failure(fixture.url('/unknown-charset'))).toEqual({
      kind: 'not-text',
      mediaType: 'text/plain',
    })
  })

  it('HTTP error statuses are upstream with the status', async () => {
    expect(await failure(fixture.url('/missing'))).toEqual({ kind: 'upstream', status: 404 })
    expect(await failure(fixture.url('/error'))).toEqual({ kind: 'upstream', status: 503 })
  })
})

describe('Web fetch: URLs and redirects', () => {
  it('refuses ftp, credentials in the URL, and malformed URLs as invalid-url without a request', async () => {
    const before = fixture.seen.length
    expect(await failure('ftp://files.test/x')).toEqual({ kind: 'invalid-url' })
    expect(await failure(`http://user:pw@127.0.0.1/${'x'}`)).toEqual({ kind: 'invalid-url' })
    expect(await failure('http://user@127.0.0.1/')).toEqual({ kind: 'invalid-url' })
    expect(await failure('not a url')).toEqual({ kind: 'invalid-url' })
    expect(await failure('')).toEqual({ kind: 'invalid-url' })
    expect(fixture.seen.length).toBe(before)
  })

  it('follows up to maxRedirects hops and reports the final url; one more is redirect-limit', async () => {
    const landed = await page('/redirect/5')
    expect(landed.finalUrl).toBe(fixture.url('/redirect/0'))
    expect(landed.markdown).toBe('landed')
    expect(await failure(fixture.url('/redirect/6'))).toEqual({ kind: 'redirect-limit' })
    expect(await failure(fixture.url('/loop'))).toEqual({ kind: 'redirect-limit' })
  })

  it('a redirect to a non-http target is invalid-url; a 3xx without Location is upstream', async () => {
    expect(await failure(fixture.url('/to-ftp'))).toEqual({ kind: 'invalid-url' })
    expect(await failure(fixture.url('/no-location'))).toEqual({ kind: 'upstream', status: 302 })
  })
})

describe('Web fetch: time and size', () => {
  it('a server that never answers is timeout within the total duration', async () => {
    const started = Date.now()
    expect(await failure(fixture.url('/silent'), { timeoutMs: 700 })).toEqual({ kind: 'timeout' })
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('a body over maxBodyBytes is cut there and marked truncated, counted after decompression', async () => {
    // 64 KiB of two-byte characters; the cap falls inside a character, which is dropped, not replaced.
    const big = await page('/big', { maxBodyBytes: 10_001 })
    expect(big.truncated).toBe(true)
    expect(Buffer.byteLength(big.markdown, 'utf8')).toBe(10_000)
    expect(big.markdown).not.toContain('�')
    // The gzip bomb is a few KiB on the wire and 8 MiB decompressed: the cap applies to the latter.
    const bomb = await page('/bomb', { maxBodyBytes: 4096 })
    expect(bomb.truncated).toBe(true)
    expect(bomb.markdown).toBe('a'.repeat(4096))
  })

  it('a connection refused is a network failure with a diagnostic code', async () => {
    const refused = await failure(`http://127.0.0.1:${String(fixture.closedPort)}/nothing`, {
      timeoutMs: 3000,
    })
    expect(refused).toEqual({ kind: 'network', diagnostic: 'ECONNREFUSED' })
  })
})

describe('Web fetch: read-only and cancellation', () => {
  it('sends GET only, without cookie or authorization headers, and keeps the user agent explicit', async () => {
    const before = fixture.seen.length
    await page('/plain')
    await page('/redirect/2')
    const requests = fixture.seen.slice(before)
    expect(requests.length).toBe(4)
    for (const request of requests) {
      expect(request.method).toBe('GET')
      expect(request.headers['cookie']).toBeUndefined()
      expect(request.headers['authorization']).toBeUndefined()
      expect(request.headers['user-agent']).toBe('omne-harness-web/0.0.0')
      expect(request.body).toBe('')
    }
  })

  it('a cancelled call returns a network failure and sends nothing more', async () => {
    const controller = new AbortController()
    const before = fixture.seen.length
    const pending = access({ timeoutMs: 10_000 }).fetch(
      { url: fixture.url('/dribble') },
      controller.signal,
    )
    await new Promise(resolve => setTimeout(resolve, 300))
    controller.abort(new Error('caller stopped'))
    const answer = await pending
    expect(answer).toEqual({ failure: { kind: 'network', diagnostic: 'cancelled by the caller' } })
    expect(fixture.seen.length - before).toBe(1)
  })
})
