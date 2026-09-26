import { strict as assert } from 'node:assert'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS, IDENTITY_TYPE_NAMES, parseAccountId, unwrap } from '@omne-harness-lite/identity-values'
import { deriveState, instantFromEpochMs, parseOfferTtl, timingFrom } from '@omne-harness-lite/offer-expiry'
assert.equal(Object.isFrozen(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS), true)
assert.equal(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS.length, 26)
assert.equal(IDENTITY_TYPE_NAMES.length, 5)
assert.equal(unwrap(parseAccountId('account')), 'account')
const timing = unwrap(timingFrom(unwrap(instantFromEpochMs(1000)), unwrap(parseOfferTtl(500))))
assert.equal(deriveState({ timing, now: unwrap(instantFromEpochMs(1500)), settled: null, target: 'exists' }), 'pending')
assert.equal(deriveState({ timing, now: 'unavailable', settled: null, target: 'exists' }), 'unavailable')
console.log('PASS: built package exports consumed independently; immutable collection and existing offer behavior')
