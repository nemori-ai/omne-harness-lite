export const COOKIE_JAR_ORIGIN = 'https://app.desktop'

export const MAX_NAME_VALUE_BYTES = 4096
export const MAX_ATTRIBUTE_VALUE_BYTES = 1024
export const MAX_AGE_S = 400 * 24 * 60 * 60
export const MAX_SET_COOKIES_PER_RESPONSE = 50

export type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict'

export interface JarCookie {
  name: string
  value: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: SameSite
  expirationDate?: number
}

export type CookieChange =
  | { kind: 'set'; cookie: JarCookie }
  | { kind: 'delete'; name: string; path: string }

export type ParsedSetCookie = { ok: true; change: CookieChange } | { ok: false; reason: string }

export interface ParseContext {
  requestPath: string
  hosts: readonly string[]
  now: number
}

// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/
const encoder = new TextEncoder()
const byteLength = (s: string) => encoder.encode(s).length

type Attributes = {
  expiresAt: number | undefined
  maxAge: number | undefined
  domain: string | undefined
  path: string | undefined
  secure: boolean
  httpOnly: boolean
  sameSite: SameSite
}

const SAME_SITE: Readonly<Record<string, SameSite>> = {
  strict: 'strict',
  lax: 'lax',
  none: 'no_restriction',
}

const ATTRIBUTE: Readonly<Record<string, (found: Attributes, raw: string) => void>> = {
  expires(found, raw) {
    found.expiresAt = parseCookieDate(raw) ?? found.expiresAt
  },
  'max-age'(found, raw) {
    if (/^-?\d+$/.test(raw)) found.maxAge = Number(raw)
  },
  domain(found, raw) {
    if (raw !== '') found.domain = (raw.startsWith('.') ? raw.slice(1) : raw).toLowerCase()
  },
  path(found, raw) {
    found.path = raw.startsWith('/') ? raw : undefined
  },
  secure(found) {
    found.secure = true
  },
  httponly(found) {
    found.httpOnly = true
  },
  samesite(found, raw) {
    found.sameSite = SAME_SITE[raw.toLowerCase()] ?? 'unspecified'
  },
}

function readAttributes(text: string | undefined): Attributes {
  const found: Attributes = {
    expiresAt: undefined,
    maxAge: undefined,
    domain: undefined,
    path: undefined,
    secure: false,
    httpOnly: false,
    sameSite: 'unspecified',
  }
  for (const attribute of text === undefined ? [] : text.split(';')) {
    const at = attribute.indexOf('=')
    const key = trimWsp(at < 0 ? attribute : attribute.slice(0, at)).toLowerCase()
    const raw = at < 0 ? '' : trimWsp(attribute.slice(at + 1))
    if (byteLength(raw) > MAX_ATTRIBUTE_VALUE_BYTES) continue
    if (Object.hasOwn(ATTRIBUTE, key)) ATTRIBUTE[key]!(found, raw)
  }
  return found
}

/** The name and value of a `Set-Cookie`, or why a browser would ignore it. */
function readNameValue(nameValue: string): { name: string; value: string } | string {
  const equals = nameValue.indexOf('=')
  if (equals < 0) return 'no name'
  const name = trimWsp(nameValue.slice(0, equals))
  const value = trimWsp(nameValue.slice(equals + 1))
  if (name === '') return 'no name'
  if (byteLength(name) + byteLength(value) > MAX_NAME_VALUE_BYTES) return 'too large'
  return { name, value }
}

type PrefixRule = readonly [prefix: string, broken: (found: Attributes) => boolean, reason: string]

const PREFIX_RULES: readonly PrefixRule[] = [
  ['__secure-', found => !found.secure, '__Secure- prefix without Secure'],
  [
    '__host-',
    found => !found.secure || found.domain !== undefined || found.path !== '/',
    '__Host- prefix rules',
  ],
  ['__http-', found => !found.secure || !found.httpOnly, '__Http- prefix rules'],
  ['__host-http-', found => !found.httpOnly, '__Host-Http- prefix rules'],
]

/** Why a cookie with these attributes is refused, or `undefined`. */
function refusal(name: string, found: Attributes, hosts: readonly string[]): string | undefined {
  const { domain } = found
  if (domain !== undefined && !hosts.some(host => host.toLowerCase() === domain))
    return 'foreign domain'
  const lower = name.toLowerCase()
  const broken = PREFIX_RULES.find(([prefix, breaks]) => lower.startsWith(prefix) && breaks(found))
  if (broken !== undefined) return broken[2]
  if (found.sameSite === 'no_restriction' && !found.secure) return 'SameSite=None without Secure'
  return undefined
}

/** When the cookie expires, in milliseconds; `Max-Age` wins over `Expires`. */
function expiryOf({ maxAge, expiresAt }: Attributes, now: number): number | undefined {
  if (maxAge !== undefined)
    return maxAge <= 0 ? -Infinity : now + Math.min(maxAge, MAX_AGE_S) * 1000
  if (expiresAt !== undefined) return Math.min(expiresAt, now + MAX_AGE_S * 1000)
  return undefined
}

export function parseSetCookie(
  header: string,
  { requestPath, hosts, now }: ParseContext,
): ParsedSetCookie {
  if (CONTROL.test(header)) return { ok: false, reason: 'control character' }
  const semicolon = header.indexOf(';')
  const pair = readNameValue(semicolon < 0 ? header : header.slice(0, semicolon))
  if (typeof pair === 'string') return { ok: false, reason: pair }
  const { name, value } = pair
  const found = readAttributes(semicolon < 0 ? undefined : header.slice(semicolon + 1))
  const refused = refusal(name, found, hosts)
  if (refused !== undefined) return { ok: false, reason: refused }

  const path = found.path ?? defaultPath(requestPath)
  const expiry = expiryOf(found, now)
  if (expiry !== undefined && expiry <= now)
    return { ok: true, change: { kind: 'delete', name, path } }
  const { secure, httpOnly, sameSite } = found
  const cookie: JarCookie = { name, value, path, secure, httpOnly, sameSite }
  if (expiry !== undefined) cookie.expirationDate = Math.floor(expiry / 1000)
  return { ok: true, change: { kind: 'set', cookie } }
}

export function defaultPath(requestPath: string): string {
  if (!requestPath.startsWith('/')) return '/'
  const last = requestPath.lastIndexOf('/')
  return last <= 0 ? '/' : requestPath.slice(0, last)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

type DateParts = {
  time?: [number, number, number]
  day?: number
  month?: number
  year?: number
}

const TIME = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\D.*)?$/
const DAY = /^(\d{1,2})(?:\D.*)?$/
const YEAR = /^(\d{2,4})(?:\D.*)?$/

/** Each token fills the first part it matches that is still empty, in this order. */
const DATE_TOKENS: readonly ((parts: DateParts, token: string) => boolean)[] = [
  (parts, token) => {
    const m = parts.time === undefined ? TIME.exec(token) : null
    if (m !== null) parts.time = [Number(m[1]), Number(m[2]), Number(m[3])]
    return m !== null
  },
  (parts, token) => {
    const m = parts.day === undefined ? DAY.exec(token) : null
    if (m !== null) parts.day = Number(m[1])
    return m !== null
  },
  (parts, token) => {
    const at = parts.month === undefined ? MONTHS.indexOf(token.slice(0, 3).toLowerCase()) : -1
    if (at >= 0) parts.month = at
    return at >= 0
  },
  (parts, token) => {
    const m = parts.year === undefined ? YEAR.exec(token) : null
    if (m !== null) parts.year = Number(m[1])
    return m !== null
  },
]

function fullYear(year: number): number {
  if (year >= 70 && year <= 99) return year + 1900
  return year >= 0 && year <= 69 ? year + 2000 : year
}

const inRange = (day: number, year: number, [hour, minute, second]: [number, number, number]) =>
  day >= 1 && day <= 31 && year >= 1601 && hour <= 23 && minute <= 59 && second <= 59

export function parseCookieDate(value: string): number | undefined {
  const parts: DateParts = {}
  // oxlint-disable-next-line no-control-regex -- HTAB is one of the delimiters
  for (const token of value.split(/[\u0009 -/;-@[-`{-~]+/))
    if (token !== '') DATE_TOKENS.some(fill => fill(parts, token))
  const { time, day, month } = parts
  if (time === undefined || day === undefined || month === undefined || parts.year === undefined)
    return undefined
  const year = fullYear(parts.year)
  if (!inRange(day, year, time)) return undefined
  const ms = Date.UTC(year, month, day, ...time)
  return new Date(ms).getUTCDate() === day ? ms : undefined
}

export function serializeCookieHeader(
  cookies: readonly { name: string; value: string; path?: string }[],
): string {
  return cookies
    .map((cookie, index) => ({ cookie, index }))
    .toSorted(
      (a, b) => (b.cookie.path ?? '/').length - (a.cookie.path ?? '/').length || a.index - b.index,
    )
    .map(({ cookie }) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

function trimWsp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '')
}

export interface CookieStore {
  get(filter: { url: string }): Promise<{ name: string; value: string; path?: string }[]>
  set(details: {
    url: string
    name: string
    value: string
    path: string
    secure: boolean
    httpOnly: boolean
    sameSite: SameSite
    expirationDate?: number
  }): Promise<void>
  flushStore(): Promise<void>
}

export interface CookieJar {
  cookieHeader(path: string): Promise<string | undefined>
  storeResponseCookies(headers: Headers, requestPath: string): Promise<void>
}

export interface CookieJarOptions {
  store: CookieStore
  hosts: readonly string[]
  log: {
    debug(data: Record<string, unknown>, msg: string): void
    warn(data: Record<string, unknown>, msg: string): void
  }
  jarOrigin?: string
  now?: () => number
}

export function createCookieJar({
  store,
  hosts,
  log,
  jarOrigin = COOKIE_JAR_ORIGIN,
  now = Date.now,
}: CookieJarOptions): CookieJar {
  return {
    async cookieHeader(path) {
      try {
        const cookies = await store.get({ url: jarOrigin + path })
        return cookies.length === 0 ? undefined : serializeCookieHeader(cookies)
      } catch (err) {
        log.warn({ err }, 'reading cookies failed')
        return undefined
      }
    },
    async storeResponseCookies(headers, requestPath) {
      const values = headers.getSetCookie()
      if (values.length === 0) return
      if (values.length > MAX_SET_COOKIES_PER_RESPONSE) {
        log.debug({ count: values.length }, 'too many Set-Cookie headers; extra ones ignored')
      }
      let changed = false
      for (const value of values.slice(0, MAX_SET_COOKIES_PER_RESPONSE)) {
        const parsed = parseSetCookie(value, { requestPath, hosts, now: now() })
        if (!parsed.ok) {
          log.debug({ reason: parsed.reason }, 'Set-Cookie ignored')
          continue
        }
        const { change } = parsed
        const details =
          change.kind === 'set'
            ? { ...change.cookie, httpOnly: true }
            : // Expired: Chromium removes the stored cookie with this name and path, and stores nothing.
              {
                name: change.name,
                value: '',
                path: change.path,
                secure: true,
                httpOnly: true,
                sameSite: 'unspecified' as const,
                expirationDate: 1,
              }
        try {
          await store.set({ url: jarOrigin + details.path, ...details })
          changed = true
        } catch (err) {
          log.warn({ err, name: details.name }, 'storing a cookie failed')
        }
      }
      if (!changed) return
      try {
        await store.flushStore()
      } catch (err) {
        log.warn({ err }, 'flushing cookies failed')
      }
    },
  }
}

export const QUIT_FLUSH_TIMEOUT_MS = 2_000

export async function flushForQuit(
  store: Pick<CookieStore, 'flushStore'>,
  log: CookieJarOptions['log'],
  timeoutMs = QUIT_FLUSH_TIMEOUT_MS,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const flushed = store.flushStore().then(
    () => 'flushed' as const,
    (err: unknown) => {
      log.warn({ err }, 'flushing cookies before quit failed')
      return 'failed' as const
    },
  )
  try {
    if ((await Promise.race([flushed, timeout])) === 'timeout') {
      log.warn({ timeoutMs }, 'flushing cookies before quit timed out; quitting anyway')
    }
  } finally {
    clearTimeout(timer)
  }
}
