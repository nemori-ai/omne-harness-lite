import { expect, it } from 'vitest'

it('the root entry exports the tool module, its parts, the port and the revisions', async () => {
  const root = (await import('@omne-harness/plugin-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'SHELL_MEMBERS',
    'answerExtensionPoints',
    'attachExtensionSight',
    'createExtensionPointsAuthor',
    'createRevisions',
    'extensionPointsAdoption',
    'extensionPointsCommandNames',
    'extensionPointsContract',
    'extensionPointsExecutor',
    'extensionPointsParameterCodec',
    'extensionPointsToolModule',
    'extensionSightOf',
  ])
})
