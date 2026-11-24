import type { KindName, TenantId } from './values.ts'

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

/** The one declaration of a kind: the item its owner puts on `canvas.kinds`. The canvas keeps no copy. */
export type KindDeclaration = Readonly<{
  name: KindName
  label: string
  summary: string
  reference: string
  /** Asked before a reference of this kind is put on; it answers once the owner holds it. */
  admit?: (input: AdmitInput) => Promise<Admission>
}>

export type KindListing =
  | Readonly<{
      kind: 'declared'
      name: KindName
      label: string
      summary: string
      reference: string
    }>
  | Readonly<{ kind: 'conflict'; name: KindName; by: readonly string[] }>

export type KindsRead =
  | Readonly<{ kind: 'read'; kinds: readonly KindListing[] }>
  | Readonly<{ kind: 'unavailable' }>

/** One kind as `place` takes it. While it is held, a withdrawal of its declaration waits for `leave`. */
export type KindEntry =
  | Readonly<{
      kind: 'declared'
      admit?: KindDeclaration['admit']
      declared(): boolean
      leave(): void
    }>
  | Readonly<{ kind: 'undeclared' }>
  | Readonly<{ kind: 'conflict'; by: readonly string[] }>
  | Readonly<{ kind: 'unavailable' }>

export interface CanvasKinds {
  read(): KindsRead
  enter(name: string): KindEntry
}

/** The canvas's own kind: a small app a plugin brings, by its name on `canvas.app-render`. */
export const CANVAS_APP = 'canvas.app' as KindName

export const canvasAppKind: KindDeclaration = Object.freeze({
  name: CANVAS_APP,
  label: '画布小应用',
  summary: '一份 plugin 带来的、画在纸上的小应用。',
  reference: '小应用的名字，就是它在点 canvas.app-render 上的键。',
})
