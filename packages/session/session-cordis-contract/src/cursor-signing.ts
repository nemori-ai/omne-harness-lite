// The narrow signing dependency of the Session read cursors (RD-CURSOR). The provider signs and
// verifies with its current key per call. There is no way to read the raw key, and a verify of a
// key that was rotated out is `invalid`, not `valid` and not an error.
export type SessionCursorSignature = Readonly<{
  /** The public selector of the current key. It is not a permission. */
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
