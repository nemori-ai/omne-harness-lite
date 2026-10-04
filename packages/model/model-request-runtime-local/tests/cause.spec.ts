import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  classifyCause,
  type TransportFailure,
  type InvocationPolicy,
} from '@omne-harness-lite/model-request-runtime-local'
const table: InvocationPolicy['statusCauseTable'] = {
  '401': 'credential_unavailable',
  '429': 'upstream_unavailable',
  '400': 'request_rejected',
}
describe('S18 source classification preserves exact raw status', () => {
  it.each([
    [{ source: 'connect' }, 'upstream_unavailable'],
    [{ source: 'stream_broken' }, 'upstream_unavailable'],
    [{ source: 'local' }, 'unrecognized'],
    [{ source: 'http_status', statusCode: 401 }, 'credential_unavailable'],
    [
      { source: 'in_band', statusCode: new LosslessNumber('4.29e2'), inBand: true },
      'upstream_unavailable',
    ],
    [
      { source: 'in_band', statusCode: new LosslessNumber('9007199254740993'), inBand: true },
      'unrecognized',
    ],
  ] satisfies readonly [TransportFailure, string][])(
    '%j -> %s before content',
    (fact, expected) => {
      const before = writeJsonLossless(fact)
      expect(classifyCause(fact, false, table)).toBe(expected)
      expect(classifyCause(fact, true, table)).toBe('interrupted_mid_reply')
      expect(writeJsonLossless(fact)).toBe(before)
    },
  )
})
