import { expect, it } from 'vitest'

it('the cordis entry makes the module and names the key the assembly hands to the composer', async () => {
  const cordis = (await import('@omne-harness/slash-command-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'createSlashCommandUiModule',
    'slashCommandComposerKey',
  ])
  expect(cordis['slashCommandComposerKey']).toBe('slash-command.composer')
})
