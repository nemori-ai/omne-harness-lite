// History paging and the signed continuation tokens (SPEC SL10, RD-CURSOR, SQL r2 section 17).
import { describe, expect, it } from 'vitest'
import type { EntryId } from '@omne-harness/session-contract'
import { app, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

type Page = {
  entries: { id: string }[]
  next: string | null
  exhausted: boolean
  scannedThrough: string
}
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): Record<string, unknown> => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: Record<string, unknown> }).failure
}

async function seeded(): Promise<App> {
  const a = await app()
  ok(await a.create(TENANT_A))
  for (const name of ['one', 'two', 'three']) ok(await a.accept(TENANT_A, 'session-1', name))
  return a
}
const begin = (
  a: App,
  pageBytes: number,
  direction: 'forward' | 'backward' = 'forward',
  tenant = TENANT_A,
) =>
  a.port.history.begin({
    ...a.access(tenant),
    kinds: [],
    from: null,
    direction,
    pageBytes,
  })
const next = (a: App, cursor: string, tenant = TENANT_A, session = 'session-1') =>
  a.port.history.next({ ...a.access(tenant, session), cursor })

async function walk(a: App, direction: 'forward' | 'backward'): Promise<string[]> {
  const ids: string[] = []
  let page = ok<Page>(await begin(a, 1, direction))
  for (let guard = 0; guard < 100; guard += 1) {
    ids.push(...page.entries.map(entry => entry.id))
    if (page.next === null) return ids
    page = ok<Page>(await next(a, page.next))
  }
  throw new Error('the walk did not end')
}

describe('history paging', () => {
  it('one page with room returns every entry in order and is exhausted', async () => {
    const a = await seeded()
    const page = ok<Page>(await begin(a, 1_000_000))
    expect(page.entries.map(entry => entry.id)).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8'].slice(0, page.entries.length),
    )
    expect(page.entries.length).toBeGreaterThanOrEqual(4)
    expect(page.exhausted).toBe(true)
    expect(page.next).toBeNull()
  })

  it('a byte limit of one entry pages forward through every entry exactly once', async () => {
    const a = await seeded()
    const all = ok<Page>(await begin(a, 1_000_000)).entries.map(entry => entry.id)
    const first = ok<Page>(await begin(a, 1))
    expect(first.entries.length).toBe(1)
    expect(first.exhausted).toBe(false)
    expect(first.next).not.toBeNull()
    expect(await walk(a, 'forward')).toEqual(all)
  })

  it('backward paging returns the same entries in reverse', async () => {
    const a = await seeded()
    const all = ok<Page>(await begin(a, 1_000_000)).entries.map(entry => entry.id)
    expect(await walk(a, 'backward')).toEqual([...all].reverse())
  })

  it('entries committed after the first page stay outside the walk (the upper bound is fixed)', async () => {
    const a = await seeded()
    const all = ok<Page>(await begin(a, 1_000_000)).entries.map(entry => entry.id)
    const first = ok<Page>(await begin(a, 1))
    ok(await a.accept(TENANT_A, 'session-1', 'late'))
    const rest: string[] = first.entries.map(entry => entry.id)
    let page = first
    while (page.next !== null) {
      page = ok<Page>(await next(a, page.next))
      rest.push(...page.entries.map(entry => entry.id))
    }
    expect(rest).toEqual(all)
  })

  it('since continues after a known entry and refuses an entry the session does not have', async () => {
    const a = await seeded()
    const all = ok<Page>(await begin(a, 1_000_000)).entries.map(entry => entry.id)
    const after = await a.port.history.since({
      ...a.access(TENANT_A),
      after: all[1] as EntryId,
      kinds: [],
      pageBytes: 1_000_000,
    })
    expect(ok<Page>(after).entries.map(entry => entry.id)).toEqual(all.slice(2))
    const missing = await a.port.history.since({
      ...a.access(TENANT_A),
      after: '999' as EntryId,
      kinds: [],
      pageBytes: 1_000_000,
    })
    expect(failureOf(missing)).toMatchObject({ kind: 'invalid', field: 'after' })
  })

  it('a page size that is not a positive integer is invalid', async () => {
    const a = await seeded()
    expect(failureOf(await begin(a, 0))).toMatchObject({ kind: 'invalid', field: 'pageBytes' })
  })
})

describe('the continuation token of history.next', () => {
  async function firstCursor(a: App): Promise<string> {
    const page = ok<Page>(await begin(a, 1))
    if (page.next === null) throw new Error('fixture: one page only')
    return page.next
  }

  it('a token that was altered is invalid and reads nothing', async () => {
    const a = await seeded()
    const cursor = await firstCursor(a)
    const [body, key, signature] = cursor.split('.') as [string, string, string]
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      state: { edge: string }
    }
    payload.state.edge = '0'
    const forged = [
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      key,
      signature,
    ].join('.')
    const mark = a.provider.calls.length
    expect(failureOf(await next(a, forged))).toMatchObject({ kind: 'invalid', field: 'cursor' })
    expect(a.provider.calls.length).toBe(mark)
    const flipped = `${body}.${key}.${signature.slice(0, -2)}AA`
    expect(failureOf(await next(a, flipped))).toMatchObject({ kind: 'invalid', field: 'cursor' })
    expect(failureOf(await next(a, 'only.two'))).toMatchObject({ kind: 'invalid', field: 'cursor' })
  })

  it('a token whose payload was signed without the protocol domain prefix is invalid', async () => {
    const a = await seeded()
    const cursor = await firstCursor(a)
    const body = cursor.split('.')[0] as string
    // The same signing key over the bare payload, as a signature made for another protocol would be.
    const signed = await a.signing.sign(new Uint8Array(Buffer.from(body, 'base64url')))
    if (signed.kind !== 'signed') throw new Error('fixture: the signing double signs')
    const bare = [
      body,
      Buffer.from(signed.value.keyId).toString('base64url'),
      Buffer.from(signed.value.signature).toString('base64url'),
    ].join('.')
    const mark = a.provider.calls.length
    expect(failureOf(await next(a, bare))).toMatchObject({ kind: 'invalid', field: 'cursor' })
    expect(a.provider.calls.length).toBe(mark)
    expect(ok<Page>(await next(a, cursor)).entries.length).toBeGreaterThan(0)
  })

  it('a token issued to tenant A is invalid for tenant B, even over a session of the same name', async () => {
    const a = await seeded()
    ok(await a.create(TENANT_B))
    for (const name of ['one', 'two']) ok(await a.accept(TENANT_B, 'session-1', name))
    const cursor = await firstCursor(a)
    expect(failureOf(await next(a, cursor, TENANT_B))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
  })

  it('a token issued for one session is invalid for another session of the tenant', async () => {
    const a = await seeded()
    ok(await a.create(TENANT_A, 'session-2'))
    const cursor = await firstCursor(a)
    expect(failureOf(await next(a, cursor, TENANT_A, 'session-2'))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
  })

  it('a token of another read kind is invalid', async () => {
    const a = await seeded()
    ok(await a.create(TENANT_A, 'session-2'))
    ok(await a.accept(TENANT_A, 'session-2', 'other'))
    const listed = ok<{ sessions: string[]; next: string | null }>(
      await a.port.pending({ principal: 'tester', tenant: TENANT_A, after: null, limit: 1 }),
    )
    expect(listed.next).not.toBeNull()
    expect(failureOf(await next(a, listed.next as string))).toMatchObject({
      kind: 'invalid',
      field: 'cursor',
    })
  })

  it('an expired token is invalid, and a fresh one still works', async () => {
    const a = await seeded()
    const cursor = await firstCursor(a)
    a.advance(14 * 60_000)
    expect(ok<Page>(await next(a, cursor)).entries.length).toBe(1)
    a.advance(2 * 60_000)
    expect(failureOf(await next(a, cursor))).toMatchObject({ kind: 'invalid', field: 'cursor' })
  })

  it('a token signed by a rotated-out key is invalid, and a token of the new key works', async () => {
    const a = await seeded()
    const old = await firstCursor(a)
    a.signing.controls.rotate()
    expect(failureOf(await next(a, old))).toMatchObject({ kind: 'invalid', field: 'cursor' })
    expect(ok<Page>(await next(a, await firstCursor(a))).entries.length).toBe(1)
  })

  it('an unreadable signing key is unavailable, not invalid and not a page', async () => {
    const a = await seeded()
    const cursor = await firstCursor(a)
    a.signing.controls.setUnavailable(true)
    expect(kindOf(await next(a, cursor))).toBe('unavailable')
    expect(kindOf(await begin(a, 1))).toBe('unavailable')
  })

  it('access is decided again for every page: a token does not outlive a denial', async () => {
    const a = await seeded()
    const cursor = await firstCursor(a)
    a.denyOperation('history.next')
    expect(kindOf(await next(a, cursor))).toBe('denied')
  })
})
