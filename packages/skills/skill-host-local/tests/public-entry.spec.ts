import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('the root entry exports the two sources, the decisions and their asset inputs, and nothing else at run time', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/skill-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'createContentStoreSource',
    'createDirectorySource',
    'createSkillDecisions',
    'publishedCandidate',
    'skillInputsFromAssets',
  ])
})

it('has the root entry as its only entry, with no Cordis entry', async () => {
  const manifest: unknown = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  )
  const exports: unknown =
    typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'exports') : undefined
  expect(Object.keys(Object(exports))).toEqual(['.'])
})
