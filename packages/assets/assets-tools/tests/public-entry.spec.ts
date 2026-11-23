import { expect, it } from 'vitest'

it('the root entry exports the tool module, its parts and the call source', async () => {
  const root = (await import('@omne-harness/assets-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'answerExtensions',
    'attachExtensionsSource',
    'createExtensionsAuthor',
    'extensionsAdoption',
    'extensionsCommandNames',
    'extensionsContract',
    'extensionsExecutor',
    'extensionsParameterCodec',
    'extensionsSourceOf',
    'extensionsToolModule',
  ])
})
