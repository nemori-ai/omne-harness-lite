// The operation and the target of one admission (SPEC AU-11). Both are opaque to authorization:
// the resource owner names them and keeps their meaning. Authorization records them in the basis
// and compares them with a permit, nothing more.

/** One action of one owner, for example `{ owner: 'agent', name: 'invoke' }`. */
export type AdmissionOperation = Readonly<{ owner: string; name: string }>

/** The object the action is on, as its owner names it. `key` is unique inside `owner` and `kind`. */
export type AdmissionTarget = Readonly<{ owner: string; kind: string; key: string }>

export function operationEquals(left: AdmissionOperation, right: AdmissionOperation): boolean {
  return left.owner === right.owner && left.name === right.name
}

export function targetEquals(left: AdmissionTarget, right: AdmissionTarget): boolean {
  return left.owner === right.owner && left.kind === right.kind && left.key === right.key
}
