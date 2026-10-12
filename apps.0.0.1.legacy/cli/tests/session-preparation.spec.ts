import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  readNewSessionIdentity,
  readNewRunLogin,
  type RunLoginBinding,
} from '../src/session-preparation.ts'
import { parseAccountId, parseLoginStateId, isOk } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'

const current = 'capability.organization-governance/v2#S-36'
const membership = 'capability.organization-governance/v2#S-26'
const tenant = { organization: 'org_72be', account: 'acc_7f3c91' }
const origin = {
  centerId: '11111111111111111111111111111111',
  accountId: tenant.account,
  loginStateHandle: 'login_9837',
}
function runBinding(): RunLoginBinding {
  const account = parseAccountId(origin.accountId)
  const login = parseLoginStateId(origin.loginStateHandle)
  if (!isOk(account) || !isOk(login) || !isGovernanceCenterId(origin.centerId))
    throw new Error('invalid fixture origin')
  return { centerId: origin.centerId, accountId: account.ok, loginStateHandle: login.ok }
}
function online(operation: string, result: unknown): ActionReport {
  const data = { operation, reply: { result } }
  return {
    format: 'governance-client/1',
    actionId: 'action_fixture',
    action: 'invoke',
    operation,
    origin,
    admission: { status: 'admitted' },
    remote: { status: 'success', stage: 'operation', sendAttempted: true, reply: data },
    local: { status: 'installed' },
    view: { source: 'online', data },
    use: 'active',
  }
}
function fixture(
  reports: ActionReport[] = [
    online(current, tenant),
    online(membership, { standing: 'effective', role: 'member' }),
  ],
) {
  const run = vi.fn<GovernanceUse['run']>()
  for (const report of reports) run.mockResolvedValueOnce(report)
  const use: GovernanceUse = { run, runPrepared: vi.fn(), close: vi.fn(async () => {}) }
  return { use, run }
}
describe('fresh login reading for one new Run', () => {
  it('confirms the original login online without reading membership or issuing work', async () => {
    const f = fixture([online(current, tenant)])
    expect(await readNewRunLogin(f.use, runBinding())).toEqual({ kind: 'observed', login: origin })
    expect(f.run.mock.calls).toEqual([
      [{ action: 'invoke', operation: current, payload: {}, readMode: 'refresh' }],
    ])
    expect(f.use.close).not.toHaveBeenCalled()
    expect(f.use.runPrepared).not.toHaveBeenCalled()
  })
  it('does not reinterpret the Session owner when the login selection has changed', async () => {
    const f = fixture([online(current, { ...tenant, organization: 'other_org' })])
    expect(await readNewRunLogin(f.use, runBinding())).toEqual({ kind: 'observed', login: origin })
  })
  it('performs a fresh read for each request, without keeping a continuing approval', async () => {
    const f = fixture([
      online(current, tenant),
      {
        ...online(current, tenant),
        remote: {
          status: 'rejected',
          stage: 'identity',
          sendAttempted: true,
          answer: 'login-state-rejected',
        },
        view: { source: 'none' },
      },
    ])
    expect((await readNewRunLogin(f.use, runBinding())).kind).toBe('observed')
    expect(await readNewRunLogin(f.use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'login-rejected',
    })
    expect(f.run).toHaveBeenCalledTimes(2)
  })
  it.each(['unavailable', 'unknown'] as const)(
    'blocks %s without treating it as revoked',
    async status => {
      const f = fixture([
        {
          ...online(current, tenant),
          remote: { status, stage: 'health', sendAttempted: false },
          view: { source: 'copy', data: { operation: current, reply: { result: tenant } } },
        },
      ])
      expect(await readNewRunLogin(f.use, runBinding())).toEqual({
        kind: 'blocked',
        reason: 'identity-unavailable',
      })
      expect(f.run).toHaveBeenCalledTimes(1)
    },
  )
  it('does not accept successful display data as an online login confirmation', async () => {
    const report: ActionReport = { ...online(current, tenant), view: { source: 'copy' } }
    expect(await readNewRunLogin(fixture([report]).use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'identity-unavailable',
    })
  })
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'rejects a different %s',
    async field => {
      const report: ActionReport = {
        ...online(current, tenant),
        origin: {
          ...origin,
          [field]: field === 'centerId' ? '22222222222222222222222222222222' : 'other_id',
        },
      }
      expect(await readNewRunLogin(fixture([report]).use, runBinding())).toEqual({
        kind: 'blocked',
        reason: 'identity-mismatch',
      })
    },
  )
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'rejects malformed expected %s before remote IO',
    async field => {
      const f = fixture([])
      const expected = { ...runBinding(), [field]: '' }
      expect(await readNewRunLogin(f.use, expected)).toEqual({
        kind: 'blocked',
        reason: 'identity-mismatch',
      })
      expect(f.run).not.toHaveBeenCalled()
    },
  )
  it('requires the online tenant account to match the confirmed login account', async () => {
    const f = fixture([online(current, { ...tenant, account: 'other_account' })])
    expect(await readNewRunLogin(f.use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
  })
  it('requires the exact operation response', async () => {
    const f = fixture([online(membership, tenant)])
    expect(await readNewRunLogin(f.use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
  })
  it('preserves reentry and defect classification', async () => {
    const changed: ActionReport = { ...online(current, tenant), use: 'reenter-required' }
    expect(await readNewRunLogin(fixture([changed]).use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'reenter-required',
    })
    const defect: ActionReport = {
      ...online(current, tenant),
      defect: { stage: 'identity', code: 'internal-defect' },
    }
    expect(await readNewRunLogin(fixture([defect]).use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'defect',
    })
  })
  it('propagates an unexpected provider error without retry or lifetime takeover', async () => {
    const f = fixture([])
    const failure = new Error('fixture-defect')
    f.run.mockRejectedValue(failure)
    await expect(readNewRunLogin(f.use, runBinding())).rejects.toBe(failure)
    expect(f.run).toHaveBeenCalledTimes(1)
    expect(f.use.close).not.toHaveBeenCalled()
  })
})
describe('fresh preparation observes identity without manufacturing Access', () => {
  it('reads current selection and membership online through one borrowed use', async () => {
    const f = fixture()
    expect(await readNewSessionIdentity(f.use)).toEqual({
      kind: 'observed',
      identity: { ...origin, tenant, role: 'member' },
    })
    expect(f.run.mock.calls).toEqual([
      [{ action: 'invoke', operation: current, payload: {}, readMode: 'refresh' }],
      [{ action: 'invoke', operation: membership, payload: { tenant }, readMode: 'refresh' }],
    ])
    expect(f.use.close).not.toHaveBeenCalled()
    expect(f.use.runPrepared).not.toHaveBeenCalled()
  })
  it.each(['unavailable', 'unknown'] as const)(
    'keeps %s distinct from revoked login and does not retry',
    async status => {
      const report = {
        ...online(current, tenant),
        remote: { status, stage: 'identity' as const, sendAttempted: status === 'unknown' },
        view: { source: 'none' as const },
      }
      const f = fixture([report])
      expect(await readNewSessionIdentity(f.use)).toEqual({
        kind: 'blocked',
        reason: 'identity-unavailable',
      })
      expect(f.run).toHaveBeenCalledTimes(1)
    },
  )
  it('recognizes explicit login rejection', async () => {
    const report: ActionReport = {
      ...online(current, tenant),
      remote: {
        status: 'rejected',
        stage: 'identity',
        sendAttempted: true,
        answer: 'login-state-rejected',
      },
      view: { source: 'none' },
    }
    expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
      kind: 'blocked',
      reason: 'login-rejected',
    })
  })
  it('never uses a display copy when the current read is unavailable', async () => {
    const report: ActionReport = {
      ...online(current, tenant),
      remote: { status: 'unavailable', stage: 'health', sendAttempted: false },
      view: {
        source: 'copy',
        data: { operation: current, reply: { result: tenant } },
        acquiredAt: '2026-10-01T00:00:00Z',
      },
    }
    const f = fixture([report])
    expect(await readNewSessionIdentity(f.use)).toEqual({
      kind: 'blocked',
      reason: 'identity-unavailable',
    })
    expect(f.run).toHaveBeenCalledTimes(1)
  })
  it('does not accept a copy labeled success as a fresh authority reading', async () => {
    const report: ActionReport = {
      ...online(current, tenant),
      view: { ...online(current, tenant).view, source: 'copy' },
    }
    expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
      kind: 'blocked',
      reason: 'identity-unavailable',
    })
  })
  it('preserves explicit reentry instead of continuing another selection', async () => {
    const report: ActionReport = {
      ...online(current, tenant),
      use: 'reenter-required',
      admission: { status: 'blocked', reason: 'selection-changed' },
    }
    expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
      kind: 'blocked',
      reason: 'reenter-required',
    })
  })
  it('does not interpret a provider defect as invalid credentials', async () => {
    const report: ActionReport = {
      ...online(current, tenant),
      defect: { stage: 'identity', code: 'internal-defect' },
    }
    expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
      kind: 'blocked',
      reason: 'defect',
    })
  })
  it.each(
    [
      null,
      [],
      { organization: tenant.organization },
      { ...tenant, extra: true },
      { ...tenant, account: 'another_account' },
    ].map(value => [value]),
  )('rejects malformed or foreign current tenant %j', async value => {
    const f = fixture([online(current, value)])
    expect(await readNewSessionIdentity(f.use)).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
    expect(f.run).toHaveBeenCalledTimes(1)
  })
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'requires a complete origin: %s',
    async field => {
      const report = { ...online(current, tenant), origin: { ...origin, [field]: null } }
      expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
        kind: 'blocked',
        reason: 'identity-mismatch',
      })
    },
  )
  it('requires the formal governance center ID', async () => {
    const report = {
      ...online(current, tenant),
      origin: { ...origin, centerId: 'not-a-center-id' },
    }
    expect(await readNewSessionIdentity(fixture([report]).use)).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
  })
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'rejects changed membership origin: %s',
    async field => {
      const report = {
        ...online(membership, { standing: 'effective', role: 'member' }),
        origin: {
          ...origin,
          [field]: field === 'centerId' ? '22222222222222222222222222222222' : 'different_id',
        },
      }
      expect(await readNewSessionIdentity(fixture([online(current, tenant), report]).use)).toEqual({
        kind: 'blocked',
        reason: 'identity-mismatch',
      })
    },
  )
  it('rejects an explicitly ineffective membership without classifying it as a transport fault', async () => {
    expect(
      await readNewSessionIdentity(
        fixture([online(current, tenant), online(membership, { standing: 'ineffective' })]).use,
      ),
    ).toEqual({ kind: 'blocked', reason: 'membership-ineffective' })
  })
  it.each(
    [
      { standing: 'effective' },
      { standing: 'effective', role: 'invented' },
      { standing: 'effective', role: 'member', extra: true },
    ].map(value => [value]),
  )('rejects invalid membership shape %j', async value => {
    expect(
      await readNewSessionIdentity(
        fixture([online(current, tenant), online(membership, value)]).use,
      ),
    ).toEqual({ kind: 'blocked', reason: 'identity-mismatch' })
  })
  it('does not reinterpret a reply for another operation', async () => {
    expect(await readNewSessionIdentity(fixture([online(membership, tenant)]).use)).toEqual({
      kind: 'blocked',
      reason: 'identity-mismatch',
    })
  })
  it('propagates unexpected provider failure and leaves lifetime responsibility with the caller', async () => {
    const f = fixture([])
    const failure = new Error('fixture-provider-defect')
    f.run.mockRejectedValue(failure)
    await expect(readNewSessionIdentity(f.use)).rejects.toBe(failure)
    expect(f.use.close).not.toHaveBeenCalled()
  })
})

const resources: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of resources.splice(0).reverse()) await close()
})
describe('actual client and SQLite preparation', () => {
  it('recognizes a just-issued login online and leaves no secret in the observation', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'omne-session-preparation-'))
    resources.push(() => rm(root, { recursive: true, force: true }))
    const state = await openClientLocalState(
      { directory: join(root, 'auth') },
      { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
    )
    resources.push(() => state.close())
    const snapshot = await state.read()
    if (snapshot.kind !== 'read') throw new Error('fixture read failed')
    expect(
      (
        await state.compareAndReplace(
          snapshot.snapshot.token,
          {
            center: {
              centerId: origin.centerId,
              endpoint: 'https://center.invalid/',
              trust: { mode: 'ca' },
            },
            login: { presentation: 'fixture-secret-login', handle: origin.loginStateHandle },
            cache: [],
          },
          randomUUID(),
        )
      ).kind,
    ).toBe('installed')
    let rejected = false
    const exchange = vi.fn(
      async (_options: unknown, input: unknown): Promise<GovernanceOutcome> => {
        if (rejected)
          return { kind: 'entry-answer', answer: 'login-state-rejected', sendAttempted: true }
        const envelope = input as { operation: string }
        return {
          kind: 'reply' as const,
          sendAttempted: true,
          reply: {
            result:
              envelope.operation === current ? tenant : { standing: 'effective', role: 'member' },
          },
        }
      },
    )
    const client = createGovernanceClient({
      state,
      transport: {
        readPublicHealth: async () => ({
          kind: 'health',
          reply: { reachable: true, centerId: origin.centerId, version: 'fixture' },
        }),
        exchangeGovernance: exchange,
      },
    })
    resources.push(() => client.close())
    const opened = await client.openUse()
    if (opened.kind !== 'use') throw new Error('fixture open failed')
    resources.push(() => opened.use.close())
    const result = await readNewSessionIdentity(opened.use)
    expect(result).toEqual({ kind: 'observed', identity: { ...origin, tenant, role: 'member' } })
    expect(
      exchange.mock.calls.map(([, input]) => (input as { operation: string }).operation),
    ).toEqual([current, membership])
    expect(JSON.stringify(result)).not.toContain('fixture-secret-login')
    const runLogin = await readNewRunLogin(opened.use, runBinding())
    expect(runLogin).toEqual({ kind: 'observed', login: origin })
    expect(JSON.stringify(runLogin)).not.toContain('fixture-secret-login')
    const read = await state.read()
    if (read.kind !== 'read') throw new Error('fixture reread failed')
    expect(read.snapshot.value?.login?.accountId).toBe(tenant.account)
    rejected = true
    expect(await readNewRunLogin(opened.use, runBinding())).toEqual({
      kind: 'blocked',
      reason: 'login-rejected',
    })
    const denied = await state.read()
    if (denied.kind !== 'read') throw new Error('fixture denied reread failed')
    expect(denied.snapshot.value?.login).toBeUndefined()
  })
})
