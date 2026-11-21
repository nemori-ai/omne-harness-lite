import type { Json, LoadBasis, Reason, TypeName } from './values.ts'

export type Material = Json

/** `occupancy` names the physical position. Governance keeps it unique and never reads it. */
export type Recognised = Readonly<{ material: Material; occupancy: string }>

export type Inspection = Readonly<{ directory: string; basis: LoadBasis }>

/** `refused`: the type looked and the answer is no; `final`, no less specific type may take it either. `unavailable`: the type could not look. */
export type TypeAnswer<T> =
  | Readonly<{ ok: T }>
  | Readonly<{ refused: Reason; final?: true }>
  | Readonly<{ unavailable: string }>

export type Admission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'refused'; reason: Reason }>

/** Answers physical questions only. Every method reads; none writes or runs a program. */
export interface ManagementType {
  readonly name: TypeName
  readonly extends: TypeName | null

  recognise(address: string): Promise<TypeAnswer<Recognised>>

  admits(existing: readonly Material[], candidate: Recognised): Admission

  /** A look now: still there, still the same one, where its root is, what version it is at. */
  inspect(material: Material): Promise<TypeAnswer<Inspection>>
}

/** Types are contributions: releasing one withdraws only that one. */
export interface ManagementTypes {
  contribute(type: ManagementType): { release(): void }
}
