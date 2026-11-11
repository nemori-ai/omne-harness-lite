// 检查点作者一个段的派生身份。一次 start 只跑一个段，一个段至多停在一个等待上，所以 start 的操作身份
// 决定这个段的等待身份：`<start>/wait`。这个约定只写在这里。
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ToolIdentityRejection,
  ToolOperationId,
  ToolWaitId,
} from '@omne-harness/tool-contract'
import { decodeToolWaitId } from '@omne-harness/tool-contract/provider'

/** 段的等待身份：`<start>/wait`。 */
export function segmentWait(
  start: ToolOperationId,
): Outcome<ToolWaitId, ToolIdentityRejection<'ToolWaitId'>> {
  return decodeToolWaitId(`${start}/wait`)
}
