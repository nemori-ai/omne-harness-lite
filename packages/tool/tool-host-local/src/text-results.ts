// The text result factory of the guard table (row 6): the text of a logical terminal (an argument
// failure, a dummy) as one block. The default result policy judges the block, so the factory
// cannot make a block that the ledger would later refuse to preserve.
import { fail, succeed } from '@omne-harness/operation-result'
import {
  defaultResultPolicy,
  type TextResultFactory,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'

/** The id of the one block; a result made here has no other block to tell it from. */
const LOGICAL_BLOCK_ID = 'logical'

/**
 * Makes the text result of a logical terminal: one text block, visible to the human and to the
 * model, with no data, no original and no attachment. A value that the policy rejects is a
 * refusal that names the rule; the ledger turns it into `unavailable` (`result-factory`).
 */
export function createLocalTextResults(): TextResultFactory<ToolMessageContentBlock> {
  return Object.freeze({
    text(value: string) {
      const judged = defaultResultPolicy.judge({
        kind: 'text',
        id: LOGICAL_BLOCK_ID,
        visibility: { toHuman: true, toModel: true },
        text: value,
      } as never)
      if ('failure' in judged) return fail({ reason: judged.failure.reason })
      return succeed({
        content: [judged.ok],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      } as const)
    },
  })
}
