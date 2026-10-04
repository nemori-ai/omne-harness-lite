import type { ReadBoundReplicaIn } from './types.ts'

export interface BoundCredentialReplicaReader {
  readonly readIn: ReadBoundReplicaIn
}

/** Trusted factory credential input; absence retains the existing unavailable behavior. */
export interface FactoryModelCredentialReader {
  readonly read: () => Promise<{ readonly body: Uint8Array } | { readonly absent: true } | { readonly failure: 'unavailable' }>
}
