// The participant module's own judgments that the port cannot reach through a commit: an answer
// it cannot build is a reported failure, never a throw.
import { describe, expect, it } from 'vitest'
import type { CommitReceipt, SessionCommand, WorkSnapshot } from '@omne-harness/session-contract'
import { resultOf } from '../src/worker/participant.ts'

const receipt = {
  operation: 'op',
  revision: '2',
  first: '3',
  last: '3',
} as unknown as CommitReceipt
const withoutControls = { controls: [] } as unknown as WorkSnapshot

describe('the result of a committed control command', () => {
  for (const kind of ['cancelRun', 'stopCall'] as const)
    it(`${kind} without a control progress item answers no result instead of throwing`, () => {
      const command = { kind, input: { operation: 'op' } } as unknown as SessionCommand
      let result: unknown
      expect(() => {
        result = resultOf(command, withoutControls, receipt)
      }).not.toThrow()
      expect(result).toBeNull()
    })
})
