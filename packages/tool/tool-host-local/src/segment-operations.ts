// 检查点作者一个段的派生身份。一次 start 只跑一个段，一个段至多停在一个等待上，所以 start 的操作身份
// 决定这个段的全部派生身份：等待是 `<start>/wait`，状态与等待请求的保管操作是 `<start>/checkpoint`
// 与 `<start>/wait-request`。这个约定只写在这里；装配从等待身份找回请求的保管操作时也用这里的函数。
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ToolIdentityRejection,
  type ToolOperationId,
  type ToolWaitId,
} from '@omne-harness/tool-contract'
import { decodeToolWaitId } from '@omne-harness/tool-contract/provider'

const WAIT = '/wait'

/** 派生身份不成立的原因：等待身份不是本宿主派生的，或派生的文本不是合法身份。 */
export type SegmentOperationRejection =
  | Readonly<{ field: 'wait'; reason: 'not-a-segment-wait' }>
  | ToolIdentityRejection<'ToolOperationId' | 'ToolWaitId'>

/** 段的等待身份：`<start>/wait`。 */
export function segmentWait(
  start: ToolOperationId,
): Outcome<ToolWaitId, SegmentOperationRejection> {
  return decodeToolWaitId(`${start}${WAIT}`)
}

/** 段的保管操作：状态是 `<start>/checkpoint`，等待请求是 `<start>/wait-request`。 */
export function segmentOperation(
  start: ToolOperationId,
  part: 'checkpoint' | 'wait-request',
): Outcome<ToolOperationId, SegmentOperationRejection> {
  return decodeToolOperationId(`${start}/${part}`)
}

/**
 * 保管一个等待的请求的操作身份。等待必须是本宿主为某个段派生的 `<start>/wait`，否则答
 * `not-a-segment-wait`。
 */
export function waitRequestOperation(
  wait: ToolWaitId,
): Outcome<ToolOperationId, SegmentOperationRejection> {
  if (!wait.endsWith(WAIT) || wait.length === WAIT.length)
    return fail({ field: 'wait', reason: 'not-a-segment-wait' })
  const start = decodeToolOperationId(wait.slice(0, -WAIT.length))
  return 'failure' in start ? start : segmentOperation(start.ok, 'wait-request')
}
