// The one table from a source answer to a service failure. Nothing else in this member knows
// this mapping. Three columns: `inspect`, and the `snapshot` and `open` calls of the
// byte-reading operations `read`, `list` and `export`. Rows follow the group page "端口" table
// and the SPEC "需求端口" additions.
import type { InspectFailure, SkillFailure } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'

/** What a source answer at `snapshot` becomes for `read`, `list` and `export`. */
export type SnapshotSourceFailure = Extract<
  SkillFailure,
  { kind: 'basis-unavailable' | 'source-unavailable' | 'outside-package' }
>

/** What a source answer at `open` becomes for `read` and `export`. */
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

/** `basis` says whether the operation carries a Skill material basis. `inspect` has none. */
type Row = Readonly<{
  inspect: InspectFailure
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

/** The package is not there: with a basis the named material is gone, without one the source is. */
const packageGone = (basis: boolean) => (basis ? BASIS_UNAVAILABLE : SOURCE_UNAVAILABLE)

const TABLE: Readonly<Record<SourceFailure, Row>> = {
  'package-not-found': { inspect: SOURCE_UNAVAILABLE, snapshot: packageGone, open: packageGone },
  // A snapshot does not answer about one entry. A source that does is not usable.
  'entry-not-found': {
    inspect: SOURCE_UNAVAILABLE,
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(RESOURCE_MISSING),
  },
  'bytes-mismatch': {
    inspect: VERSION_CHANGED,
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(VERSION_CHANGED),
  },
  'outside-package': {
    inspect: {
      kind: 'rejected',
      code: 'outside-package',
      detail: 'an entry or a link of the package resolves outside its root',
    },
    snapshot: always(OUTSIDE_PACKAGE),
    open: always(OUTSIDE_PACKAGE),
  },
  unavailable: {
    inspect: SOURCE_UNAVAILABLE,
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(SOURCE_UNAVAILABLE),
  },
  'entry-unreadable': {
    inspect: {
      kind: 'rejected',
      code: 'malformed',
      detail: 'the source cannot read an entry of the package',
    },
    snapshot: always(SOURCE_UNAVAILABLE),
    open: always(SOURCE_UNAVAILABLE),
  },
}

/** Whether `value` names a row of the table: a failure of the closed set of the source. */
export function isSourceFailure(value: unknown): value is SourceFailure {
  return typeof value === 'string' && Object.hasOwn(TABLE, value)
}

export function sourceFailureTo(op: 'inspect', failure: SourceFailure): InspectFailure
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
  op: 'inspect' | 'snapshot' | 'open',
  failure: SourceFailure,
  basis = false,
): InspectFailure | SnapshotSourceFailure | OpenSourceFailure {
  const row = TABLE[failure]
  return op === 'inspect' ? row.inspect : row[op](basis)
}
