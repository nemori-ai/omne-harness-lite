import { expect, it } from 'vitest'
import {
  BuiltinExtensionsService,
  EnabledExtensionsViewsService,
  ExtensionSourcesService,
  loopExtensionBuiltinsKey,
  loopExtensionSourcesKey,
  loopExtensionViewsKey,
} from '@omne-harness/loop-extension-cordis-contract/cordis'

it('writes each service key once, on its abstract Service, and exports a constant equal to it', () => {
  expect(EnabledExtensionsViewsService.provide).toBe('loopExtensionViews')
  expect(loopExtensionViewsKey).toBe(EnabledExtensionsViewsService.provide)
  expect(BuiltinExtensionsService.provide).toBe('loopExtensionBuiltins')
  expect(loopExtensionBuiltinsKey).toBe(BuiltinExtensionsService.provide)
  expect(ExtensionSourcesService.provide).toBe('loopExtensionSources')
  expect(loopExtensionSourcesKey).toBe(ExtensionSourcesService.provide)
})

it('exports exactly the three abstract Service classes and the three key constants', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/loop-extension-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'BuiltinExtensionsService',
    'EnabledExtensionsViewsService',
    'ExtensionSourcesService',
    'loopExtensionBuiltinsKey',
    'loopExtensionSourcesKey',
    'loopExtensionViewsKey',
  ])
})
