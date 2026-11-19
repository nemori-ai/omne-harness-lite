import { expect, it } from 'vitest'

it('the root entry exports the layout model, the range choices and Present, nothing of Cordis', async () => {
  const root = (await import('../src/index.ts')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
      'POSITIONS',
      'Present',
      'RANGES',
      'RANGE_LABELS',
      'SHAPES',
      'USAGE_LAYOUTS_KEY',
      'WIDTHS',
      'addTo',
      'arrange',
      'layoutOf',
      'layoutsOf',
      'moveAt',
      'pick',
      'presentAt',
      'removeAt',
      'resizeAt',
      'storedLayouts',
      'windowOf',
    ].sort(),
  )
})
