import { expect, it } from 'vitest'

it('exports the pure declaration and evaluation contract', async () => {
  const root = await import('../src/index.ts')
  expect(root.defineSettings).toBeTypeOf('function')
  expect(root.evaluateSettings).toBeTypeOf('function')
  expect(root.SettingDefinitionsSchema).toBeDefined()
})
