import { expect, it } from 'vitest'

it('the cordis entry exports the plugin, its measured-plugin factory and the commit notifier, and nothing else', async () => {
  const cordis = (await import('../src/cordis.ts')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual([
    'SessionProvider',
    'createSessionProviderPlugin',
    'createSessionCommitNotifier',
  ])
})

it('the published cordis entry has the same exports as the source entry', async () => {
  const published = (await import('@omne-harness/session-cordis/cordis')) as Record<string, unknown>
  expect(Object.keys(published)).toEqual([
    'SessionProvider',
    'createSessionProviderPlugin',
    'createSessionCommitNotifier',
  ])
})
