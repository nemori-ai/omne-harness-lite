import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { memberPath } from './module-graph.ts'

it('draft cordis entry exports nothing until the accepted binding replaces it', async () => {
  const cordis = (await import('@omne-harness/tool-host-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual([])
})

it('consumes the contract member through the workspace package', () => {
  const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  expect(manifest.dependencies).toMatchObject({ '@omne-harness/tool': 'workspace:*' })
})
