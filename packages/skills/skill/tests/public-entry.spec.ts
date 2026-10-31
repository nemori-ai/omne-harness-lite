import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill'

it('exports the skill body port', () => {
  expect(Object.keys(skill).sort()).toEqual(['skillBodyContract'])
})
