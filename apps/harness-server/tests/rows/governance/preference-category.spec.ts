import { expect, it } from 'vitest'
import { preferenceCategory } from '../../../src/rows/governance/preference-settings.ts'

it('names the preference group 偏好 and refuses every body, so nothing is published under it', () => {
  expect(preferenceCategory.contract.category).toBe('preference')
  expect(preferenceCategory.display.title).toBe('偏好')
  for (const body of [null, {}, { value: 1 }, 'text', []])
    expect(preferenceCategory.contract.judge(body)).toEqual({
      ok: false,
      rejected: 'not-publishable',
    })
})
