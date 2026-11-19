import type { Json, LoadBasis, Reason, TypeName } from './values.ts'

/**
 * What a management type says about one materialisation. The governance layer stores it and
 * hands it back; it never reads inside.
 */
export type Material = Json

/** `occupancy` names the physical position. The governance layer keeps it unique; it does not interpret it. */
export type Recognised = Readonly<{ material: Material; occupancy: string }>

export type Inspection = Readonly<{ directory: string; basis: LoadBasis }>

/** `refused`: the type looked and the answer is no. `unavailable`: the type could not look. */
export type TypeAnswer<T> =
  | Readonly<{ ok: T }>
  | Readonly<{ refused: Reason }>
  | Readonly<{ unavailable: string }>

export type Admission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'refused'; reason: Reason }>

/**
 * How one kind of physical resource is recognised, located and versioned. A type answers
 * physical questions only. Every method reads: none writes, and none runs a program the
 * resource names.
 */
export interface ManagementType {
  readonly name: TypeName
  /** The type this one extends. The more specific type is asked first. */
  readonly extends: TypeName | null

  /** Whether this address is a resource of this type, and if so what and where it is. */
  recognise(address: string): Promise<TypeAnswer<Recognised>>

  /** Whether a workspace that has these instances may take this one too. Pure. */
  admits(existing: readonly Material[], candidate: Recognised): Admission

  /** A look now: is it still there, is it the same one, where is its root, what version is it at. */
  inspect(material: Material): Promise<TypeAnswer<Inspection>>
}

/** Types are contributions: adding one does not change the entry, releasing withdraws only that one. */
export interface ManagementTypes {
  contribute(type: ManagementType): { release(): void }
}
