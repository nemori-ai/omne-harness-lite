import { afterEach, describe, expect, it } from 'vitest'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { createForwarding, type Forwarding } from '../src/forwarding/app.ts'
import { LOGIN_COOKIE, LOGIN_COOKIE_ATTRIBUTES } from '../src/forwarding/login-cookie.ts'
import type { CallReport } from '@omne-harness/sdk/core'
import { createForwardingRules } from '../src/forwarding/rules.ts'
import { PLUGIN_FILES, pluginFilePath } from '../src/shared/plugin-path.ts'
import {
  PROOF_SENTINEL,
  TENANT_TEXT,
  answered,
  fakeServer,
  issued,
  type FakeServer,
  type Seen,
} from './support/fake-server.ts'

const ORIGIN = 'http://app.desktop'
const opened: Forwarding[] = []
afterEach(() => {
  for (const forwarding of opened.splice(0)) forwarding.close()
})

const succeeded = pluginProtocol.operations['read-file'].outcomes.succeeded
const bytes = (text: string) => new TextEncoder().encode(text)
const LIMITS = {
  maxBytes: 1 << 22,
  maxDepth: 64,
  maxItems: 10_000,
  maxMembers: 1_000,
  maxStringLength: 1 << 22,
  maxNumberLength: 64,
}
function part(text: string, next: number | null, total: number): CallReport {
  const written = succeeded.write({ part: bytes(text), next, bytes: total }, LIMITS)
  if (!written.ok) throw new Error('the part does not fit the rule')
  return { kind: 'answered', outcome: 'succeeded', body: written.value }
}

async function start() {
  const server: FakeServer = fakeServer()
  const lines: string[] = []
  const seen: Seen[] = []
  const forwarding = createForwarding({
    rules: createForwardingRules({
      connect: server.connect,
      contracts: [accessProtocol, identityProtocol, pluginProtocol],
    }),
    readPageFile: async segments =>
      segments.join('/') === 'index.html' ? bytes('<p>page</p>') : undefined,
    log: line => lines.push(line),
  })
  opened.push(forwarding)
  server.answer('identity/v1 issue-login', issued)
  const signed = await forwarding.fetch(
    new Request(`${ORIGIN}/bridge/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ loginIdentifier: 'alice', credential: 'pw' }),
    }),
  )
  const cookie = signed.headers
    .getSetCookie()[0]!
    .split(';')[0]!
    .slice(LOGIN_COOKIE.length + 1)
  const get = (path: string, signedIn = true): Promise<Response> =>
    forwarding.fetch(
      new Request(`${ORIGIN}${path}`, {
        headers: signedIn ? { cookie: `${LOGIN_COOKIE}=${cookie}` } : {},
      }),
    )
  const reads = (answer: (seen: Seen) => CallReport): void =>
    server.answer('plugin/v1 read-file', record => {
      seen.push(record)
      return answer(record)
    })
  return { server, lines, seen, get, reads }
}

describe('the path a page takes a file of a plugin from', () => {
  it('gives the file whole, read in parts with the login of the request, typed by its suffix and not to be sniffed', async () => {
    const t = await start()
    t.reads(record => {
      const { offset } = record.body as { offset: number }
      return offset === 0 ? part('export const a', 14, 18) : part(' = 1', null, 18)
    })
    const answer = await t.get('/bridge/plugins/brand-green/0123456789abcdef/cards/web.js')
    expect(answer.status).toBe(200)
    expect(await answer.text()).toBe('export const a = 1')
    expect(answer.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
    expect(answer.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(answer.headers.get('content-security-policy')).toBeNull()
    expect(t.seen.map(record => record.credentials)).toEqual([
      { proof: PROOF_SENTINEL },
      { proof: PROOF_SENTINEL },
    ])
    expect(t.seen.map(record => record.body)).toMatchObject([
      { name: 'brand-green', version: '0123456789abcdef', path: 'cards/web.js', offset: 0 },
      { name: 'brand-green', version: '0123456789abcdef', path: 'cards/web.js', offset: 14 },
    ])
    expect(t.seen[0]?.body).toMatchObject({ tenant: TENANT_TEXT })
  })

  it.each([
    ['a.css', 'text/css; charset=utf-8'],
    ['data/tokens.json', 'application/json; charset=utf-8'],
    ['art/sea.png', 'image/png'],
    ['art/sea.jpg', 'image/jpeg'],
    ['art/sea.webp', 'image/webp'],
    ['art/sea.avif', 'image/avif'],
    ['art/mark.svg', 'image/svg+xml'],
  ])('types %s as %s', async (path, type) => {
    const t = await start()
    t.reads(() => part('x', null, 1))
    const answer = await t.get(`/bridge/plugins/p/v1/${path}`)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toBe(type)
  })

  it('a vector image is shut in: opened as a page of its own, nothing in it runs or loads', async () => {
    const t = await start()
    t.reads(() => part('<svg/>', null, 6))
    const answer = await t.get('/bridge/plugins/p/v1/art/mark.svg')
    expect(answer.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    )
    expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('what is not a file keeps out of every cache: a refusal is not kept for a year', async () => {
    const t = await start()
    t.reads(() => answered('not-found', { reason: 'file' }))
    const missing = await t.get('/bridge/plugins/p/v1/art/none.png')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    const unsigned = await t.get('/bridge/plugins/p/v1/a.js', false)
    expect(unsigned.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 401 without a login, and asks the server nothing', async () => {
    const t = await start()
    t.reads(() => part('x', null, 1))
    const answer = await t.get('/bridge/plugins/p/v1/a.js', false)
    expect(answer.status).toBe(401)
    expect(t.seen).toEqual([])
  })

  it.each([
    ['a suffix a package may not carry', '/bridge/plugins/p/v1/a.wasm'],
    ['a font', '/bridge/plugins/p/v1/a.woff2'],
    ['no suffix', '/bridge/plugins/p/v1/readme'],
    ['a step up', '/bridge/plugins/p/v1/../../index.html'],
    ['an encoded step up', '/bridge/plugins/p/v1/%2e%2e/secret.js'],
    ['an encoded slash', '/bridge/plugins/p/v1/a%2f..%2fb.js'],
    ['an empty segment', '/bridge/plugins/p/v1//a.js'],
    ['a name that is not the name of a plugin', '/bridge/plugins/P_x/v1/a.js'],
    ['a version with a sign', '/bridge/plugins/p/v!1/a.js'],
    ['no path', '/bridge/plugins/p/v1/'],
    ['no version', '/bridge/plugins/p'],
  ])('answers 404 to %s, and asks the server nothing', async (_name, path) => {
    const t = await start()
    t.reads(() => part('x', null, 1))
    const answer = await t.get(path)
    expect(answer.status).toBe(404)
    expect(t.seen).toEqual([])
  })

  it.each([
    [
      'the server says the plugin or the file is not there',
      () => answered('not-found', { reason: 'file' }),
      404,
    ],
    ['the server refuses the login', () => answered('denied'), 403],
    ['the server cannot tell', () => answered('basis-unavailable'), 503],
  ] as const)('when %s, answers %s with no body of the server', async (_name, answer, status) => {
    const t = await start()
    t.reads(answer)
    const got = await t.get('/bridge/plugins/p/v1/a.js')
    expect(got.status).toBe(status)
    expect(got.headers.get('content-type')).not.toBe('text/javascript; charset=utf-8')
  })

  it('gives a file of any size: there is no most a file may be', async () => {
    const t = await start()
    const size = 4096
    const count = 300
    t.reads(record => {
      const { offset } = record.body as { offset: number }
      const at = offset / size
      return part(String(at % 10).repeat(size), at + 1 < count ? offset + size : null, size * count)
    })
    const answer = await t.get('/bridge/plugins/p/v1/a.js')
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-length')).toBe(String(size * count))
    const text = await answer.text()
    expect(text.length).toBe(size * count)
    expect(text.slice(size * 299, size * 299 + 3)).toBe('999')
    expect(t.seen.length).toBe(count)
  })

  it('passes each part on as it is read: the page has the first before the last is asked for', async () => {
    const t = await start()
    let release = (): void => undefined
    const held = new Promise<void>(resolve => (release = resolve))
    t.server.answer('plugin/v1 read-file', async record => {
      t.seen.push(record)
      const { offset } = record.body as { offset: number }
      if (offset === 0) return part('first,', 6, 11)
      await held
      return part('last.', null, 11)
    })
    const answer = await t.get('/bridge/plugins/p/v1/a.js')
    expect(answer.status).toBe(200)
    const reader = answer.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('first,')
    release()
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toBe('last.')
    expect((await reader.read()).done).toBe(true)
  })

  it.each([
    ['says the next part starts where this one did', () => part('x'.repeat(8), 0, 100)],
    ['says the next part starts past the end', () => part('x'.repeat(8), 500, 100)],
    ['ends before the size it said', () => part('x'.repeat(8), null, 100)],
  ] as const)('a file that %s is broken off, not passed as whole', async (_name, answer) => {
    const t = await start()
    t.reads(answer)
    const got = await t.get('/bridge/plugins/p/v1/a.js')
    expect(got.status).toBe(200)
    await expect(got.text()).rejects.toThrow()
    expect(t.seen.length).toBeLessThan(4)
  })

  it.each([
    ['the server stops answering', () => answered('basis-unavailable')],
    ['the file is no more there', () => answered('not-found', { reason: 'plugin' })],
    ['the file changes its size', () => part('y'.repeat(8), null, 9)],
  ] as const)('when after the first part %s, the body is broken off', async (_name, later) => {
    const t = await start()
    t.reads(record => {
      const { offset } = record.body as { offset: number }
      return offset === 0 ? part('x'.repeat(8), 8, 16) : later()
    })
    const got = await t.get('/bridge/plugins/p/v1/a.js')
    expect(got.status).toBe(200)
    await expect(got.text()).rejects.toThrow()
    expect(t.seen.length).toBe(2)
  })

  it('writes no line that carries the proof of the login, whatever it answers', async () => {
    const t = await start()
    t.reads(() => {
      throw new Error(`broken with ${PROOF_SENTINEL}`)
    })
    const answer = await t.get('/bridge/plugins/p/v1/a.js')
    expect(answer.status).toBe(503)
    expect(t.lines.join('\n')).not.toContain(PROOF_SENTINEL)
  })

  it('is under the bridge only: the same path outside it is not this route, and carries no login', async () => {
    const t = await start()
    t.reads(() => part('x', null, 1))
    const answer = await t.get('/plugins/p/v1/a.js')
    expect(answer.status).toBe(404)
    expect(t.seen).toEqual([])
  })

  it('lies where the login cookie travels: a path outside it would never see the login in the application', () => {
    expect(PLUGIN_FILES.startsWith(LOGIN_COOKIE_ATTRIBUTES.path)).toBe(true)
    expect(pluginFilePath('p', 'v1', 'cards/web.js')).toBe('/bridge/plugins/p/v1/cards/web.js')
  })

  it('leaves the files of the page as they were', async () => {
    const t = await start()
    const page = await t.get('/index.html')
    expect(await page.text()).toBe('<p>page</p>')
  })
})
