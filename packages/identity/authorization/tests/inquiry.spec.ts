import { expect, it } from 'vitest'
import * as authorization from '../src/index.ts'
import {
  decideInquiry,
  type InquiryPolicy,
  type InquiryRequirement,
  type InquiryDisposition,
} from '../src/index.ts'

it('publishes inquiry handling independently of Session modes', () => {
  expect(authorization).toHaveProperty('decideInquiry')
})

const policies: readonly (InquiryPolicy | null)[] = [
  null,
  { onAsk: 'deny' },
  { onAsk: 'ask-human' },
  { onAsk: 'skip-ask' },
]
const fixed: readonly (readonly [InquiryRequirement, InquiryDisposition])[] = [
  ['prohibited', 'deny'],
  ['unavailable', 'unavailable'],
  ['none', 'continue'],
]

it.each(fixed)('preserves %s regardless of inquiry handling', (requirement, expected) => {
  for (const policy of policies) expect(decideInquiry(requirement, policy)).toBe(expected)
})

it('requires a policy for an inquiry and distinguishes asking, denying and skipping', () => {
  expect(policies.map(policy => decideInquiry('required', policy))).toEqual([
    'unavailable',
    'deny',
    'ask-human',
    'continue',
  ])
})
