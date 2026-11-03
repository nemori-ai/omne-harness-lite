import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill-contract'

it('exports the skill body port', () => {
  expect(Object.keys(skill).sort()).toEqual([
    'computeDigest',
    'inferMediaType',
    'isControlFile',
    'parseSkillPackage',
    'projectAssetBody',
    'skillBodyContract',
    'toAssetVersion',
    'toPackageDigest',
    'toPackagePath',
    'toSafeReason',
    'toSkillName',
  ])
})
