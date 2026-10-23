import { expect, it } from 'vitest'

it('publishes the first identity shapes: the principal authority, the qualifications and the role mapping', async () => {
  const root = (await import('@omne-harness/identity')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'DEFAULT_TEAM_MODEL',
      'DEFAULT_TEAM_ROLES',
      'DEFAULT_TEAM_ROLE_MAPPING',
      'QUALIFICATIONS',
      'governanceModelEquals',
      'inProcessPrincipalAuthority',
      'isQualification',
      'qualificationsOf',
      'scopeOf',
    ].sort(),
  )
})
