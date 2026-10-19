import { expect, it } from 'vitest'
import * as tool from '@omne-harness/tool'

it('exports the tool body port', () => {
  expect(Object.keys(tool).sort()).toEqual(['toolBodyContract'])
})
