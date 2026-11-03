// Skill 限界上下文：失败联合。
// 一份总表 SkillFailure，再按操作用 Extract 收窄：签名只说出该操作真会返回的种类（诚实签名）。

import type { StandIn } from './values.ts'

export type SkillFailure =
  | Readonly<{ kind: 'not-available-to-you' }> // 无权、身份不存在、依据身份不符，三者不可区分
  | Readonly<{ kind: 'unavailable-stand-in'; standIn: StandIn }>
  | Readonly<{ kind: 'bad-path' }>
  | Readonly<{ kind: 'outside-package' }>
  | Readonly<{ kind: 'resource-missing' }>
  | Readonly<{ kind: 'basis-unavailable' }> // 只在带依据时
  | Readonly<{ kind: 'adopted-material-changed' }> // 只在不带依据时
  | Readonly<{ kind: 'version-changed' }>
  | Readonly<{ kind: 'source-unavailable' }>
  | Readonly<{ kind: 'unsupported'; what: UnsupportedWhat }>
  | Readonly<{ kind: 'aborted' }> // 中止结果的表示：草图提议，随 skill-contract 的 SPEC 封闭
  | Readonly<{ kind: 'unknown' }>

export type UnsupportedWhat = 'no-readable-package' | 'binary-not-representable' | 'dialect'

type Pick<K extends SkillFailure['kind']> = Extract<SkillFailure, { kind: K }>

/** 识别与对应：每个操作都走这一段。 */
export type GateFailure = Pick<'not-available-to-you' | 'unavailable-stand-in' | 'unknown'>

/** describe 不读字节，所以没有来源类失败。 */
export type DescribeFailure = GateFailure | Pick<'basis-unavailable'>

/** 钉住材料并核对快照：read、list、export 共有。 */
export type PinFailure =
  | DescribeFailure
  | Pick<'unsupported' | 'adopted-material-changed' | 'source-unavailable' | 'aborted'>

export type ListFailure = PinFailure

export type ReadFailure =
  | PinFailure
  | Pick<'bad-path' | 'outside-package' | 'resource-missing' | 'version-changed'>

/** export 必须带依据，所以不会出现 adopted-material-changed。 */
export type ExportFailure =
  | Exclude<PinFailure, Pick<'adopted-material-changed'>>
  | Pick<'outside-package' | 'resource-missing' | 'version-changed'>

/** 检查的结果集合封闭：通过、拒绝（按次序给第一个）、两种失败。 */
export const INSPECT_REJECTIONS = [
  'manifest-missing',
  'name-mismatch',
  'declaration-format-unsupported',
  'outside-package',
  'tool-ref-invalid',
  'setting-category-unknown',
  'malformed',
] as const
export type InspectRejectionCode = (typeof INSPECT_REJECTIONS)[number]

export type InspectFailure =
  | Readonly<{ kind: 'rejected'; code: InspectRejectionCode; detail?: string }>
  | Readonly<{ kind: 'source-unavailable' }>
  | Readonly<{ kind: 'version-changed' }>
