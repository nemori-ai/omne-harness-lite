// Skill 限界上下文：应用服务（对外提供的三个窄接口）与它们的结果值。
// 接口在 @omne-harness/skill-contract 的公开根；实现是 @omne-harness/skill 的工厂函数，
// 只依赖端口与公共值，不依赖 Cordis，也不依赖任何调用方的成员。

import type { Access, CapabilityId, JsonLimits, Outcome, SourceLayer } from '../shared.ts'
import type {
  DescribeFailure,
  ExportFailure,
  InspectFailure,
  ListFailure,
  ReadFailure,
} from './failures.ts'
import type { SkillPackageSource, SkillPorts } from './ports.ts'
import type {
  Bytes,
  EntryDigest,
  MediaType,
  PackageDigest,
  PackageEntry,
  PackageLocator,
  PackagePath,
  SafeReason,
  ScriptDeclaration,
  SettingDeclaration,
  SkillDefinition,
  SkillMaterialBasis,
  SkillName,
} from './values.ts'

// ───────────── PackageInspection ─────────────

/** 检查一个包是否是合法的 Skill 包。不交正文，不带 access：它只看字节。 */
export interface PackageInspection {
  inspect(
    locator: PackageLocator,
    options?: Readonly<{ expectedName?: SkillName }>,
  ): Promise<Outcome<SkillDefinition, InspectFailure>>
}

// ───────────── SkillCatalog ─────────────

export type CatalogEntry =
  | Readonly<{
      kind: 'adopted'
      capability: CapabilityId
      name: SkillName
      description?: string
      dependencies: readonly CapabilityId[]
    }>
  | Readonly<{
      kind: 'stand-in'
      capability: CapabilityId
      name: SkillName
      description?: string
      reason: SafeReason
    }>

/** 检索条件：语义随第一波之后的 skill-contract SPEC 确定。 */
export type CatalogQuery = Readonly<{ text: string }>

/**
 * 只在当前合法集合里取。每个身份先经 SkillReadCheck：refused 不出现；
 * 任一 unknown 时整次 unknown。不排序、不按常驻筛选、不求可用性（归调用方）。
 */
export interface SkillCatalog<P, S> {
  summaries(
    access: Access<P>,
    scope: S,
    capabilities?: readonly CapabilityId[],
  ): Promise<Outcome<readonly CatalogEntry[], 'unknown'>>
  search(
    access: Access<P>,
    scope: S,
    query: CatalogQuery,
  ): Promise<Outcome<readonly CatalogEntry[], 'unknown'>>
}

// ───────────── SkillAccess ─────────────

/** 材料状态：要么钉住一份可读的包，要么如实标明没有可读的包。 */
export type MaterialState =
  | Readonly<{ kind: 'pinned'; basis: SkillMaterialBasis }>
  | Readonly<{ kind: 'no-readable-package' }>

export type SkillDescription = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  material: MaterialState
  dependencies: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[] // 只有名字与类别，不含设置值
  addressing: 'package-relative-path' // 资源寻址规则
}>

/** 正文与资源分开读；资源路径是调用方的原始输入，在边界由 toPackagePath 校验。 */
export type ReadTarget = Readonly<{
  capability: CapabilityId
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: string }>
}>

/** 字节范围：起点加长度，构造上不会出现终点在起点之前。 */
export type ByteRange = Readonly<{ start: number; length: number }>

export type ReadContent =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'bytes'; bytes: Bytes }>

export type ReadResult = Readonly<{
  basis: SkillMaterialBasis // 如实标出这一页读的是哪份材料
  part: Readonly<{ kind: 'body' }> | Readonly<{ kind: 'resource'; path: PackagePath }>
  mediaType?: MediaType
  content: ReadContent
  range: ByteRange // 实际交出的范围
  total: number
  complete: boolean // 部分结果不是失败
}>

export type ResourceListing = Readonly<{
  basis: SkillMaterialBasis
  resources: readonly PackageEntry[] // 不含控制文件
}>

export type ExportedEntry = Readonly<{
  path: PackagePath
  mediaType?: MediaType
  size: number
  digest: EntryDigest
  bytes: Bytes
}>

export type SkillExport = Readonly<{
  basis: SkillMaterialBasis
  digest: PackageDigest
  entries: readonly ExportedEntry[] // 全部条目，含控制文件；逐条核对，不交部分包
}>

type ReadOptions = Readonly<{ basis?: SkillMaterialBasis; range?: ByteRange; signal?: AbortSignal }>

/** 每个操作现场核验：先 SkillReadCheck，再 SkillResolution。不缓存读取权。 */
export interface SkillAccess<P, S> {
  describe(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis }>,
  ): Promise<Outcome<SkillDescription, DescribeFailure>>
  read(
    access: Access<P>,
    scope: S,
    target: ReadTarget,
    options?: ReadOptions,
  ): Promise<Outcome<ReadResult, ReadFailure>>
  list(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    options?: Readonly<{ basis?: SkillMaterialBasis; signal?: AbortSignal }>,
  ): Promise<Outcome<ResourceListing, ListFailure>>
  /** 必须带依据：调用方先从 describe 取得。 */
  export(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis: SkillMaterialBasis,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<Outcome<SkillExport, ExportFailure>>
}

// ───────────── 工厂（@omne-harness/skill 的公开根） ─────────────

export type InspectionConfig = Readonly<{ source: SkillPackageSource; declarationLimits: JsonLimits }>
export type AccessConfig = Readonly<{ readDefaultLength: number }>

export declare function createPackageInspection(config: InspectionConfig): PackageInspection
export declare function createSkillCatalog<P, S>(ports: SkillPorts<P, S>): SkillCatalog<P, S>
export declare function createSkillAccess<P, S>(
  ports: SkillPorts<P, S>,
  config: AccessConfig,
): SkillAccess<P, S>
