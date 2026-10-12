import { expect, test } from 'vitest'
import { answerPresence, checkManifestGivenReadInput } from '../src/index.ts'

test('an invalid given-read head and unknown presence remain distinct from available facts', () => {
  expect(checkManifestGivenReadInput('session', -1)).toEqual({ failure: 'invalidInput' })
  expect(checkManifestGivenReadInput('session', 0)).toHaveProperty('ok')
  expect(answerPresence({ known: 'present' }, ['known', 'unknown'])).toEqual({
    failure: 'unavailable',
  })
})
