import { describe, expect, it } from 'vitest'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SettlementPrefix } from '@omne-harness-lite/model-request-runtime'
import { readDemoNoRunFailure } from '../src/no-run-failure-history.ts'

const parsed = parseOpaqueIdentifier('call-failure-history', 'ModelCallId')
if (!isOk(parsed)) throw new Error('invalid test call')

describe('demo noRun failure history boundary', () => {
  it('does not reinterpret an unknown runner conclusion as an empty retry history', () => {
    const injected = {
      entries: [{ readKeys: ['runner/retry-conclusion'], dedupeKey: 'runner/retry-conclusion' }],
    } as unknown as SettlementPrefix
    expect(readDemoNoRunFailure(injected, parsed.ok)).toEqual({ unavailable: true })
  })

  it('does not reinterpret foreign Run facts as noRun history', () => {
    const injected = {
      entries: [{ readKeys: [], run: 'run-foreign', attempt: 1 }],
    } as unknown as SettlementPrefix
    expect(readDemoNoRunFailure(injected, parsed.ok)).toEqual({ unavailable: true })
  })
})
