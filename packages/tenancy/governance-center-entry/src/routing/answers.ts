// 线上答复的字节（入口契约 S-6、S-7；https-json/1 S-11～S-15）。
// 四种入口答复各是一份固定字节，模块加载时构造一次、之后只写出；路由结果与公开体检按 S-12 写出。
//
// 体的写出（S-12）：把值投影成成员按 Schema 书写次序插入的普通对象（缺席的可选成员不插入，不写 null），
// 再交给 JSON.stringify——它的字符串写法恰是 RFC 8785 §3.2.2.2 的写法（`"`、`\` 与 U+0000～U+001F 转义，
// 控制字符用 \b\t\n\f\r 或小写 \u00xx，孤立代理码点写 \u 加小写四位，其余码点原样写 UTF-8），
// 不插空白；成员按插入次序写出（本契约的成员名都不是整数形，不受「整数键先排」影响）。
import { responseBytes } from '../ops/wire.ts'
import type { GovernanceCenterId } from '../center-id/table.ts'

/** 四种入口答复（S-6）：四值封闭、互不合并。 */
export type EntryAnswer =
  'version-mismatch' | 'login-state-rejected' | 'unavailable' | 'invalid-input'

const ENTRY_ANSWERS: Record<EntryAnswer, Buffer> = {
  'version-mismatch': responseBytes(JSON.stringify('version-mismatch')),
  'login-state-rejected': responseBytes(JSON.stringify('login-state-rejected')),
  unavailable: responseBytes(JSON.stringify('unavailable')),
  'invalid-input': responseBytes(JSON.stringify('invalid-input')),
}

/** 同一个入口答复值每一次都是这同一份字节（S-6「整个线上答复逐字相同」）。 */
export function entryAnswerBytes(answer: EntryAnswer): Buffer {
  return ENTRY_ANSWERS[answer]
}

/** 路由结果：成功（S-14）。`wire` 已是按 `Result_<路由>` 书写次序投影好的值。 */
export function routeSuccessBytes(wire: unknown): Buffer {
  return responseBytes(JSON.stringify({ result: wire }))
}

/** 路由结果：具名失败，原名透传（S-14）。 */
export function routeFailureBytes(name: string): Buffer {
  return responseBytes(JSON.stringify({ failure: name }))
}

/** 公开体检答复（S-18；https-json/1 S-15）：恰三样、恰此次序；一次运行期间是一份固定字节。 */
export function publicHealthBytes(centerId: GovernanceCenterId, version: string): Buffer {
  return responseBytes(JSON.stringify({ reachable: true, centerId, version }))
}
