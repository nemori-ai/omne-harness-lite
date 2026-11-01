// In-process writer exclusion (SPEC 13.5). One table for the whole module, keyed by database file.
// A provider generation takes the claim before it starts a write Worker. The claim is held until
// the exit of that Worker was observed, so a later generation (a plugin rerun) never starts a
// second writer on the same file while the old one lives.

export type WriterClaim = {
  readonly generation: number
  client: { readonly hasExited: boolean } | null
}

const claims = new Map<string, WriterClaim>()

/** Takes the claim, or returns null while another writer of this file has not exited. */
export function claimWriter(file: string, generation: number): WriterClaim | null {
  const held = claims.get(file)
  if (held !== undefined && !(held.client?.hasExited ?? false)) return null
  const claim: WriterClaim = { generation, client: null }
  claims.set(file, claim)
  return claim
}

export function releaseWriter(file: string, claim: WriterClaim): void {
  if (claims.get(file) === claim) claims.delete(file)
}
