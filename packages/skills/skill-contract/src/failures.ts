// The failures of the Skill context: one complete union, narrowed per operation so that each
// signature names only the kinds that the operation can give.
import type { StandIn } from './values.ts'

/** What is not supported. Text and bytes are both representable, and inspection has no dialect. */
export type UnsupportedWhat = 'no-readable-package'

export type SkillFailure =
  /** No permission, no such identity, or a basis for another identity: the three look the same. */
  | Readonly<{ kind: 'not-available-to-you' }>
  | Readonly<{ kind: 'unavailable-stand-in'; standIn: StandIn }>
  | Readonly<{ kind: 'bad-path' }>
  | Readonly<{ kind: 'outside-package' }>
  | Readonly<{ kind: 'resource-missing' }>
  /** Only with a basis. */
  | Readonly<{ kind: 'basis-unavailable' }>
  /** Only without a basis. */
  | Readonly<{ kind: 'adopted-material-changed' }>
  | Readonly<{ kind: 'version-changed' }>
  | Readonly<{ kind: 'source-unavailable' }>
  | Readonly<{ kind: 'unsupported'; what: UnsupportedWhat }>
  /** The caller aborted. No port is called after that and no partial content is given. */
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'unknown' }>

type Kinds<K extends SkillFailure['kind']> = Extract<SkillFailure, { kind: K }>

/** Basis identity, read check and resolution: every operation passes this part. */
export type GateFailure = Kinds<'not-available-to-you' | 'unavailable-stand-in' | 'unknown'>

/** `describe` reads no bytes, so it has no source failure. */
export type DescribeFailure = GateFailure | Kinds<'basis-unavailable'>

/**
 * Pinning the material and taking the snapshot: shared by `read`, `list` and `export`. The
 * snapshot itself can answer `outside-package` when a link of the package leaves its root.
 */
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

/** `export` always has a basis, so it never gives `adopted-material-changed`. */
export type ExportFailure =
  | Exclude<PinFailure, Kinds<'adopted-material-changed'>>
  | Kinds<'outside-package' | 'resource-missing' | 'version-changed'>

/** The rejection reasons of an inspection, in the order in which the first one is given. */
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
