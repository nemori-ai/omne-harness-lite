import { describe, expect, it } from 'vitest'
import { DEFAULT_TEAM_ROLES, type TenantStandingSource } from '@omne-harness/identity'
import {
  ADMIN_ACCOUNT_TEXT,
  MEMBER_ACCOUNT_TEXT,
  ORGANIZATION_TEXT,
  parsedTenant,
  standingTable,
} from './support.ts'

describe('a tenant standing source', () => {
  it('answers the standing of now and changes after a membership change', async () => {
    const table = standingTable()
    const source: TenantStandingSource = table.source
    const admin = parsedTenant(ORGANIZATION_TEXT, ADMIN_ACCOUNT_TEXT)
    table.join(admin, DEFAULT_TEAM_ROLES.superAdmin)
    const before = await source.read({ tenant: admin })
    expect(before.kind).toBe('member')
    table.leave(admin)
    const after = await source.read({ tenant: admin })
    expect(after.kind).toBe('not-member')
    if (before.kind !== 'member' || after.kind !== 'not-member') return
    expect(after.evidence.revision).not.toBe(before.evidence.revision)
  })

  it('does not tell an unknown tenant from a non-member', async () => {
    const table = standingTable()
    const unknown = parsedTenant(ORGANIZATION_TEXT, MEMBER_ACCOUNT_TEXT)
    const reading = await table.source.read({ tenant: unknown })
    expect(reading.kind).toBe('not-member')
  })
})
