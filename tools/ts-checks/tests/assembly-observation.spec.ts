import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { ogS42DynamicResolve } from '../src/index.ts'

const path = 'tenancy-host/src/assembly.ts'
const source = readFileSync(
  new URL('../../../apps/tenancy-host/src/assembly.ts', import.meta.url),
  'utf8',
)
const check = (text: string, location = path) =>
  ogS42DynamicResolve.check([{ path: location, text }])

test('the actual host only observes provided-service presence', () => {
  expect(check(source)).toEqual([])
  expect(check(source, 'tenancy-host/src/other.ts').length).toBeGreaterThan(0)
})

test.each([
  'scope.get(ORGANIZATION_PURGE_SERVICE)',
  'const plugin = { inject: [ORGANIZATION_PURGE_SERVICE] }',
  'const stolen = ORGANIZATION_PURGE_SERVICE',
  'const stolen = provides[row.name]',
  'export { provides }',
  'provides[row.name].push(ORGANIZATION_PURGE_SERVICE)',
])('metadata does not grant capability resolution or escaping: %s', appended => {
  expect(check(source + '\n' + appended).length).toBeGreaterThan(0)
})

test.each([
  'scope.get(key)',
  'scope.get(key).purgePersonalOrganization(account)',
  'consume(scope.get(key)) === undefined',
])('changing the observation to capability access is refused: %s', replacement => {
  expect(source).toContain('scope.get(key) === undefined')
  expect(check(source.replace('scope.get(key) === undefined', replacement)).length).toBeGreaterThan(
    0,
  )
})
