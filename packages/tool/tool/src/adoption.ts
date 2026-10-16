// Builds an adoption whose digest a reader can recompute from a published rule set.
import { createHash } from 'node:crypto'
import type { Adoption } from './identity.ts'

/** A published rule set: its name, and every other member that changes the behavior it names. */
export type AdoptionRules = Readonly<{ owner: string; name: string; revision: string }> &
  Readonly<Record<string, unknown>>

/** `digest` is `sha256:` and the hexadecimal SHA-256 of the JSON text of `rules`. */
export function describedAdoption(rules: AdoptionRules): Adoption {
  return Object.freeze({
    owner: rules.owner,
    name: rules.name,
    revision: rules.revision,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(rules)).digest('hex')}`,
  })
}
