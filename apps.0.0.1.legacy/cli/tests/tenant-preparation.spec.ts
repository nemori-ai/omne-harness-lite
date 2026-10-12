import { describe, expect, it, vi } from 'vitest'
import type { ActionReport, GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import { isOk, parseAccountId, parseLoginStateId } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { createTenantOrganization } from '../src/tenant-preparation.ts'
import type { RunLoginBinding } from '../src/session-preparation.ts'

const create = 'capability.organization-governance/v2#S-21'
const read = 'capability.organization-governance/v2#S-22'
const membership = 'capability.organization-governance/v2#S-26'
const origin = {
  centerId: '11111111111111111111111111111111',
  accountId: 'account-owner',
  loginStateHandle: 'login-owner',
}
const tenant = { organization: 'organization-new', account: origin.accountId }
const name = '  共同研发组  '
const key = 'stable-create-1'
function login(): RunLoginBinding {
  const account = parseAccountId(origin.accountId)
  const handle = parseLoginStateId(origin.loginStateHandle)
  if (!isOk(account) || !isOk(handle) || !isGovernanceCenterId(origin.centerId))
    throw new Error('invalid fixture')
  return { centerId: origin.centerId, accountId: account.ok, loginStateHandle: handle.ok }
}
function report(operation: string, result: unknown): ActionReport {
  const reply = { operation, reply: { result } }
  return {
    format: 'governance-client/1',
    actionId: 'action-1',
    action: 'invoke',
    operation,
    origin,
    admission: { status: 'admitted' },
    remote: { status: 'success', stage: 'operation', sendAttempted: true, reply },
    local: { status: 'installed' },
    view: { source: 'online', data: reply },
    use: 'active',
  }
}
const creation = report(create, tenant.organization)
const organization = report(read, {
  organization: tenant.organization,
  organizationKind: 'team',
  name,
})
const standing = report(membership, { standing: 'effective', role: 'superAdministrator' })
function fixture(reports: readonly ActionReport[] = [creation, organization, standing]) {
  const run = vi.fn<GovernanceUse['run']>()
  for (const row of reports) run.mockResolvedValueOnce(row)
  const use: GovernanceUse = { run, runPrepared: vi.fn(), close: vi.fn(async () => {}) }
  return { use, run }
}

describe('created tenant preparation retains original effects', () => {
  it('creates once, reads center name and membership, and leaves current selection alone', async () => {
    const f = fixture()
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'created',
      tenant,
      report: creation,
      preparation: {
        kind: 'observed',
        identity: { ...origin, tenant, role: 'superAdministrator' },
        name,
      },
    })
    expect(f.run.mock.calls).toEqual([
      [{ action: 'invoke', operation: create, payload: { name, creationKey: key } }],
      [
        {
          action: 'invoke',
          operation: read,
          payload: { organization: tenant.organization },
          readMode: 'refresh',
        },
      ],
      [{ action: 'invoke', operation: membership, payload: { tenant }, readMode: 'refresh' }],
    ])
    expect(f.use.close).not.toHaveBeenCalled()
    expect(f.use.runPrepared).not.toHaveBeenCalled()
  })
  it.each([undefined, null, '', ' \n ', 3, {}])(
    'rejects invalid name %j before IO',
    async value => {
      const f = fixture([])
      expect(await createTenantOrganization(f.use, login(), value, key)).toEqual({
        kind: 'invalid-input',
      })
      expect(f.run).not.toHaveBeenCalled()
    },
  )
  it.each([undefined, null, '', ' key ', 3, {}])(
    'requires original stable key %j before IO',
    async value => {
      const f = fixture([])
      expect(await createTenantOrganization(f.use, login(), name, value)).toEqual({
        kind: 'invalid-input',
      })
      expect(f.run).not.toHaveBeenCalled()
    },
  )
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'rejects invalid %s before IO',
    async field => {
      const f = fixture([])
      expect(await createTenantOrganization(f.use, { ...login(), [field]: '' }, name, key)).toEqual(
        { kind: 'invalid-input' },
      )
      expect(f.run).not.toHaveBeenCalled()
    },
  )
  it.each(['unknown', 'unavailable', 'rejected', 'not-attempted'] as const)(
    'preserves original %s report without retry',
    async status => {
      const original: ActionReport = {
        ...creation,
        remote: { status, stage: 'operation', sendAttempted: status !== 'not-attempted' },
        view: { source: 'none' },
      }
      const f = fixture([original])
      expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
        kind: 'unresolved',
        report: original,
      })
      expect(f.run).toHaveBeenCalledTimes(1)
    },
  )
  it.each(['centerId', 'accountId', 'loginStateHandle'] as const)(
    'retains creation report with mismatched %s, without adopting identity',
    async field => {
      const original: ActionReport = {
        ...creation,
        origin: {
          ...origin,
          [field]: field === 'centerId' ? '22222222222222222222222222222222' : 'different-id',
        },
      }
      const f = fixture([original])
      expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
        kind: 'unresolved',
        report: original,
      })
      expect(f.run).toHaveBeenCalledTimes(1)
    },
  )
  it('does not turn online business failure into a created tenant', async () => {
    const original: ActionReport = {
      ...creation,
      remote: {
        ...creation.remote,
        reply: { operation: create, reply: { failure: 'accountNotActivated' } },
      },
    }
    const f = fixture([original])
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'unresolved',
      report: original,
    })
    expect(f.run).toHaveBeenCalledTimes(1)
  })
  it('retains created identity when name reading is unavailable, without recreating', async () => {
    const f = fixture([
      creation,
      {
        ...organization,
        remote: { status: 'unavailable', stage: 'operation', sendAttempted: true },
        view: { source: 'none' },
      },
    ])
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'created',
      tenant,
      report: creation,
      preparation: { kind: 'blocked', reason: 'identity-unavailable' },
    })
    expect(f.run).toHaveBeenCalledTimes(2)
  })
  it.each([
    { organization: 'other', organizationKind: 'team', name },
    { organization: tenant.organization, organizationKind: 'personal', name },
    { organization: tenant.organization, organizationKind: 'team', name: 'other' },
    { organization: tenant.organization, organizationKind: 'team' },
  ])(
    'does not claim the created tenant is prepared from mismatched center data %j',
    async value => {
      const f = fixture([creation, report(read, value)])
      expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
        kind: 'created',
        tenant,
        report: creation,
        preparation: { kind: 'blocked', reason: 'identity-mismatch' },
      })
      expect(f.run).toHaveBeenCalledTimes(2)
    },
  )
  it('does not use a displayed copy as current center name', async () => {
    const f = fixture([
      creation,
      { ...organization, view: { ...organization.view, source: 'copy' } },
    ])
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'created',
      tenant,
      report: creation,
      preparation: { kind: 'blocked', reason: 'identity-unavailable' },
    })
    expect(f.run).toHaveBeenCalledTimes(2)
  })
  it('retains created identity when membership is ineffective', async () => {
    const f = fixture([creation, organization, report(membership, { standing: 'ineffective' })])
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'created',
      tenant,
      report: creation,
      preparation: { kind: 'blocked', reason: 'membership-ineffective' },
    })
    expect(f.run).toHaveBeenCalledTimes(3)
  })
  it('rejects identity changes in the last membership reading', async () => {
    const f = fixture([
      creation,
      organization,
      { ...standing, origin: { ...origin, accountId: 'different' } },
    ])
    expect(await createTenantOrganization(f.use, login(), name, key)).toEqual({
      kind: 'created',
      tenant,
      report: creation,
      preparation: { kind: 'blocked', reason: 'identity-mismatch' },
    })
  })
  it('propagates unexpected provider error without closing or retrying', async () => {
    const f = fixture([])
    const error = new Error('fixture provider defect')
    f.run.mockRejectedValue(error)
    await expect(createTenantOrganization(f.use, login(), name, key)).rejects.toBe(error)
    expect(f.run).toHaveBeenCalledTimes(1)
    expect(f.use.close).not.toHaveBeenCalled()
  })
})
