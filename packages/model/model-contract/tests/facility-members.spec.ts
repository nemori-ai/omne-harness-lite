// @module-tag slow
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { facilityDifferences, facilityFiles } from './facility-sync.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const sibling = join(packageDirectory, '..', 'model-cordis-contract')

it('keeps the install-closure facility of model-contract and model-cordis-contract byte for byte the same', () => {
  expect(facilityFiles(packageDirectory).length).toBeGreaterThan(0)
  expect(facilityDifferences(packageDirectory, sibling)).toEqual([])
})
