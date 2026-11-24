import type {
  AwayPage,
  CanvasId,
  Conflict,
  Instant,
  Item,
  ItemChange,
  ItemId,
  Mover,
  NotFound,
  Pile,
  PileChange,
  PileId,
  Reference,
  Sheet,
  Size,
  Spot,
  TenantId,
} from '@omne-harness/canvas-contract'

/** A read either returns the facts or says it could not read. It never answers empty instead. */
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

/** What a commit answered. `unknown`: it is not known whether the facts were written. */
export type StoreAnswer<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>

/** What the store holds of one canvas: the items on the sheet, every pile, and the revision. */
export type Arrangement = Readonly<{
  revision: number
  items: readonly Item[]
  piles: readonly Pile[]
}>

/** What `place` reads before it asks the owner of the kind. */
export type Placing = Readonly<{ item: Item | null; placed: number }>

/** The configuration a script needs; a script runs where no configuration is. */
export type Rules = Readonly<{ sheet: Sheet; footprint: Size; placed: number; away: number }>

type Stamp = Readonly<{ canvas: CanvasId; by: Mover; when: Instant; rules: Rules }>

/** `declared`: the kind was still declared just before this commit was asked for. */
export type PlaceCommand = Stamp &
  Readonly<{
    reference: Reference
    at?: Spot | undefined
    near?: Spot | undefined
    size?: Size | undefined
    declared: boolean
  }>
export type ArrangeCommand = Stamp &
  Readonly<{ items: readonly ItemChange[]; piles: readonly PileChange[] }>
export type TakeCommand = Stamp & Readonly<{ items: readonly ItemId[] }>
export type PileCommand = Stamp &
  Readonly<{ pile: PileId; items: readonly ItemId[]; at?: Spot | undefined }>
export type ScatterCommand = Stamp & Readonly<{ pile: PileId }>
export type LockCommand = Stamp & Readonly<{ items: readonly ItemId[]; locked: boolean }>

export type PlaceResult =
  | Readonly<{ kind: 'changed'; revision: number; item: Item }>
  | Readonly<{ kind: 'no-change'; item: Item }>
  | Readonly<{ kind: 'conflict'; reason: 'full' | 'kind-undeclared' }>

export type ChangeResult =
  | Readonly<{ kind: 'changed'; revision: number }>
  | Readonly<{ kind: 'no-change' }>
  | NotFound
  | Conflict

/** The arrangements of the canvases, in the words of the domain. Each write is one commit of one tenant and runs one script. */
export interface CanvasStore {
  look(tenant: TenantId, canvas: CanvasId): Promise<StoreRead<Arrangement>>
  away(
    tenant: TenantId,
    canvas: CanvasId,
    page: Readonly<{ limit: number; before?: number | undefined }>,
  ): Promise<StoreRead<AwayPage>>
  placing(tenant: TenantId, canvas: CanvasId, reference: Reference): Promise<StoreRead<Placing>>
  place(tenant: TenantId, command: PlaceCommand): Promise<StoreAnswer<PlaceResult>>
  arrange(tenant: TenantId, command: ArrangeCommand): Promise<StoreAnswer<ChangeResult>>
  take(tenant: TenantId, command: TakeCommand): Promise<StoreAnswer<ChangeResult>>
  pile(tenant: TenantId, command: PileCommand): Promise<StoreAnswer<ChangeResult>>
  scatter(tenant: TenantId, command: ScatterCommand): Promise<StoreAnswer<ChangeResult>>
  lock(tenant: TenantId, command: LockCommand): Promise<StoreAnswer<ChangeResult>>
}
