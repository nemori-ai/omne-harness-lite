// 两个限界上下文共用的公共值：只从现有公共成员取，不另造（G6）。
// 草图用相对路径直接引仓库源码，tsc 因此按真实形状核对。
export type { Ack, Outcome } from '../../../packages/common/operation-result/src/index.ts'
export { ack, fail, succeed } from '../../../packages/common/operation-result/src/index.ts'
export type { Access, TenantId } from '../../../packages/common/legal-identity/src/index.ts'
export type { ContentBlock } from '../../../packages/common/content-block/src/index.ts'
export type {
  BodyContract,
  CapabilityId,
  Declarations,
  JsonLimits,
  JsonValue,
} from '../../../packages/assets/assets/src/index.ts'

declare const brand: unique symbol
/** 品牌类型：语义不同的原始值不能互换。品牌只由校验函数授予。 */
export type Brand<T, B extends string> = T & { readonly [brand]: B }

/** 只读字节。 */
export type Bytes = Uint8Array

/** 来源层：统一语言「来源层」的四格。Skill 与 MCP 都只搬运，不解释。 */
export type SourceLayer = 'official' | 'organization' | 'tenant' | 'workspace'

/** 穷尽检查：新增变体而漏处理时编译失败。 */
export function assertNever(value: never): never {
  throw new Error(`unreachable: ${JSON.stringify(value)}`)
}
