import { expect, test } from 'vitest'
import { CATEGORY_NAMES, assetCategoryNames } from '../src/rules/asset-category-names.ts'
import { collectRepositorySources, REPOSITORY_RULES } from '../src/repository.ts'
import { fileURLToPath } from 'node:url'

const check = (path: string, text: string) => assetCategoryNames.check([{ path, text }])

test.each([
  ['packages/assets/assets-ui/src/view/category-page.tsx', "if (category === 'skill') return null"],
  ['packages/assets/assets-access/src/asset-operations.ts', 'const name = "model-provider"'],
  ['packages/assets/assets-protocol/src/assets-protocol.ts', 'const name = `fixture-bundle`'],
  ['apps/cli/src/asset-command.ts', "const special = new Set(['tool'])"],
  ['apps/cli/src/setting-command.ts', "owner.category === 'mcp'"],
])('a category name in %s is reported', (path, text) => {
  expect(check(path, text)).toMatchObject([{ rule: 'asset-category-names', path, line: 1 }])
})

test.each([
  ['the same text in a test of the member', 'packages/assets/assets-ui/tests/page.spec.tsx'],
  ['a call kind elsewhere in the command line', 'apps/cli/src/calls-command.ts'],
  ['a category point that is not an asset entry', 'packages/skills/skill-contract/src/contract.ts'],
])('%s is not checked', (_, path) => {
  expect(check(path, "const kind = 'tool'")).toEqual([])
})

test('a name inside a comment, a longer word or an identifier is not a category name', () => {
  const text = [
    "// the 'skill' category is drawn by its own page",
    "const label = 'tools'",
    'const skill = row.category',
  ].join('\n')
  expect(check('packages/assets/assets-ui/src/view/x.tsx', text)).toEqual([])
})

test('every name is matched', () => {
  for (const name of CATEGORY_NAMES)
    expect(check('packages/assets/assets-access/src/x.ts', `f('${name}')`)).toHaveLength(1)
})

test('the repository collector reads .tsx, and the four places hold no category name today', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const sources = collectRepositorySources(root)
  expect(
    sources.some(file => file.path === 'packages/assets/assets-ui/src/view/assets-page.tsx'),
  ).toBe(true)
  expect(REPOSITORY_RULES).toContain(assetCategoryNames)
  expect(assetCategoryNames.check(sources)).toEqual([])
}, 60_000)
