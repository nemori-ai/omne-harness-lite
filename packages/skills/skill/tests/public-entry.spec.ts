import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill'

it('exports the two factories on the root entry', () => {
  expect(Object.keys(skill).sort()).toStrictEqual(['createPackageInspection', 'createSkillAccess'])
})
