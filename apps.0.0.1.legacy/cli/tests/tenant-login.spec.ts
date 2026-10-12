import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ClientLocalState,
  LocalRecord,
  LocalSnapshot,
} from '@omne-harness-lite/client-local-state'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  isOk,
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { installTenantLogin } from '../src/tenant-login.ts'
import type { SessionIdentityObservation } from '../src/session-preparation.ts'

function identity(): SessionIdentityObservation {
  const centerId = '11111111111111111111111111111111'
  const tenant = parseTenantId({ organization: 'org_a', account: 'acc_a' })
  const account = parseAccountId('acc_a'),
    login = parseLoginStateId('login_a')
  if (!isGovernanceCenterId(centerId) || !isOk(tenant) || !isOk(account) || !isOk(login))
    throw new Error('invalid fixture')
  return {
    centerId,
    tenant: tenant.ok,
    accountId: account.ok,
    loginStateHandle: login.ok,
    role: 'member',
  }
}
const observed = identity()
const record: LocalRecord = {
  center: {
    centerId: observed.centerId,
    endpoint: 'https://center.invalid/',
    trust: { mode: 'ca' },
  },
  login: {
    presentation: 'fixture-secret',
    handle: observed.loginStateHandle,
    accountId: observed.accountId,
  },
  cache: [],
}
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})
async function snapshot(state: ClientLocalState): Promise<LocalSnapshot> {
  const result = await state.read()
  if (result.kind !== 'read') throw new Error('fixture read failed')
  return result.snapshot
}
async function store(value: LocalRecord | null) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-tenant-login-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const state = await openClientLocalState(
    { directory: join(root, 'auth') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  cleanups.push(() => state.close())
  if (value !== null) {
    if (value.cache.length !== 0)
      expect(
        (
          await state.compareAndReplace(
            (await snapshot(state)).token,
            { ...value, cache: [] },
            randomUUID(),
          )
        ).kind,
      ).toBe('installed')
    expect(
      (await state.compareAndReplace((await snapshot(state)).token, value, randomUUID())).kind,
    ).toBe('installed')
  }
  return state
}
describe('tenant-local login custody through the actual SQLite owner', () => {
  it('installs the same original presentation and handle without another login request', async () => {
    const source = await store(record),
      target = await store(null)
    const before = await snapshot(source)
    expect(await installTenantLogin(source, target, observed, 'transfer_1', 'empty-only')).toEqual({
      kind: 'installed',
    })
    const after = await snapshot(target)
    expect(after.value).toEqual(record)
    expect(after.operationId).toBe('transfer_1')
    expect((await snapshot(source)).revision).toBe(before.revision)
    expect(await source.read()).toMatchObject({ kind: 'read' })
  })
  it('is idempotent without rewriting the same login or clearing its current caches', async () => {
    const source = await store(record),
      target = await store(record)
    const before = await snapshot(target)
    expect(await installTenantLogin(source, target, observed, 'transfer_2', 'empty-only')).toEqual({
      kind: 'already-installed',
    })
    expect((await snapshot(target)).revision).toBe(before.revision)
  })
  it('does not overwrite another login without an explicit replacement policy', async () => {
    const other = {
      ...record,
      login: { ...record.login!, presentation: 'other-secret', handle: 'login_old' },
    }
    const source = await store(record),
      target = await store(other)
    expect(await installTenantLogin(source, target, observed, 'transfer_3', 'empty-only')).toEqual({
      kind: 'blocked',
      reason: 'selection-changed',
    })
    expect((await snapshot(target)).value).toEqual(other)
  })
  it('replaces a previous login of the same center and account only under the explicit policy', async () => {
    const source = await store(record),
      target = await store({
        ...record,
        login: { ...record.login!, handle: 'login_old', presentation: 'old-secret' },
      })
    expect(
      await installTenantLogin(source, target, observed, 'transfer_4', 'replace-same-account'),
    ).toEqual({ kind: 'installed' })
    expect((await snapshot(target)).value).toEqual(record)
  })
  it('never changes a tenant store into another center', async () => {
    const source = await store(record),
      target = await store({
        ...record,
        center: { ...record.center, centerId: '22222222222222222222222222222222' },
      })
    const before = await snapshot(target)
    expect(
      await installTenantLogin(source, target, observed, 'transfer_5', 'replace-same-account'),
    ).toEqual({ kind: 'blocked', reason: 'identity-mismatch' })
    expect((await snapshot(target)).revision).toBe(before.revision)
  })
  it('never overwrites another account login in the same center', async () => {
    const source = await store(record),
      target = await store({ ...record, login: { ...record.login!, accountId: 'other_account' } })
    expect(
      await installTenantLogin(source, target, observed, 'transfer_6', 'replace-same-account'),
    ).toEqual({ kind: 'blocked', reason: 'identity-mismatch' })
  })
  it('does not adopt an unrecognized login account by merely copying its directory', async () => {
    const source = await store({
        ...record,
        login: { presentation: record.login!.presentation, handle: record.login!.handle },
      }),
      target = await store(null)
    expect(await installTenantLogin(source, target, observed, 'transfer_7', 'empty-only')).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
    expect((await snapshot(target)).value).toBeNull()
  })
  it('does not copy stale account or tenant read caches into a fresh tenant state', async () => {
    const cached: LocalRecord = {
      ...record,
      cache: [
        {
          centerId: observed.centerId,
          accountId: observed.accountId,
          tenant: { organization: 'other_org', account: observed.accountId },
          operation: 'capability.organization-governance/v2#S-26',
          payload: { tenant: { organization: 'other_org', account: observed.accountId } },
          result: { standing: 'effective', role: 'member' },
          acquiredAt: '2026-10-01T00:00:00Z',
        },
      ],
    }
    const source = await store(cached),
      target = await store(null)
    expect(await installTenantLogin(source, target, observed, 'transfer_8', 'empty-only')).toEqual({
      kind: 'installed',
    })
    expect((await snapshot(target)).value?.cache).toEqual([])
    expect((await snapshot(source)).value?.cache).toEqual(cached.cache)
  })
  it('preserves a preconfigured target center when installing its first recognized login', async () => {
    const source = await store(record),
      target = await store({ center: record.center, cache: [] })
    expect(await installTenantLogin(source, target, observed, 'transfer_9', 'empty-only')).toEqual({
      kind: 'installed',
    })
  })
  it('does not overwrite the target live connection or TLS trust from another template', async () => {
    const center = {
      ...record.center,
      endpoint: 'https://other-entry.invalid/',
      trust: { mode: 'spki' as const, sha256: 'a'.repeat(64) },
    }
    const source = await store(record),
      target = await store({ center, cache: [] })
    expect(
      await installTenantLogin(source, target, observed, 'transfer_live', 'empty-only'),
    ).toEqual({ kind: 'installed' })
    expect((await snapshot(target)).value?.center).toEqual(center)
  })
})
describe('unknown and failure do not grant custody or retry effects', () => {
  it('returns an unavailable source without touching the target', async () => {
    const source: ClientLocalState = {
      read: vi.fn<ClientLocalState['read']>(async () => ({
        kind: 'failed',
        reason: 'unavailable',
      })),
      compareAndReplace: vi.fn(),
    }
    const target: ClientLocalState = { read: vi.fn(), compareAndReplace: vi.fn() }
    expect(await installTenantLogin(source, target, observed, 'transfer_10', 'empty-only')).toEqual(
      { kind: 'blocked', reason: 'source-unavailable' },
    )
    expect(target.read).not.toHaveBeenCalled()
  })
  it('returns an unavailable target without rewriting the source', async () => {
    const source = await store(record)
    const target: ClientLocalState = {
      read: vi.fn<ClientLocalState['read']>(async () => ({
        kind: 'failed',
        reason: 'invalid-record',
      })),
      compareAndReplace: vi.fn(),
    }
    expect(await installTenantLogin(source, target, observed, 'transfer_11', 'empty-only')).toEqual(
      { kind: 'blocked', reason: 'target-unavailable' },
    )
    expect(target.compareAndReplace).not.toHaveBeenCalled()
  })
  it('preserves the original transfer identity on unconfirmed commit and performs no retry', async () => {
    const source = await store(record),
      backing = await store(null)
    const target: ClientLocalState = {
      read: () => backing.read(),
      compareAndReplace: vi.fn<ClientLocalState['compareAndReplace']>(async () => ({
        kind: 'unconfirmed',
      })),
    }
    const result = await installTenantLogin(
      source,
      target,
      observed,
      'transfer_unknown',
      'empty-only',
    )
    expect(result).toEqual({ kind: 'unconfirmed', operationId: 'transfer_unknown' })
    expect(target.compareAndReplace).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('fixture-secret')
  })
  it('reports a compare-and-replace conflict without overwriting or generating a new key', async () => {
    const source = await store(record),
      backing = await store(null)
    const target: ClientLocalState = {
      read: () => backing.read(),
      compareAndReplace: vi.fn<ClientLocalState['compareAndReplace']>(async () => ({
        kind: 'conflict',
        current: await snapshot(backing),
      })),
    }
    expect(
      await installTenantLogin(source, target, observed, 'transfer_conflict', 'empty-only'),
    ).toEqual({ kind: 'blocked', reason: 'selection-changed' })
    expect(target.compareAndReplace).toHaveBeenCalledTimes(1)
  })
  it('recognizes a committed but unconfirmed transfer from its original durable state without another write', async () => {
    const source = await store(record),
      backing = await store(null)
    const compareAndReplace = vi.fn<ClientLocalState['compareAndReplace']>(
      async (token, value, operationId) => {
        expect((await backing.compareAndReplace(token, value, operationId)).kind).toBe('installed')
        return { kind: 'unconfirmed' }
      },
    )
    const target: ClientLocalState = { read: () => backing.read(), compareAndReplace }
    expect(
      await installTenantLogin(source, target, observed, 'transfer_lost_receipt', 'empty-only'),
    ).toEqual({ kind: 'unconfirmed', operationId: 'transfer_lost_receipt' })
    expect(
      await installTenantLogin(source, target, observed, 'transfer_lost_receipt', 'empty-only'),
    ).toEqual({ kind: 'already-installed' })
    expect(compareAndReplace).toHaveBeenCalledTimes(1)
    expect((await snapshot(backing)).operationId).toBe('transfer_lost_receipt')
  })
  it.each(['', 'bad\0key'])(
    'rejects invalid transfer identity before touching state',
    async operationId => {
      const source: ClientLocalState = { read: vi.fn(), compareAndReplace: vi.fn() }
      const target: ClientLocalState = { read: vi.fn(), compareAndReplace: vi.fn() }
      expect(await installTenantLogin(source, target, observed, operationId, 'empty-only')).toEqual(
        { kind: 'blocked', reason: 'invalid-input' },
      )
      expect(source.read).not.toHaveBeenCalled()
      expect(target.read).not.toHaveBeenCalled()
    },
  )
  it('propagates unexpected storage defects', async () => {
    const defect = new Error('fixture storage defect')
    const source: ClientLocalState = {
      read: vi.fn(async () => {
        throw defect
      }),
      compareAndReplace: vi.fn(),
    }
    const target: ClientLocalState = { read: vi.fn(), compareAndReplace: vi.fn() }
    await expect(
      installTenantLogin(source, target, observed, 'transfer_defect', 'empty-only'),
    ).rejects.toBe(defect)
  })
})
