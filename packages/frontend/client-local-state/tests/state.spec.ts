import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { ClientStateUsageDefect, type LocalRecord, type SnapshotToken } from '../src/surface.ts'
import { center, config, fixtures, logged, other, read } from './support.ts'

describe('complete local record', () => {
  const f = fixtures()
  it('retains identity, revision and the whole record across reopen', async () => {
    const directory = await f.directory()
    const state = await f.open(directory)
    const empty = await read(state)
    expect(empty).toMatchObject({ revision: 0, operationId: null, value: null })
    expect(Object.keys(empty.token)).toEqual([])
    const installed = await state.compareAndReplace(empty.token, logged, 'save-first')
    expect(installed.kind).toBe('installed')
    await state.close()
    const reopened = await f.open(directory)
    expect(await read(reopened)).toMatchObject({
      storeId: empty.storeId,
      revision: 1,
      operationId: 'save-first',
      value: logged,
    })
  })

  it('late logout cannot delete a newly selected login from another provider', async () => {
    const directory = await f.directory()
    const a = await f.open(directory),
      b = await f.open(directory)
    await a.compareAndReplace((await read(a)).token, logged, 'login-first')
    const logoutSnapshot = await read(a)
    expect((await b.compareAndReplace((await read(b)).token, other, 'login-second')).kind).toBe(
      'installed',
    )
    expect((await a.compareAndReplace(logoutSnapshot.token, config, 'late-logout')).kind).toBe(
      'conflict',
    )
    expect((await read(a)).value).toEqual(other)
  })

  it('unchanged values still advance revision and invalidate old credentials', async () => {
    const s = await f.open(await f.directory()),
      old = await read(s)
    expect((await s.compareAndReplace(old.token, null, 'empty')).kind).toBe('installed')
    expect((await s.compareAndReplace(old.token, null, 'repeat')).kind).toBe('conflict')
  })

  it('distinguishes forged and foreign provider credentials from a stale genuine one', async () => {
    const directory = await f.directory(),
      a = await f.open(directory),
      b = await f.open(directory)
    await expect(a.compareAndReplace({} as SnapshotToken, undefined, '')).rejects.toMatchObject({
      reason: 'invalid-snapshot',
    })
    await expect(
      a.compareAndReplace((await read(b)).token, config, 'wrong-domain'),
    ).rejects.toBeInstanceOf(ClientStateUsageDefect)
    const token = (await read(a)).token
    await a.close()
    await expect(a.compareAndReplace(token, config, 'closed')).rejects.toMatchObject({
      reason: 'closed',
    })
    await expect(a.read()).rejects.toMatchObject({ reason: 'closed' })
  })

  it('detects changed persistent identity even when revision and value match', async () => {
    const directory = await f.directory(),
      s = await f.open(directory),
      original = await read(s)
    const db = new DatabaseSync(join(directory, 'client.sqlite'))
    try {
      db.exec("UPDATE client_local_state SET store_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'")
    } finally {
      db.close()
    }
    expect((await s.compareAndReplace(original.token, logged, 'late')).kind).toBe('conflict')
    expect((await read(s)).value).toBe(null)
  })

  it('never clears a bound center or migrates its login to another center', async () => {
    const s = await f.open(await f.directory())
    await s.compareAndReplace((await read(s)).token, logged, 'first')
    for (const value of [
      null,
      { ...logged, center: { ...center, centerId: '22222222222222222222222222222222' } },
    ]) {
      expect(await s.compareAndReplace((await read(s)).token, value, 'bad')).toEqual({
        kind: 'not-installed',
        reason: 'invalid-input',
      })
    }
    expect(
      (
        await s.compareAndReplace(
          (await read(s)).token,
          { ...logged, center: { ...center, endpoint: 'https://moved.example.invalid/' } },
          'move',
        )
      ).kind,
    ).toBe('installed')
  })

  it('freezes private snapshots and captures input before waiting for storage', async () => {
    const s = await f.open(await f.directory()),
      original = await read(s)
    const value = structuredClone(logged)
    const pending = s.compareAndReplace(original.token, value, 'capture')
    Object.assign(value, { login: other.login })
    const installed = await pending
    expect(installed.kind).toBe('installed')
    const snapshot = await read(s)
    expect(snapshot.value).toEqual(logged)
    expect(Object.isFrozen(snapshot.value?.center)).toBe(true)
    expect(() => Object.assign(snapshot.value!, { cache: [] })).toThrow()
  })

  it('does not reinterpret a known account attached to the same bearer', async () => {
    const s = await f.open(await f.directory())
    const unbound = { ...config, login: { presentation: 'first-bearer', handle: 'first-handle' } }
    await s.compareAndReplace((await read(s)).token, unbound, 'signed-in')
    expect((await s.compareAndReplace((await read(s)).token, logged, 'identified')).kind).toBe(
      'installed',
    )
    expect(
      await s.compareAndReplace(
        (await read(s)).token,
        { ...logged, login: { ...logged.login!, accountId: 'acc_other' } },
        'wrong-account',
      ),
    ).toEqual({ kind: 'not-installed', reason: 'invalid-input' })
  })

  it('rejects unknown secret fields, invalid endpoints, malformed identifiers and private-key trust', async () => {
    const s = await f.open(await f.directory())
    for (const value of [
      { ...config, password: 'never-save' },
      { ...logged, login: { ...logged.login, credential: 'never-save' } },
      { ...config, center: { ...center, endpoint: 'https://user:secret@center.invalid/' } },
      {
        ...config,
        center: {
          ...center,
          trust: {
            mode: 'ca',
            certificateAuthorities:
              '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
          },
        },
      },
      { ...logged, login: { ...logged.login, presentation: '\ud800' } },
    ])
      expect(await s.compareAndReplace((await read(s)).token, value, 'invalid')).toEqual({
        kind: 'not-installed',
        reason: 'invalid-input',
      })
    expect((await read(s)).revision).toBe(0)
  })

  it('reports a future format and invalid record without replacing either', async () => {
    const directory = await f.directory(),
      s = await f.open(directory),
      original = await read(s)
    const db = new DatabaseSync(join(directory, 'client.sqlite'))
    try {
      db.exec('UPDATE client_local_state SET format_version = 2')
      expect(await s.read()).toEqual({ kind: 'failed', reason: 'unsupported-format' })
      expect(await s.compareAndReplace(original.token, logged, 'future')).toEqual({
        kind: 'not-installed',
        reason: 'unsupported-format',
      })
      db.exec("UPDATE client_local_state SET format_version = 1, value_json = '{'")
      expect(await s.read()).toEqual({ kind: 'failed', reason: 'invalid-record' })
      expect(await s.compareAndReplace(original.token, logged, 'corrupt')).toEqual({
        kind: 'not-installed',
        reason: 'invalid-record',
      })
    } finally {
      db.close()
    }
  })

  it('rejects revision exhaustion and current operation ID reuse', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.compareAndReplace((await read(s)).token, logged, 'taken')
    expect(await s.compareAndReplace((await read(s)).token, config, 'taken')).toEqual({
      kind: 'not-installed',
      reason: 'invalid-input',
    })
    const db = new DatabaseSync(join(directory, 'client.sqlite'))
    try {
      db.exec(`UPDATE client_local_state SET revision = ${Number.MAX_SAFE_INTEGER}`)
    } finally {
      db.close()
    }
    expect(await s.compareAndReplace((await read(s)).token, config, 'overflow')).toEqual({
      kind: 'not-installed',
      reason: 'unavailable',
    })
  })
})

describe('read copies', () => {
  const f = fixtures()
  const cache = {
    centerId: center.centerId,
    accountId: 'acc_first',
    operation: 'capability.organization-governance/v2#S-27',
    payload: {},
    result: [{ organization: 'org_one', account: 'acc_first' }],
    acquiredAt: '2026-09-25T01:00:00Z',
  }
  const cached: LocalRecord = { ...logged, cache: [cache] }

  it('keeps validated reads together and requires clearing them when the login changes', async () => {
    const s = await f.open(await f.directory())
    await s.compareAndReplace((await read(s)).token, logged, 'login')
    expect((await s.compareAndReplace((await read(s)).token, cached, 'cache')).kind).toBe(
      'installed',
    )
    expect((await read(s)).value).toEqual(cached)
    expect(
      await s.compareAndReplace((await read(s)).token, { ...other, cache: [cache] }, 'stale-cache'),
    ).toEqual({ kind: 'not-installed', reason: 'invalid-input' })
    expect((await s.compareAndReplace((await read(s)).token, other, 'clean-new-login')).kind).toBe(
      'installed',
    )
    expect((await read(s)).value?.cache).toEqual([])
  })

  it('requires a known account and matching center, account and read operation', async () => {
    const s = await f.open(await f.directory())
    await s.compareAndReplace((await read(s)).token, logged, 'login')
    for (const entry of [
      { ...cache, accountId: 'acc_other' },
      { ...cache, centerId: '33333333333333333333333333333333' },
      {
        ...cache,
        operation: 'capability.account-identity/v3#S-15',
        payload: { loginIdentifier: 'x', credential: 'secret' },
        result: { loginState: 'secret', loginStateHandle: 'handle' },
      },
      { ...cache, payload: { password: 'secret' } },
      { ...cache, result: 'unvalidated-result' },
      { ...cache, operation: 'capability.organization-governance/v2#S-36', result: Infinity },
    ])
      expect(
        await s.compareAndReplace(
          (await read(s)).token,
          { ...logged, cache: [entry] },
          'bad-cache',
        ),
      ).toEqual({ kind: 'not-installed', reason: 'invalid-input' })
    expect(
      await s.compareAndReplace((await read(s)).token, { ...config, cache: [cache] }, 'no-login'),
    ).toEqual({ kind: 'not-installed', reason: 'invalid-input' })
  })
})
