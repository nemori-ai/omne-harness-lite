import type {
  CredentialPort,
  CredentialReference,
  CredentialResolution,
  SendFace,
} from '@omne-harness/model-contract'

export type CallRecord = {
  readonly reference: CredentialReference
}

export type SendLog = { readonly sent: false } | { readonly sent: true; readonly value: string }

export function deliver(
  record: CallRecord,
  port: Pick<CredentialPort, 'resolve'>,
  face: SendFace,
): { readonly record: CallRecord; readonly send: SendLog } {
  const decision: CredentialResolution = port.resolve(record.reference, face)
  if (decision.kind !== 'value') return { record, send: { sent: false } }
  return { record, send: { sent: true, value: decision.value } }
}
