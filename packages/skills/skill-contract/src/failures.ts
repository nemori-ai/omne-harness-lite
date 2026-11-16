import type { StandIn } from './values.ts'

export type UnsupportedWhat = 'no-readable-package'

export type SkillFailure =
  | Readonly<{ kind: 'not-available-to-you' }>
  | Readonly<{ kind: 'unavailable-stand-in'; standIn: StandIn }>
  | Readonly<{ kind: 'bad-path' }>
  | Readonly<{ kind: 'outside-package' }>
  | Readonly<{ kind: 'resource-missing' }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'adopted-material-changed' }>
  | Readonly<{ kind: 'version-changed' }>
  | Readonly<{ kind: 'source-unavailable' }>
  | Readonly<{ kind: 'unsupported'; what: UnsupportedWhat }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'unknown' }>

type Kinds<K extends SkillFailure['kind']> = Extract<SkillFailure, { kind: K }>

export type GateFailure = Kinds<'not-available-to-you' | 'unavailable-stand-in' | 'unknown'>

export type DescribeFailure = GateFailure | Kinds<'basis-unavailable'>

export type PinFailure =
  | DescribeFailure
  | Kinds<
      | 'unsupported'
      | 'adopted-material-changed'
      | 'source-unavailable'
      | 'aborted'
      | 'outside-package'
    >

export type ListFailure = PinFailure

export type ReadFailure =
  | PinFailure
  | Kinds<'bad-path' | 'outside-package' | 'resource-missing' | 'version-changed'>

export type ExportFailure =
  | Exclude<PinFailure, Kinds<'adopted-material-changed'>>
  | Kinds<'outside-package' | 'resource-missing' | 'version-changed'>

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

export type InspectRejection = Extract<InspectFailure, { kind: 'rejected' }>
