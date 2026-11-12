import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill'

it('exports the three factories on the root entry', () => {
  expect(Object.keys(skill).sort()).toStrictEqual([
    'createPackageInspection',
    'createSkillAccess',
    'createSkillCatalog',
  ])
})
