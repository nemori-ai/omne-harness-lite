import type { RequestInvalid } from './requests.ts'
import type { Item, ItemId, KindName, PileId } from './values.ts'

/** Why the arrangement now does not allow a change. One list, for every write. */
export type ConflictReason =
  | 'kind-undeclared'
  | 'full'
  | 'not-admitted'
  | 'locked'
  | 'taken'
  | 'in-pile'

/** Which entry of a batch an answer is about. */
export type Entry = Readonly<{ item: ItemId }> | Readonly<{ pile: PileId }>

export type Denied = Readonly<{ kind: 'denied' }>
export type Unknown = Readonly<{ kind: 'unknown' }>
/** `conflict`: the kind is declared twice, by these two. */
export type BasisUnavailable = Readonly<{
  kind: 'basis-unavailable'
  conflict?: Readonly<{ name: KindName; by: readonly string[] }>
}>
export type NotFound = Readonly<{ kind: 'not-found'; entry: Entry }>
export type Conflict = Readonly<{ kind: 'conflict'; reason: ConflictReason; entry?: Entry }>

/** What every write may answer before it looks at the state of anything. */
type Before = RequestInvalid | Denied | BasisUnavailable | Unknown

export type PlaceAnswer =
  | Before
  | Readonly<{ kind: 'conflict'; reason: 'kind-undeclared' | 'full' | 'not-admitted' }>
  | Readonly<{ kind: 'no-change'; item: Item }>
  | Readonly<{ kind: 'done'; value: Readonly<{ revision: number; item: Item }> }>

export type ChangeAnswer =
  | Before
  | NotFound
  | Conflict
  | Readonly<{ kind: 'no-change' }>
  | Readonly<{ kind: 'done'; value: Readonly<{ revision: number }> }>

export type AwayPage = Readonly<{
  items: readonly Item[]
  /** Pass as `before` for the next page; null on the last one. */
  next: number | null
}>
