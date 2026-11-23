import {
  capabilityId,
  evaluate,
  layerInputsOf,
  type Candidate,
  type HeldReading,
} from '@omne-harness/assets'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Adoption } from '@omne-harness/tool-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import { candidateOfRevision, revisionOf } from '../tenant-assets/layers.ts'

export const TOOL_CATEGORY = 'tool'
/** The owner of the asset version, the holding and the publication of a tool that a tenant holds. */
export const HELD_TOOL_OWNER = '@omne-harness/assets'
/** A tool made from a directory declares no settings. */
export const HELD_TOOL_SETTINGS: Adoption = Object.freeze({
  owner: HELD_TOOL_OWNER,
  name: 'no-settings',
  revision: '1',
  digest: 'sha256:none',
})

/** The authority of the tool a tenant holds under a name: its layer, and the exact version it holds. */
export function heldToolAuthority(tenant: TenantId, name: string, held: Candidate): ToolAuthority {
  const encoded = tenantCodec.encode(tenant)
  const tenantRef = encoded.ok ? encoded.value : ''
  const revision = revisionOf(held)
  const evidence = (record: string) =>
    Object.freeze({ owner: HELD_TOOL_OWNER, record, revision, digest: held.version })
  return Object.freeze({
    layer: Object.freeze({ kind: 'tenant' as const, tenant }),
    asset: Object.freeze({
      name,
      adoption: Object.freeze({ owner: HELD_TOOL_OWNER, name, revision, digest: held.version }),
    }),
    holding: evidence(`tool-holding/${tenantRef}/${name}`),
    publication: evidence(`tool-publication/${name}`),
  })
}

/** The held version an authority names, as a candidate to read its body by. */
export function heldCandidateOf(authority: ToolAuthority): Candidate {
  const { revision, digest } = authority.asset.adoption
  return candidateOfRevision(revision, digest)
}

export type HeldToolStanding =
  | Readonly<{ kind: 'held'; candidate: Candidate }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable' }>

/** The tool a tenant holds in force under a name now, read from what the registry holds: never a body, never a wait. */
export function heldToolStanding(
  read: (name: string, tenantRef: string) => HeldReading | undefined,
  tenant: TenantId,
  name: string,
): HeldToolStanding {
  const encoded = tenantCodec.encode(tenant)
  const capability = capabilityId(TOOL_CATEGORY, name)
  if (!encoded.ok || !capability.ok) return { kind: 'none' }
  const reading = read(name, encoded.value)
  if (reading === undefined) return { kind: 'unavailable' }
  const answer = evaluate({ layers: layerInputsOf(reading, encoded.value), eligible: () => 'yes' })
  if (answer.kind === 'unavailable') return { kind: 'unavailable' }
  return answer.kind === 'winner' && answer.layer === 'tenant'
    ? { kind: 'held', candidate: answer.candidate }
    : { kind: 'none' }
}

/** Whether an authority still names what the tenant holds in force: the same asset, the same version. */
export function sameHeld(authority: ToolAuthority, candidate: Candidate): boolean {
  const { revision, digest } = authority.asset.adoption
  return revision === revisionOf(candidate) && digest === candidate.version
}
