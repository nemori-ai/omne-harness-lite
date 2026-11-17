import { expect, it } from 'vitest'
import {
  BuiltinExtensionsService,
  EnabledExtensionsViewsService,
  ExtensionSourcesService,
  RunLocationsService,
  loopExtensionBuiltinsKey,
  loopExtensionRunLocationsKey,
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
  expect(RunLocationsService.provide).toBe('loopExtensionRunLocations')
  expect(loopExtensionRunLocationsKey).toBe(RunLocationsService.provide)
})

it('exports exactly the four abstract Service classes and the four key constants', async () => {
  const cordis: Record<string, unknown> =
    await import('@omne-harness/loop-extension-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'BuiltinExtensionsService',
    'EnabledExtensionsViewsService',
    'ExtensionSourcesService',
    'RunLocationsService',
    'loopExtensionBuiltinsKey',
    'loopExtensionRunLocationsKey',
    'loopExtensionSourcesKey',
    'loopExtensionViewsKey',
  ])
})
