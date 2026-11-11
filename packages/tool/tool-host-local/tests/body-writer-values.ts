import { fail } from '@omne-harness/operation-result'
import type { ToolBodyWrites } from '@omne-harness/tool-contract/provider'

const unavailable = async () =>
  fail({
    kind: 'unavailable' as const,
    operation: 'body-writer-fixture',
    reason: 'This fixture has no body custody.',
  })

export const unavailableBodyWrites: ToolBodyWrites<unknown> = {
  begin: unavailable,
  append: unavailable,
  seal: unavailable,
  inspect: unavailable,
}
