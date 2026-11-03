// The one table from a source answer to a service failure. Nothing else in this member knows
// this mapping. Rows follow the group page "端口" table and the SPEC "需求端口" additions.
import type { InspectFailure, SkillFailure } from '@omne-harness/skill-contract'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'

/** `inspect`, or the byte-reading operations `read`, `list` and `export`, which share one row. */
export type SourceOp = 'inspect' | 'access'

/** What a source answer becomes for `read`, `list` and `export`. */
export type AccessSourceFailure = Extract<
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
  inspect: InspectFailure
  /** `basis` says whether the operation carries a Skill material basis. */
  access: (basis: boolean) => AccessSourceFailure
}>

const SOURCE_UNAVAILABLE = Object.freeze({ kind: 'source-unavailable' } as const)
const VERSION_CHANGED = Object.freeze({ kind: 'version-changed' } as const)

const always =
  (failure: AccessSourceFailure): Row['access'] =>
  () =>
    failure

const TABLE: Readonly<Record<SourceFailure, Row>> = {
  'package-not-found': {
    inspect: SOURCE_UNAVAILABLE,
    access: basis => (basis ? { kind: 'basis-unavailable' } : SOURCE_UNAVAILABLE),
  },
  'entry-not-found': {
    inspect: SOURCE_UNAVAILABLE,
    access: always({ kind: 'resource-missing' }),
  },
  'bytes-mismatch': { inspect: VERSION_CHANGED, access: always(VERSION_CHANGED) },
  'outside-package': {
    inspect: {
      kind: 'rejected',
      code: 'outside-package',
      detail: 'an entry or a link of the package resolves outside its root',
    },
    access: always({ kind: 'outside-package' }),
  },
  unavailable: { inspect: SOURCE_UNAVAILABLE, access: always(SOURCE_UNAVAILABLE) },
  'entry-unreadable': {
    inspect: {
      kind: 'rejected',
      code: 'malformed',
      detail: 'the source cannot read an entry of the package',
    },
    access: always(SOURCE_UNAVAILABLE),
  },
}

export function sourceFailureTo(
  op: 'inspect',
  failure: SourceFailure,
  basis: boolean,
): InspectFailure
export function sourceFailureTo(
  op: 'access',
  failure: SourceFailure,
  basis: boolean,
): AccessSourceFailure
export function sourceFailureTo(
  op: SourceOp,
  failure: SourceFailure,
  basis: boolean,
): InspectFailure | AccessSourceFailure {
  const row = TABLE[failure]
  return op === 'inspect' ? row.inspect : row.access(basis)
}
