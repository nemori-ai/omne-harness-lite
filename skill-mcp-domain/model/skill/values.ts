// Skill 限界上下文：值对象。
// 全部不可变。没有有状态的聚合：持有、选择与采用的状态都在其他拥有者那里（G1）。
// 成员落点：@omne-harness/skill-contract 的公开根 `.`。

import type { Brand, Bytes, CapabilityId, SourceLayer } from '../shared.ts'

// ───────────── 品牌原始值：只由 functions.ts 里的校验函数授予 ─────────────

/** 1–64 位，小写字母、数字与连字符；不以连字符开头或结尾，不含连续连字符。 */
export type SkillName = Brand<string, 'SkillName'>
/** 规范化的包内相对路径：无绝对路径、无 `..` 段、无反斜杠、无空段。 */
export type PackagePath = Brand<string, 'PackagePath'>
/** 一个条目字节的内容摘要（散列值，不是文字摘要）。 */
export type EntryDigest = Brand<string, 'EntryDigest'>
/** Skill 包快照的内容摘要：由排序后的「包内路径 + 条目内容摘要」算出，不含包根目录名。 */
export type PackageDigest = Brand<string, 'PackageDigest'>
/** 资产版本引用：由资产一侧给出，Skill 不解释。 */
export type AssetVersion = Brand<string, 'AssetVersion'>
/** 可以向该主体说明的不可用原因。不含秘密，不披露无权知道的内容。 */
export type SafeReason = Brand<string, 'SafeReason'>
/** 媒体类型。缺席不表示文本。 */
export type MediaType = Brand<string, 'MediaType'>

// ───────────── Skill 包快照：构造即一致 ─────────────

export type PackageEntry = Readonly<{
  path: PackagePath
  encoding: 'text' | 'binary'
  size: number
  mediaType?: MediaType
  digest: EntryDigest
}>

/**
 * Skill 包快照。只能经 `sealSnapshot` 构造：
 * - 路径不重复，没有文件与目录的前缀冲突；
 * - `digest` 总是由 `entries` 算出，二者不会对不上。
 * 包根目录名由来源交出，用来核对 name，不进入内容摘要。
 */
export type SkillPackageSnapshot = Brand<
  Readonly<{ rootName: string; entries: readonly PackageEntry[]; digest: PackageDigest }>,
  'SkillPackageSnapshot'
>

/** 包定位：对 Skill 不透明，只在 SkillRef 里随来源传递。 */
export type PackageLocator =
  | Readonly<{ kind: 'directory'; root: string }>
  | Readonly<{ kind: 'content-store'; digest: PackageDigest }>

// ───────────── 清单与声明 ─────────────

/** SKILL.md 头部的解释。不认识的字段原样保留在 `extra`，不解释。 */
export type SkillManifest = Readonly<{
  name: SkillName
  description: string // 1–1024 个字符
  license?: string
  compatibility?: string
  metadata?: Readonly<Record<string, string>>
  allowedTools?: readonly string[] // 只作元数据，不授予任何东西
  extra: Readonly<Record<string, unknown>>
}>

export type ScriptDeclaration = Readonly<{
  entry: PackagePath
  runKind: string // 运行种类：值域随 skill-contract 的 SPEC 封闭
  facilities: readonly string[] // 设施需要：只是名字，是否齐备不由 Skill 判定
  parameters?: unknown // 参数形状：原样交出
}>

export type SettingDeclaration = Readonly<{
  name: string
  category: string // 类别集合归资产设置拥有者
}>

/** `.omne/skill.json` 中本系统认的声明。只有名字与形状，不含设置值。 */
export type SkillDeclaration = Readonly<{
  dependencies: readonly CapabilityId[] // 依赖声明：类别为 tool 的能力标识
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
}>

/** 一次检查的结果。不含正文：正文只经 SkillAccess.read 取得。 */
export type SkillDefinition = Readonly<{
  manifest: SkillManifest
  declaration: SkillDeclaration
  snapshot: SkillPackageSnapshot
}>

/** 资产正文的声明投影（由 projectAssetBody 产出，也由 SkillResolution 交回）。 */
export type DeclaredProjection = Readonly<{
  name: SkillName
  description?: string
  tools: readonly CapabilityId[]
  scripts: readonly ScriptDeclaration[]
  settings: readonly SettingDeclaration[]
  packageDigest?: PackageDigest // 旧正文缺 package.digest 时缺席
}>

/** 脚本身份：能力标识加入口。许可规则可以引用它；是否准许执行不由 Skill 判定。 */
export type ScriptIdentity = Readonly<{ capability: CapabilityId; entry: PackagePath }>

// ───────────── 材料：内部引用与对外依据分开 ─────────────

/**
 * Skill 材料依据：对外交出的、指明一份具体材料的值。不含包定位，
 * 所以调用方不能借依据指定包的位置。依据只指明材料，不授予访问。
 * 同一材料由（能力标识、来源层、内容摘要）判定；工作区来源没有资产版本。
 */
export type SkillMaterialBasis = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  digest: PackageDigest
}>

/**
 * Skill 内部引用：只在 Skill 与 SkillResolution 之间传递，从不交给调用方。
 * `digest` 缺席表示资产正文缺 package.digest（没有可读的包）。
 */
export type SkillRef = Readonly<{
  capability: CapabilityId
  layer: SourceLayer
  assetVersion?: AssetVersion
  locator: PackageLocator
  digest?: PackageDigest
}>

/** 替换件：合法已知、此刻不可用的身份，带最后合法的 name、说明与安全原因。 */
export type StandIn = Readonly<{
  capability: CapabilityId
  name: SkillName
  description?: string
  reason: SafeReason
}>

export type { Bytes }
