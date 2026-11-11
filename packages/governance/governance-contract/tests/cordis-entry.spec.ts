import { expect, it } from 'vitest'

import * as root from '@omne-harness/governance-contract'
import {
  GovernanceContributionsService,
  governanceContributionsKey,
} from '@omne-harness/governance-contract/cordis'

it('keeps the service definition out of the pure root', () => {
  expect('GovernanceContributionsService' in root).toBe(false)
  expect(GovernanceContributionsService.provide).toBe(governanceContributionsKey)
})
