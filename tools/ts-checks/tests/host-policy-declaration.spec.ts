import { hostPolicySource } from './fixtures/contract-sources.ts'
import { expect, test } from 'vitest'
import { ogS42DynamicResolve } from '../src/rules/index.ts'
const path = 'tenancy-host/src/policy.ts'
const text = hostPolicySource
test('host fixture compares declared string keys without resolving purge', () => {
  expect(ogS42DynamicResolve.check([{ path, text }])).toEqual([])
})
test.each([
  ['other file', path + '.other.ts', text],
  ['direct get', path, text + '\nctx.get(ORGANIZATION_PURGE_SERVICE)'],
  ['literal get', path, text + "\nctx.get('organizationPurge')"],
  ['inject', path, text + '\nctx.inject([ORGANIZATION_PURGE_SERVICE], () => {})'],
  ['table escape', path, text + '\nconst escaped = required'],
  ['table lookup', path, text + '\nctx.get(required.organizations[3])'],
  ['table mutation', path, text + '\nrequired.organizations = []'],
  ['export table', path, text.replace('const required:', 'export const required:')],
  [
    'wrong public import',
    path,
    text.replace(
      "'@omne-harness/organization-governance/cordis'",
      "'@omne-harness/organization-governance'",
    ),
  ],
  ['call instead of comparison', path, text.replace('!row.provides.includes(key)', 'ctx.get(key)')],
] as const)('%s is rejected', (_name, path, text) => {
  expect(ogS42DynamicResolve.check([{ path, text }]).length).toBeGreaterThan(0)
})
