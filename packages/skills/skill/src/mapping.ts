import type { SkillFailure } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'

export type SnapshotSourceFailure = Extract<
  SkillFailure,
  { kind: 'basis-unavailable' | 'source-unavailable' | 'outside-package' }
>

export type OpenSourceFailure = Extract<
  SkillFailure,
  {
    kind:
      | 'basis-unavailable'
      | 'source-unavailable'
      | 'resource-missing'
      | 'version-changed'
      | 'outside-package'
  }
>

type Row = Readonly<{
  snapshot: (basis: boolean) => SnapshotSourceFailure
  open: (basis: boolean) => OpenSourceFailure
}>

const SOURCE_UNAVAILABLE = Object.freeze({ kind: 'source-unavailable' } as const)
const VERSION_CHANGED = Object.freeze({ kind: 'version-changed' } as const)
const OUTSIDE_PACKAGE = Object.freeze({ kind: 'outside-package' } as const)
const RESOURCE_MISSING = Object.freeze({ kind: 'resource-missing' } as const)
const BASIS_UNAVAILABLE = Object.freeze({ kind: 'basis-unavailable' } as const)

const always =
  <F>(failure: F): ((basis: boolean) => F) =>
  () =>
    failure

const packageGone = (basis: boolean) => (basis ? BASIS_UNAVAILABLE : SOURCE_UNAVAILABLE)

const TABLE: Readonly<Record<SourceFailure, Row>> = {
  'package-not-found': {
    snapshot: packageGone,
    open: packageGone,
  },
  'entry-not-found': {
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(RESOURCE_MISSING),
  },
  'bytes-mismatch': {
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(VERSION_CHANGED),
  },
  'outside-package': {
    snapshot: always(OUTSIDE_PACKAGE),
    open: always(OUTSIDE_PACKAGE),
  },
  unavailable: {
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(SOURCE_UNAVAILABLE),
  },
  'entry-unreadable': {
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(SOURCE_UNAVAILABLE),
  },
}

export function isSourceFailure(value: unknown): value is SourceFailure {
  return typeof value === 'string' && Object.hasOwn(TABLE, value)
}

export function sourceFailureTo(
  op: 'snapshot',
  failure: SourceFailure,
  basis: boolean,
): SnapshotSourceFailure
export function sourceFailureTo(
  op: 'open',
  failure: SourceFailure,
  basis: boolean,
): OpenSourceFailure
export function sourceFailureTo(
  op: 'snapshot' | 'open',
  failure: SourceFailure,
  basis: boolean,
): SnapshotSourceFailure | OpenSourceFailure {
  return TABLE[failure][op](basis)
}
