import { describe, expect, it } from 'vitest'
import type { GrantFacts, GrantKey, SecretSlot } from '@omne-harness/mcp-contract/provider'
import {
  createMemoryAuthorizationRecords,
  createMemoryGrantSecrets,
  type MemoryAuthorizationRecords,
  type MemoryGrantSecrets,
} from '@omne-harness/mcp-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { RESOURCE, connected, issued, keyOf, refused, world } from './fixture.ts'

const never = new AbortController().signal
type Read = Outcome<GrantFacts | 'absent', 'unavailable'>

// The doubles answer every call; these answer one read a test names, so a change between two reads can be staged.
function stagedRecords() {
  const base = createMemoryAuthorizationRecords()
  let reads = 0
  let staged: Readonly<{ at: number; answer: Read }> | undefined
  let writesFail = false
  const records: MemoryAuthorizationRecords = Object.assign(
    Object.create(base) as MemoryAuthorizationRecords,
    {
      async read(key: GrantKey) {
        reads += 1
        return staged !== undefined && reads === staged.at ? staged.answer : base.read(key)
      },
      async write(key: GrantKey, facts: GrantFacts, expected: number | 'absent') {
        return writesFail ? fail('unavailable') : base.write(key, facts, expected)
      },
    },
  )
  return {
    records,
    reads: () => reads,
    stage: (at: number, answer: Read) => {
      reads = 0
      staged = { at, answer }
    },
    failWrites: () => {
      writesFail = true
    },
  }
}

function stagedSecrets() {
  const base = createMemoryGrantSecrets()
  let reads = 0
  let failing: number | undefined
  const secrets: MemoryGrantSecrets = Object.assign(Object.create(base) as MemoryGrantSecrets, {
    async read(slot: SecretSlot) {
      reads += 1
      return reads === failing ? fail('unavailable') : base.read(slot)
    },
  })
  return {
    secrets,
    failRead: (at: number) => {
      reads = 0
      failing = at
    },
  }
}

async function factsOf(records: MemoryAuthorizationRecords): Promise<GrantFacts> {
  const read = await records.read(keyOf())
  if (!('ok' in read) || read.ok === 'absent') throw new Error('no grant')
  return read.ok
}

describe('a refresh finds the grant changed under it (C204)', () => {
  it.each([
    ['cannot be read', 'unknown'],
    ['is gone', 'missing'],
    ['waits for a new connection', 'rejected'],
  ] as const)(
    'a grant that %s by the time the refresh reads it answers %s and asks nothing',
    async (change, answer) => {
      const staged = stagedRecords()
      const w = world({ records: staged.records })
      await connected(w)
      const facts = await factsOf(staged.records)
      w.advance(3600_000)
      staged.stage(
        2,
        change === 'cannot be read'
          ? fail('unavailable')
          : change === 'is gone'
            ? succeed('absent')
            : succeed({ ...facts, state: 'reconnect' }),
      )
      expect(await w.authorization.acquire(keyOf(), RESOURCE, never)).toEqual({ failure: answer })
      expect(w.server.tokenRequests()).toHaveLength(1)
    },
  )

  it('refresh material that cannot be read makes this use unknown; with none, an access token that cannot be read is unknown too', async () => {
    const staged = stagedSecrets()
    const w = world({ secrets: staged.secrets })
    await connected(w)
    w.advance(3600_000)
    staged.failRead(1)
    expect(await w.authorization.acquire(keyOf(), RESOURCE, never)).toEqual({ failure: 'unknown' })
    await staged.secrets.remove({ kind: 'refresh', key: keyOf() })
    staged.failRead(2)
    expect(await w.authorization.acquire(keyOf(), RESOURCE, never)).toEqual({ failure: 'unknown' })
    expect(w.server.tokenRequests()).toHaveLength(1)
  })
})

describe('a handle keeps what a refresh gave (C204)', () => {
  it('a token refreshed when the handle was taken is shown on until its own expiry, without reading the store again', async () => {
    const staged = stagedRecords()
    const w = world({ records: staged.records })
    await connected(w)
    w.advance(3600_000)
    w.server.answer(issued('at-2', 'rt-2'))
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    staged.stage(0, fail('unavailable'))
    for (let use = 0; use < 2; use += 1) {
      const headers = new Headers()
      expect(await handle.ok.authorize(headers)).toEqual({ ok: true })
      expect(headers.get('authorization')).toBe('Bearer at-2')
    }
    expect(staged.reads()).toBe(0)
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('when the facts cannot be read after a refresh the token is still shown; the next request reads them again and keeps it', async () => {
    const staged = stagedRecords()
    const w = world({ records: staged.records })
    await connected(w)
    w.advance(3600_000)
    w.server.answer(issued('at-2', 'rt-2'))
    staged.stage(3, fail('unavailable'))
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    const shown = async () => {
      const headers = new Headers()
      await handle.ok.authorize(headers)
      return headers.get('authorization')
    }
    expect(await shown()).toBe('Bearer at-2')
    expect(await shown()).toBe('Bearer at-2')
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('a grant gone right after its refresh is shown once, then refused', async () => {
    const staged = stagedRecords()
    const w = world({ records: staged.records })
    await connected(w)
    w.advance(3600_000)
    w.server.answer(issued('at-2', 'rt-2'))
    staged.stage(3, succeed('absent'))
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    expect(await handle.ok.authorize(new Headers())).toEqual({ ok: true })
    await w.authorization.disconnect(keyOf())
    const headers = new Headers()
    expect(await handle.ok.authorize(headers)).toEqual({ failure: 'rejected' })
    expect(headers.get('authorization')).toBeNull()
  })

  it('a due token whose refresh gets no answer makes this request unknown, not refused', async () => {
    const w = world()
    await connected(w)
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    await handle.ok.authorize(new Headers())
    w.advance(3600_000)
    const headers = new Headers()
    expect(await handle.ok.authorize(headers)).toEqual({ failure: 'unknown' })
    expect(headers.get('authorization')).toBeNull()
  })
})

describe('a refusal reported when the grant has moved on changes nothing (C204)', () => {
  it('after a disconnect, after a reconnect was asked, or while the facts cannot be read', async () => {
    const staged = stagedRecords()
    const w = world({ records: staged.records })
    await connected(w)
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    await handle.ok.authorize(new Headers())
    staged.stage(1, fail('unavailable'))
    await handle.ok.reportRejection({ kind: 'unauthorized' })
    expect(await factsOf(staged.records)).toMatchObject({ state: 'valid', minted: 'exchange' })
    expect(await w.authorization.requireScopes(keyOf(), ['write'])).toEqual({ ok: true })
    const waiting = await factsOf(staged.records)
    await handle.ok.reportRejection({ kind: 'unauthorized' })
    await handle.ok.reportRejection({ kind: 'insufficient-scope', scopes: ['admin'] })
    expect(await factsOf(staged.records)).toEqual(waiting)
    expect(await w.authorization.disconnect(keyOf())).toEqual({ ok: true })
    await handle.ok.reportRejection({ kind: 'insufficient-scope', scopes: ['admin'] })
    expect(await staged.records.read(keyOf())).toEqual({ ok: 'absent' })
    expect(w.server.tokenRequests()).toHaveLength(1)
  })

  it('asking for a new connection whose write fails is unavailable, and a refused refresh still answers refused', async () => {
    const staged = stagedRecords()
    const w = world({ records: staged.records })
    await connected(w)
    staged.failWrites()
    expect(await w.authorization.requireScopes(keyOf(), ['write'])).toEqual({
      failure: 'unavailable',
    })
    w.advance(3600_000)
    w.server.answer(refused())
    expect(await w.authorization.acquire(keyOf(), RESOURCE, never)).toEqual({ failure: 'rejected' })
  })
})
