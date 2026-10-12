// 接收上界、接收时限与读尽上界的取值（https-json/1 S-10 的下限表、S-5、S-3「取值归入口层的实现映射」）。
// 取值就是契约冻结的下限：下限之内不被切，超出下限即切——两张面同一组值（运维面只用头部块与请求体两项上界）。
// 是包内常量、不是 config：可配就可能配到下限以下。放在 ops 目录下的理由同 wire.ts。
import type { ConnectionLimits } from './http1.ts'

export interface ReceiveLimits extends ConnectionLimits {
  /** 请求体 JSON 的嵌套深度上界（只客户端面）。 */
  readonly jsonDepth: number
  /** 请求体 JSON 里任何一个对象的成员数上界（只客户端面）。 */
  readonly objectMembers: number
}

export const RECEIVE_LIMITS: ReceiveLimits = Object.freeze({
  headerBlockBytes: 8192,
  bodyBytes: 65536,
  jsonDepth: 64,
  objectMembers: 1024,
  receiveTimeoutMs: 30_000,
  // 读尽上界与请求体上界同值、同一计量层（S-5）
  drainBytes: 65536,
  drainTimeoutMs: 5_000,
})
