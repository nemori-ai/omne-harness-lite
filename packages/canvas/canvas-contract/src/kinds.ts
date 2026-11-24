import type { KindName, TenantId } from './values.ts'

/** What `admit` is given: who acts, the identity of the reference, and the holder the canvas will be. */
export type AdmitInput = Readonly<{
  tenant: TenantId
  subject: unknown
  ref: string
  /** Fixed by the tenant, the canvas and the reference: the same before and after a record exists. */
  holder: string
}>

/** `refused` is one answer for absent, of another tenant and not to be seen: it does not tell which. */
export type Admission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'basis-unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/**
 * A kind that may be put on the canvas, as its owner declares it on `canvas.kinds`. The item on the
 * registry is this declaration; the canvas keeps no copy.
 */
export type KindDeclaration = Readonly<{
  name: KindName
  /** What a person calls this kind. */
  label: string
  /** One sentence: what this kind is. */
  summary: string
  /** One sentence for an agent: how the identity of one of this kind is written. */
  reference: string
  /** Asked before a reference of this kind is put on; it answers once the owner holds it. */
  admit?: (input: AdmitInput) => Promise<Admission>
}>

/** One kind as `kinds` lists it. A name declared twice is listed as a conflict with the ones who declared it. */
export type KindListing =
  | Readonly<{
      kind: 'declared'
      name: KindName
      label: string
      summary: string
      reference: string
    }>
  | Readonly<{ kind: 'conflict'; name: KindName; by: readonly string[] }>

/** The kinds now declared, or that they cannot be read. Never an empty list instead. */
export type KindsRead =
  | Readonly<{ kind: 'read'; kinds: readonly KindListing[] }>
  | Readonly<{ kind: 'unavailable' }>

/** The kinds as the registry has them now. Read at every call: no copy is kept. */
export interface CanvasKinds {
  read(): KindsRead
}

/** The canvas's own kind: a small app a plugin brings, by its name on `canvas.app-render`. */
export const CANVAS_APP = 'canvas.app' as KindName

export const canvasAppKind: KindDeclaration = Object.freeze({
  name: CANVAS_APP,
  label: '画布小应用',
  summary: '一份 plugin 带来的、画在纸上的小应用。',
  reference: '小应用的名字，就是它在点 canvas.app-render 上的键。',
})
