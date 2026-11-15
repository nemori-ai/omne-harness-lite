import { createHash } from 'node:crypto'
import type { Adoption } from './identity.ts'

export type AdoptionRules = Readonly<{ owner: string; name: string; revision: string }> &
  Readonly<Record<string, unknown>>

export function describedAdoption(rules: AdoptionRules): Adoption {
  return Object.freeze({
    owner: rules.owner,
    name: rules.name,
    revision: rules.revision,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(rules)).digest('hex')}`,
  })
}
