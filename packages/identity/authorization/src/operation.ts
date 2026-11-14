export type AdmissionOperation = Readonly<{ owner: string; name: string }>

export type AdmissionTarget = Readonly<{ owner: string; kind: string; key: string }>

export function operationEquals(left: AdmissionOperation, right: AdmissionOperation): boolean {
  return left.owner === right.owner && left.name === right.name
}

export function targetEquals(left: AdmissionTarget, right: AdmissionTarget): boolean {
  return left.owner === right.owner && left.kind === right.kind && left.key === right.key
}
