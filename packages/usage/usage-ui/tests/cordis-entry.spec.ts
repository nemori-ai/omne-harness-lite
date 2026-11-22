import { expect, it } from 'vitest'

it('the cordis entry gives the module factory, the example module, the two points and the place names', async () => {
  const cordis = (await import('../src/cordis.tsx')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(
    [
      'USAGE_IN_SESSION',
      'USAGE_PAGE',
      'USAGE_PRESENTATION',
      'USAGE_STATUS',
      'USAGE_WIDGET',
      'createUsageUiModule',
      'memoryLayoutStore',
      'usageExampleModule',
      'usagePresentation',
      'usageWidget',
    ].sort(),
  )
})
