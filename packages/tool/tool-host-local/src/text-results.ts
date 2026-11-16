import { fail, succeed } from '@omne-harness/operation-result'
import {
  defaultResultPolicy,
  type TextResultFactory,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'

const LOGICAL_BLOCK_ID = 'logical'

export function createLocalTextResults() {
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
  } satisfies TextResultFactory<ToolMessageContentBlock>)
}
