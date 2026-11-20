import { expect, it } from 'vitest'

it('the public entry exports the tool module, its port and its parameter protocol', async () => {
  const root = (await import('@omne-harness/workspace-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'answerText',
    'attachWorkspaceSwitch',
    'createSwitchWorkspaceAuthor',
    'switchAdoption',
    'switchContract',
    'switchParameterCodec',
    'switchWorkspaceToolModule',
    'workspaceSwitchOf',
  ])
})
