import { expect, it } from 'vitest'
import * as assets from '@omne-harness/assets'

it('exports the registry, identity, and pin operations', () => {
  expect(Object.keys(assets).sort()).toEqual([
    'capabilityId',
    'createCategoryRegistry',
    'pinBody',
    'readBodyText',
    'refusal',
    'unknownCategory',
  ])
})
