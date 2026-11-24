import type { Context } from '@deepseek-ai/cordis'
import type { Access } from '@omne-harness/legal-identity'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import { candidateOfRevision } from '../tenant-assets/layers.ts'
import { heldDefinitionFromBody } from './held-author.ts'
import { heldDefinitionOf, rememberHeldDefinition } from './held-definitions.ts'
import { HELD_TOOL_OWNER, heldToolAuthority } from './held-tools.ts'

/** What a session wrote down when it took a tool as a resident: its name, and the evidence of the version it took. */
export type RecordedResident = Readonly<{
  capability: string
  admitted: Readonly<{ owner: string; revision: string; digest: string }>
}>

export type RecordedHeldTool = Readonly<{ key: ToolBindingKey; knownDefinition?: ToolDefinition }>

/** The version of a tenant's tool a session keeps resident, in force or not: its key and, while its body can be read, its definition. */
export async function recordedHeldTool(
  ctx: Context,
  access: Access<unknown>,
  resident: RecordedResident,
): Promise<RecordedHeldTool | undefined> {
  const { capability, admitted } = resident
  if (admitted.owner !== HELD_TOOL_OWNER) return undefined
  const taken = candidateOfRevision(admitted.revision, admitted.digest)
  const authority = heldToolAuthority(access.tenant, capability, taken)
  const key = { layer: authority.layer, asset: authority.asset }
  const known = heldDefinitionOf(ctx, key) ?? (await heldDefinitionFromBody(ctx, authority))
  if (known === undefined) return { key }
  rememberHeldDefinition(ctx, key, known)
  return { key, knownDefinition: known }
}
