import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COOKIE_JAR_ORIGIN,
  type CookieStore,
  createCookieJar,
  defaultPath,
  flushForQuit,
  MAX_AGE_S,
  MAX_SET_COOKIES_PER_RESPONSE,
  parseCookieDate,
  parseSetCookie,
  QUIT_FLUSH_TIMEOUT_MS,
  serializeCookieHeader,
} from '../src/main/cookie-jar.ts'
import { fakeCookieStore as fakeStore } from './support/cookie-store.ts'

const now = Date.UTC(2026, 9, 28, 12, 0, 0)
const context = { requestPath: '/account/login', hosts: ['app.desktop'], now }
const parse = (header: string, overrides: Partial<typeof context> = {}) =>
  parseSetCookie(header, { ...context, ...overrides })

function set(header: string, overrides: Partial<typeof context> = {}) {
  const parsed = parse(header, overrides)
  if (!parsed.ok || parsed.change.kind !== 'set')
    throw new Error(`expected a set: ${JSON.stringify(parsed)}`)
  return parsed.change.cookie
}

function rejected(header: string, overrides: Partial<typeof context> = {}): string {
  const parsed = parse(header, overrides)
  if (parsed.ok) throw new Error(`expected a rejection: ${JSON.stringify(parsed)}`)
  return parsed.reason
}

describe('parseSetCookie', () => {
  it('parses name, value and attributes, case-insensitively and with whitespace trimmed', () => {
    expect(
      set(' sid = abc ; path=/ ; SECURE; HttpOnly; SameSite=Strict; Partitioned; Priority=High'),
    ).toEqual({
      name: 'sid',
      value: 'abc',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
    })
    expect(set('a=1').sameSite).toBe('unspecified')
    expect(set('a=1; SameSite=lax').sameSite).toBe('lax')
    expect(set('a=1; SameSite=None; Secure').sameSite).toBe('no_restriction')
    expect(set('a=1; SameSite=bogus').sameSite).toBe('unspecified')
  })

  it("keeps the value as is: quotes, '=' and an empty value", () => {
    expect(set('a="quoted"').value).toBe('"quoted"')
    expect(set('a=b=c').value).toBe('b=c')
    expect(set('a=').value).toBe('')
  })

  it('rejects nameless cookies, control characters and oversized name-value pairs', () => {
    expect(rejected('justavalue')).toBe('no name')
    expect(rejected('=value')).toBe('no name')
    expect(rejected('a=b\u0001c')).toBe('control character')
    expect(rejected('a=b\nSet-Cookie: c=d')).toBe('control character')
    expect(set('a=b\tc').value).toBe('b\tc')
    expect(set(`a=${'x'.repeat(4095)}`).value).toHaveLength(4095)
    expect(rejected(`a=${'x'.repeat(4096)}`)).toBe('too large')
    // Bytes, not UTF-16 units.
    expect(rejected(`a=${'\u4e2d'.repeat(1400)}`)).toBe('too large')
  })

  it('ignores attribute values over 1024 bytes', () => {
    expect(set(`a=1; Path=/${'p'.repeat(1023)}`).path).toBe(`/${'p'.repeat(1023)}`)
    expect(set(`a=1; Path=/${'p'.repeat(1024)}`).path).toBe('/account')
  })

  describe('Path', () => {
    it("defaults to the request path's directory", () => {
      expect(set('a=1').path).toBe('/account')
      expect(set('a=1', { requestPath: '/' }).path).toBe('/')
      expect(set('a=1', { requestPath: '/login' }).path).toBe('/')
      expect(set('a=1', { requestPath: '/a/b/' }).path).toBe('/a/b')
    })

    it("uses the attribute when it starts with '/', the default otherwise", () => {
      expect(set('a=1; Path=/api').path).toBe('/api')
      expect(set('a=1; Path=').path).toBe('/account')
      expect(set('a=1; Path=relative').path).toBe('/account')
      // The last Path wins, even when it is invalid.
      expect(set('a=1; Path=/x; Path=y').path).toBe('/account')
    })

    it('computes the default path per RFC 6265bis 5.1.4', () => {
      expect(defaultPath('')).toBe('/')
      expect(defaultPath('no-slash')).toBe('/')
      expect(defaultPath('/')).toBe('/')
      expect(defaultPath('/a')).toBe('/')
      expect(defaultPath('/a/b')).toBe('/a')
      expect(defaultPath('/a/b/c')).toBe('/a/b')
    })
  })

  describe('Domain', () => {
    it('accepts the internal host (with or without a leading dot, any case) as a host-only cookie', () => {
      expect(set('a=1; Domain=app.desktop')).not.toHaveProperty('domain')
      expect(set('a=1; Domain=.APP.desktop').name).toBe('a')
      expect(set('a=1; Domain=', {}).name).toBe('a')
      expect(set('a=1; Domain=localhost', { hosts: ['app.desktop', 'localhost'] }).name).toBe('a')
    })

    it('rejects any other domain, parents and public suffixes included', () => {
      for (const domain of ['example.com', 'desktop', '.desktop', 'sub.app.desktop', 'localhost']) {
        expect(rejected(`a=1; Domain=${domain}`)).toBe('foreign domain')
      }
    })
  })

  describe('Expires and Max-Age', () => {
    it('makes a session cookie without either, or with an unparsable one', () => {
      expect(set('a=1').expirationDate).toBeUndefined()
      expect(set('a=1; Expires=tomorrow').expirationDate).toBeUndefined()
      expect(set('a=1; Max-Age=soon').expirationDate).toBeUndefined()
      expect(set('a=1; Max-Age=1.5').expirationDate).toBeUndefined()
    })

    it('sets the expiry from Max-Age, which wins over Expires in any order', () => {
      expect(set('a=1; Max-Age=3600').expirationDate).toBe(now / 1000 + 3600)
      expect(set('a=1; Max-Age=60; Expires=Wed, 28 Oct 2026 13:00:00 GMT').expirationDate).toBe(
        now / 1000 + 60,
      )
      expect(set('a=1; Expires=Wed, 28 Oct 2026 13:00:00 GMT; Max-Age=60').expirationDate).toBe(
        now / 1000 + 60,
      )
      expect(set('a=1; Expires=Wed, 28 Oct 2026 13:00:00 GMT').expirationDate).toBe(
        now / 1000 + 3600,
      )
    })

    it('caps the lifetime at 400 days', () => {
      expect(set('a=1; Max-Age=999999999').expirationDate).toBe(now / 1000 + MAX_AGE_S)
      expect(set('a=1; Expires=Fri, 31 Dec 9999 23:59:59 GMT').expirationDate).toBe(
        now / 1000 + MAX_AGE_S,
      )
    })

    it('turns Max-Age ≤ 0 and a past Expires into a deletion of that name and path', () => {
      const deletion = { ok: true, change: { kind: 'delete', name: 'a', path: '/' } }
      expect(parse('a=; Path=/; Max-Age=0')).toEqual(deletion)
      expect(parse('a=x; Path=/; Max-Age=-1')).toEqual(deletion)
      expect(parse('a=x; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT')).toEqual(deletion)
      expect(parse('a=x; Path=/; Expires=Wed, 28 Oct 2026 12:00:00 GMT')).toEqual(deletion)
      expect(parse('a=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT')).toEqual({
        ok: true,
        change: { kind: 'delete', name: 'a', path: '/account' },
      })
      // A past Expires does not delete when Max-Age says otherwise.
      expect(set('a=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=10').expirationDate).toBe(
        now / 1000 + 10,
      )
    })
  })

  describe('Secure, HttpOnly and SameSite', () => {
    it('accepts Secure: app:// is a secure context and the jar URL is https', () => {
      expect(set('a=1; Secure').secure).toBe(true)
    })

    it('rejects SameSite=None without Secure, as browsers do', () => {
      expect(rejected('a=1; SameSite=None')).toBe('SameSite=None without Secure')
    })
  })

  describe('name prefixes (case-insensitive)', () => {
    it('requires Secure for __Secure-', () => {
      expect(set('__Secure-a=1; Secure').name).toBe('__Secure-a')
      expect(rejected('__Secure-a=1')).toMatch(/__Secure-/)
      expect(rejected('__secure-a=1')).toMatch(/__Secure-/)
    })

    it('requires Secure, Path=/ and no Domain for __Host-', () => {
      expect(set('__Host-a=1; Secure; Path=/').path).toBe('/')
      // An explicit Path=/ is required, even where the default path would be "/".
      expect(rejected('__Host-a=1; Secure', { requestPath: '/login' })).toMatch(/__Host-/)
      expect(rejected('__Host-a=1; Secure')).toMatch(/__Host-/)
      expect(rejected('__Host-a=1; Secure; Path=')).toMatch(/__Host-/)
      expect(rejected('__Host-a=1; Path=/')).toMatch(/__Host-/)
      expect(rejected('__HOST-a=1; Secure; Path=/; Domain=app.desktop')).toMatch(/__Host-/)
    })

    it('requires Secure and HttpOnly for __Http- and __Host-Http-', () => {
      expect(set('__Http-a=1; Secure; HttpOnly').name).toBe('__Http-a')
      expect(rejected('__Http-a=1; Secure')).toMatch(/__Http-/)
      expect(rejected('__Http-a=1; HttpOnly')).toMatch(/__Http-/)
      expect(set('__Host-Http-a=1; Secure; HttpOnly; Path=/').name).toBe('__Host-Http-a')
      expect(rejected('__Host-Http-a=1; Secure; Path=/')).toMatch(/__Host-Http-/)
      expect(rejected('__Host-Http-a=1; Secure; HttpOnly; Path=/x')).toMatch(/__Host-/)
    })
  })
})

describe('parseCookieDate', () => {
  it('parses the common formats', () => {
    const expected = Date.UTC(2026, 9, 28, 13, 5, 9)
    expect(parseCookieDate('Wed, 28 Oct 2026 13:05:09 GMT')).toBe(expected)
    expect(parseCookieDate('Wednesday, 28-Oct-26 13:05:09 GMT')).toBe(expected)
    expect(parseCookieDate('Wed Oct 28 13:05:09 2026')).toBe(expected)
    expect(parseCookieDate('28 october 2026 13:5:9')).toBe(expected)
  })

  it('maps two-digit years per RFC 6265bis', () => {
    expect(parseCookieDate('01 Jan 70 00:00:00')).toBe(Date.UTC(1970, 0, 1))
    expect(parseCookieDate('01 Jan 69 00:00:00')).toBe(Date.UTC(2069, 0, 1))
  })

  it('rejects missing parts, out-of-range values and dates that do not exist', () => {
    for (const value of [
      '',
      'Wed, 28 Oct 2026',
      '28 Oct 2026 24:00:00',
      '28 Oct 2026 12:60:00',
      '32 Oct 2026 12:00:00',
      '30 Feb 2026 12:00:00',
      '28 Oct 1600 12:00:00',
      '28 Foo 2026 12:00:00',
    ]) {
      expect([value, parseCookieDate(value)]).toEqual([value, undefined])
    }
  })
})

describe('serializeCookieHeader', () => {
  it('joins name=value pairs, longer paths first, store order otherwise', () => {
    expect(serializeCookieHeader([])).toBe('')
    expect(
      serializeCookieHeader([
        { name: 'a', value: '1', path: '/' },
        { name: 'b', value: '2', path: '/x/y' },
        { name: 'c', value: '3', path: '/' },
        { name: 'd', value: '4', path: '/x' },
      ]),
    ).toBe('b=2; d=4; a=1; c=3')
  })
})

type LogFn = (data: Record<string, unknown>, msg: string) => void
const logger = () => ({ debug: vi.fn<LogFn>(), warn: vi.fn<LogFn>() })
const silent = logger()

function response(...setCookies: string[]): Headers {
  const headers = new Headers()
  for (const value of setCookies) headers.append('set-cookie', value)
  return headers
}

describe('createCookieJar', () => {
  it('stores Set-Cookie host-only under the jar origin and sends it back on matching paths', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })

    await jar.storeResponseCookies(
      response('sid=1; Path=/; HttpOnly', 'scoped=2; Path=/api'),
      '/login',
    )
    expect(store.set).toHaveBeenCalledWith({
      url: `${COOKIE_JAR_ORIGIN}/`,
      name: 'sid',
      value: '1',
      path: '/',
      secure: false,
      httpOnly: true,
      sameSite: 'unspecified',
    })
    expect(store.set).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${COOKIE_JAR_ORIGIN}/api`, path: '/api' }),
    )
    expect(store.set.mock.calls.every(([details]) => !('domain' in details))).toBe(true)

    expect(await jar.cookieHeader('/')).toBe('sid=1')
    expect(await jar.cookieHeader('/api/users')).toBe('scoped=2; sid=1')
    expect(await jar.cookieHeader('/apiary')).toBe('sid=1')
    expect(store.get).toHaveBeenCalledWith({ url: `${COOKIE_JAR_ORIGIN}/apiary` })
  })

  it('answers no header when no cookie applies', async () => {
    const jar = createCookieJar({ store: fakeStore(), hosts: ['app.desktop'], log: silent })
    expect(await jar.cookieHeader('/')).toBeUndefined()
  })

  it('deletes with an expired set of the same name and path, and flushes after every change', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(response('sid=1; Path=/; HttpOnly'), '/')
    expect(store.flushStore).toHaveBeenCalledTimes(1)

    await jar.storeResponseCookies(response('keep=1; Path=/; Max-Age=60'), '/')
    expect(store.flushStore).toHaveBeenCalledTimes(2)

    await jar.storeResponseCookies(response('sid=; Path=/; Max-Age=0'), '/')
    expect(store.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: `${COOKIE_JAR_ORIGIN}/`,
        name: 'sid',
        path: '/',
        httpOnly: true,
        expirationDate: 1,
      }),
    )
    expect(store.flushStore).toHaveBeenCalledTimes(3)
    expect(await jar.cookieHeader('/')).toBe('keep=1')
  })

  it('flushes when a session cookie replaces a persistent one, so the old value is gone from the disk', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(response('sid=old; Path=/; Max-Age=600'), '/')
    expect(store.disk.map(c => `${c.name}=${c.value}`)).toEqual(['sid=old'])

    await jar.storeResponseCookies(response('sid=new; Path=/'), '/')
    expect(await jar.cookieHeader('/')).toBe('sid=new')
    // What a relaunch after a hard kill would load: no persistent sid any more.
    expect(store.disk).toEqual([])
  })

  it('does not flush when nothing was stored', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(response('bad=1; Domain=evil.example'), '/')
    expect(store.flushStore).not.toHaveBeenCalled()
  })

  it('stores every cookie HttpOnly, so a non-HttpOnly Set-Cookie replaces an HttpOnly one as in a browser', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(response('sid=1; Path=/; HttpOnly'), '/')
    await jar.storeResponseCookies(response('sid=2; Path=/'), '/')
    expect(store.set.mock.calls.every(([details]) => details.httpOnly)).toBe(true)
    expect(await jar.cookieHeader('/')).toBe('sid=2')
  })

  it('applies cookies in header order, so a later one with the same name and path wins', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(response('a=1; Path=/', 'a=2; Path=/'), '/')
    expect(await jar.cookieHeader('/')).toBe('a=2')
  })

  it('ignores malformed and foreign cookies with a debug log that never carries the value', async () => {
    const store = fakeStore()
    const log = logger()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log })
    await jar.storeResponseCookies(
      response('secret-token-value', 'sid=secret-token-value; Domain=evil.example', 'ok=1'),
      '/',
    )
    expect(store.cookies.map(c => c.name)).toEqual(['ok'])
    expect(log.debug).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(log.debug.mock.calls)).not.toContain('secret-token-value')
  })

  it('handles at most MAX_SET_COOKIES_PER_RESPONSE cookies per response', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    const many = Array.from(
      { length: MAX_SET_COOKIES_PER_RESPONSE + 5 },
      (_, i) => `c${i}=1; Path=/`,
    )
    await jar.storeResponseCookies(response(...many), '/')
    expect(store.cookies).toHaveLength(MAX_SET_COOKIES_PER_RESPONSE)
  })

  it('never rejects: store failures are logged and the request goes on without cookies', async () => {
    const log = logger()
    const failing: CookieStore = {
      get: async () => Promise.reject(new Error('store gone')),
      set: async () => Promise.reject(new Error('store gone')),
      flushStore: async () => Promise.reject(new Error('store gone')),
    }
    const jar = createCookieJar({ store: failing, hosts: ['app.desktop'], log })
    expect(await jar.cookieHeader('/')).toBeUndefined()
    await expect(
      jar.storeResponseCookies(response('a=1; Max-Age=60'), '/'),
    ).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a' }),
      'storing a cookie failed',
    )
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('a=1')
  })

  it('does nothing for a response without Set-Cookie', async () => {
    const store = fakeStore()
    const jar = createCookieJar({ store, hosts: ['app.desktop'], log: silent })
    await jar.storeResponseCookies(new Headers({ 'content-type': 'text/html' }), '/')
    expect(store.set).not.toHaveBeenCalled()
    expect(store.flushStore).not.toHaveBeenCalled()
  })
})

describe('flushForQuit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves once the store has flushed', async () => {
    const store = fakeStore()
    const log = logger()
    await flushForQuit(store, log)
    expect(store.flushStore).toHaveBeenCalledTimes(1)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('gives up after the timeout when the store never answers, with a warning', async () => {
    vi.useFakeTimers()
    const log = logger()
    let settled = false
    const done = flushForQuit(
      { flushStore: () => new Promise<void>(() => {}) },
      log,
      QUIT_FLUSH_TIMEOUT_MS,
    ).then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(QUIT_FLUSH_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(log.warn).toHaveBeenCalledWith(
      { timeoutMs: QUIT_FLUSH_TIMEOUT_MS },
      expect.stringContaining('timed out'),
    )
  })

  it('never rejects when the flush fails', async () => {
    const log = logger()
    await expect(
      flushForQuit({ flushStore: async () => Promise.reject(new Error('gone')) }, log),
    ).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
  })
})
