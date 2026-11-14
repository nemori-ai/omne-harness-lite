import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export type WriterClaim = {
  readonly key: string
  readonly generation: number
  client: { readonly hasExited: boolean } | null
}

const claims = new Map<string, WriterClaim>()

export function canonicalFile(file: string): string {
  const path = resolve(file)
  try {
    return realpathSync.native(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(canonicalFile(parent), basename(path))
  }
}

const fileKey = (file: string): string => {
  const real = canonicalFile(file)
  return process.platform === 'win32' ? real.toLowerCase() : real
}

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
