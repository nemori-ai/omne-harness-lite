import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('the public entry exports credential delivery and judgment, not the store or the contract values', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(['deliver', 'judgePresence', 'judgeResolution'].sort())
})

it('the source reaches neither a custodian, Cordis nor the host package', () => {
  for (const name of ['index.ts', 'deliver.ts', 'credential.ts']) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), name).toBe(false)
    expect(source.includes('model-host-local'), name).toBe(false)
    expect(source.includes('model-cordis-contract'), name).toBe(false)
    expect(source.includes('store.ts'), name).toBe(false)
  }
})

it('the cordis and execute entries stay as empty modules until the manifest drops them', async () => {
  expect(Object.keys(await import('@omne-harness/model/cordis'))).toEqual([])
  expect(Object.keys(await import('@omne-harness/model/execute'))).toEqual([])
})
