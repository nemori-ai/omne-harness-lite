// In-process writer exclusion (SPEC 13.5). One table for the whole module, keyed by database file.
// A provider generation takes the claim before it starts a write Worker. The claim is held until
// the exit of that Worker was observed, so a later generation (a plugin rerun) never starts a
// second writer on the same file while the old one lives.
import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export type WriterClaim = {
  readonly key: string
  readonly generation: number
  client: { readonly hasExited: boolean } | null
}

const claims = new Map<string, WriterClaim>()

/**
 * The real path of a file: links and junctions resolved, the case of an existing file as stored.
 * For a file that does not exist yet, the nearest existing directory is resolved and the rest of
 * the path is joined to it.
 */
export function canonicalFile(file: string): string {
  const path = resolve(file)
  try {
    return realpathSync.native(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(canonicalFile(parent), basename(path))
  }
}

/** Two paths name the same file when their keys are equal. Windows paths ignore case. */
const fileKey = (file: string): string => {
  const real = canonicalFile(file)
  return process.platform === 'win32' ? real.toLowerCase() : real
}

/** Takes the claim, or returns null while another writer of this file has not exited. */
export function claimWriter(file: string, generation: number): WriterClaim | null {
  const key = fileKey(file)
  const held = claims.get(key)
  if (held !== undefined && !(held.client?.hasExited ?? false)) return null
  const claim: WriterClaim = { key, generation, client: null }
  claims.set(key, claim)
  return claim
}

export function releaseWriter(claim: WriterClaim): void {
  if (claims.get(claim.key) === claim) claims.delete(claim.key)
}
