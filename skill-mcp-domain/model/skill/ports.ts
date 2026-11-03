// Skill 限界上下文：需求端口（Skill 声明，组外实现）。
// 成员落点：@omne-harness/skill-contract 的 `./provider` 子路径——只给实现方看，
// 消费者从公开根拿不到 SkillRef 与 sealSnapshot（接口隔离）。
// 每个端口在 `./testing` 有符合性套件；替身通过不等于读取权、解析或耐久已验证。

import type { Access, CapabilityId, Outcome } from '../shared.ts'
import type {
  Bytes,
  DeclaredProjection,
  PackageDigest,
  PackageLocator,
  PackagePath,
  SafeReason,
  SkillMaterialBasis,
  SkillName,
  SkillPackageSnapshot,
  SkillRef,
} from './values.ts'

/** 唯一的失败是「此刻无法判定」。确定没有不是失败。 */
export type Reply<T> = Promise<Outcome<T, 'unknown'>>

// ───────────── 字节来源 ─────────────

export type SourceFailure =
  | 'package-not-found'
  | 'entry-not-found'
  | 'bytes-mismatch'
  | 'outside-package'
  | 'unavailable'

/** 只交字节。所有实现共用一套符合性测试：内容摘要相同则内容相同，失败种类相同。 */
export interface SkillPackageSource {
  snapshot(locator: PackageLocator): Promise<Outcome<SkillPackageSnapshot, SourceFailure>>
  open(
    locator: PackageLocator,
    digest: PackageDigest,
    path: PackagePath,
  ): Promise<Outcome<Bytes, SourceFailure>>
}

// ───────────── 对应与读取权 ─────────────

/**
 * resolve 的答复次序固定：known-unavailable → adopted / basis-not-lawful → none → unknown。
 * 对无权主体，答复不随身份是否存在而变（符合性套件核对）。
 */
export type Resolution =
  | Readonly<{
      kind: 'known-unavailable'
      capability: CapabilityId
      reason: SafeReason
      name: SkillName
      description?: string
    }>
  | Readonly<{ kind: 'adopted'; ref: SkillRef; declared: DeclaredProjection }>
  | Readonly<{ kind: 'basis-not-lawful' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unknown' }>

/** adopted() 只交两种身份：当前合法集合里没有 none/unknown/basis-not-lawful。 */
export type CatalogResolution = Extract<Resolution, { kind: 'adopted' | 'known-unavailable' }>

/** S 是作用域，由调用方给出，Skill 不解释，只原样交给端口。 */
export interface SkillResolution<P, S> {
  resolve(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis }>,
  ): Promise<Resolution>
  adopted(access: Access<P>, scope: S): Reply<readonly CatalogResolution[]>
}

export type ReadVerdict = 'granted' | 'refused' | 'unknown'

/** 只按能力标识判定。对无权主体，答复不随身份是否存在而变。 */
export interface SkillReadCheck<P, S> {
  check(access: Access<P>, scope: S, capability: CapabilityId): Promise<ReadVerdict>
}

/** 一个应用服务需要的全部端口。用对象参数注入（依赖倒置）。 */
export type SkillPorts<P, S> = Readonly<{
  source: SkillPackageSource
  resolution: SkillResolution<P, S>
  readCheck: SkillReadCheck<P, S>
}>
