import { hostPolicySource } from './fixtures/contract-sources.ts'
import { expect, test } from 'vitest'
import { ogS42DynamicResolve } from '../src/rules/index.ts'

const path = 'tenancy-host/src/policy.ts'
const source = hostPolicySource
const check = (text: string, location = path) =>
  ogS42DynamicResolve.check([{ path: location, text }])

test('the host fixture compares declared service keys without resolving capabilities', () => {
  expect(check(source)).toEqual([])
  expect(check(source, 'tenancy-host/src/other.ts').length).toBeGreaterThan(0)
})

test.each([
  'scope.get(ORGANIZATION_PURGE_SERVICE)',
  'const plugin = { inject: [ORGANIZATION_PURGE_SERVICE] }',
  'const stolen = ORGANIZATION_PURGE_SERVICE',
  'const stolen = required[row.name]',
  'export { required }',
  'required.organizations.push(ORGANIZATION_PURGE_SERVICE)',
])('metadata does not grant capability resolution or escaping: %s', appended => {
  expect(check(source + '\n' + appended).length).toBeGreaterThan(0)
})

test.each([
  'row.provides.includes(scope.get(key))',
  'row.provides.includes(scope.get(key).purgePersonalOrganization(account))',
  '!consume(scope.get(key))',
])('changing the observation to capability access is refused: %s', replacement => {
  expect(source).toContain('!row.provides.includes(key)')
  expect(check(source.replace('!row.provides.includes(key)', replacement)).length).toBeGreaterThan(
    0,
  )
})
