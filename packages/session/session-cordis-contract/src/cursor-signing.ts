export type SessionCursorSignature = Readonly<{
  keyId: string
  signature: Uint8Array
}>
export type SessionCursorSignResult =
  | Readonly<{ kind: 'signed'; value: SessionCursorSignature }>
  | Readonly<{ kind: 'unavailable' }>
export type SessionCursorVerifyResult =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'unavailable' }>
export interface SessionCursorSigning {
  sign(payload: Uint8Array): Promise<SessionCursorSignResult>
  verify(
    input: Readonly<{ payload: Uint8Array; signature: SessionCursorSignature }>,
  ): Promise<SessionCursorVerifyResult>
}
