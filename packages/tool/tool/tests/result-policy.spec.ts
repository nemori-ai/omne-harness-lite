import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { defaultResultPolicyAdoption, defaultResultPolicyRules } from '@omne-harness/tool'

it('names the default result policy with a digest that a reader can recompute', () => {
  const digest = createHash('sha256').update(JSON.stringify(defaultResultPolicyRules)).digest('hex')
  expect(defaultResultPolicyAdoption).toEqual({
    owner: '@omne-harness/tool',
    name: 'default-result-policy',
    revision: '1',
    digest: `sha256:${digest}`,
  })
})

it('accepts only text and shared reference blocks and names what it rejects', () => {
  expect(defaultResultPolicyRules.accept).toEqual([
    'text',
    'voice-reference',
    'image-reference',
    'file-reference',
  ])
  expect(defaultResultPolicyRules.reject).toEqual([
    'thinking',
    'inline-media',
    'inline-file',
    'nested-container',
    'unknown-kind',
  ])
})

it('cannot be changed in place after import', () => {
  expect(Object.isFrozen(defaultResultPolicyRules)).toBe(true)
  expect(Object.isFrozen(defaultResultPolicyRules.accept)).toBe(true)
  expect(Object.isFrozen(defaultResultPolicyAdoption)).toBe(true)
})
