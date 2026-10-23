import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEAM_MODEL,
  DEFAULT_TEAM_ROLES,
  DEFAULT_TEAM_ROLE_MAPPING,
  QUALIFICATIONS,
  governanceModelEquals,
  isQualification,
  qualificationsOf,
} from '@omne-harness/identity'

describe('named qualifications', () => {
  it('publishes organization cost ledger read as the first named qualification', () => {
    expect([...QUALIFICATIONS]).toEqual(['organization-cost-ledger-read'])
    expect(isQualification('organization-cost-ledger-read')).toBe(true)
    expect(isQualification('organization-admin')).toBe(false)
    expect(isQualification(7)).toBe(false)
  })
})

describe('the default team role mapping', () => {
  it('names the default team model and its two roles', () => {
    expect(DEFAULT_TEAM_MODEL).toEqual({ model: 'default-team', revision: '1' })
    expect(DEFAULT_TEAM_ROLES).toEqual({ superAdmin: 'super-admin', member: 'member' })
    expect(DEFAULT_TEAM_ROLE_MAPPING.model).toBe(DEFAULT_TEAM_MODEL)
    expect(DEFAULT_TEAM_ROLE_MAPPING.roles.map(role => role.role)).toEqual([
      'super-admin',
      'member',
    ])
  })

  it('maps the super administrator to the cost ledger read and the member to nothing', () => {
    const superAdmin = { model: DEFAULT_TEAM_MODEL, role: DEFAULT_TEAM_ROLES.superAdmin }
    const member = { model: DEFAULT_TEAM_MODEL, role: DEFAULT_TEAM_ROLES.member }
    expect(qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, superAdmin)).toEqual({
      ok: ['organization-cost-ledger-read'],
    })
    expect(qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, member)).toEqual({ ok: [] })
  })

  it('does not resolve a role name of another model, even when the name matches', () => {
    const otherModel = { model: 'acme-governance', revision: '1' }
    expect(governanceModelEquals(DEFAULT_TEAM_MODEL, otherModel)).toBe(false)
    expect(
      qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, { model: otherModel, role: 'super-admin' }),
    ).toEqual({ failure: { reason: 'model-mismatch' } })
    expect(
      qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, {
        model: { model: 'default-team', revision: '2' },
        role: 'super-admin',
      }),
    ).toEqual({ failure: { reason: 'model-mismatch' } })
  })

  it('does not guess an unlisted role', () => {
    expect(
      qualificationsOf(DEFAULT_TEAM_ROLE_MAPPING, { model: DEFAULT_TEAM_MODEL, role: 'owner' }),
    ).toEqual({ failure: { reason: 'unknown-role' } })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(DEFAULT_TEAM_ROLE_MAPPING)).toBe(true)
    expect(Object.isFrozen(DEFAULT_TEAM_ROLE_MAPPING.roles)).toBe(true)
    expect(Object.isFrozen(DEFAULT_TEAM_ROLE_MAPPING.roles[0]?.qualifications)).toBe(true)
  })
})
