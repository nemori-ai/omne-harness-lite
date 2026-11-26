import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScheduleSessionDefaults } from '@omne-harness/schedule-contract'
import {
  workspaceSelection,
  type Modes,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import { definitionMappingsKey } from '../agent-adoptions/definition-mappings.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'

type ForNew = NonNullable<ScheduleSessionDefaults['forNew']>

/** The modes of a session as a schedule saves them: the environment by the name and revision of its adoption. */
export function savedModesOf(modes: Modes): ForNew['modes'] {
  const { name, revision } = modes.environment
  return {
    permission: modes.permission,
    environmentAdoptionRef: `${name}@${revision}`,
    collaboration: modes.collaboration,
  }
}

/** The workspace a session stands at as a schedule saves it; null when it stands at none. Undefined: its id has no text. */
export function savedWorkspaceOf(
  work: Pick<WorkSnapshot, 'creation' | 'changes'>,
): ForNew['workspace'] | undefined {
  const selected = workspaceSelection(work)
  if (selected === null) return null
  const text = workspaceCodec.encode(selected.workspace)
  const { attachment } = selected
  if (!text.ok) return undefined
  return { workspaceRef: text.value, instanceRef: attachment.instance, basisRef: attachment.basis }
}

/** What a new session takes from the session a tool call is in: its definition, its modes now and its workspace. Undefined: one of them cannot be read now. */
export async function sessionDefaultsOf(
  ctx: Context,
  tenant: TenantId,
  session: string | null,
): Promise<ForNew | undefined> {
  if (session === null) return undefined
  const id = session as SessionId
  const issued = await toolRuntimeHolder(ctx)
    .workPrincipals()
    ?.forSession({ actor: 'maintainer', tenant, session: id })
  const scope = ctx.intercept(sessionKey, { caller: 'maintainer' })
  const service = scope.get(sessionKey, false) as SessionService | undefined
  const installation = ctx.get(sessionModesInstallationKey)
  if (issued === undefined || !('ok' in issued)) return undefined
  if (service === undefined || installation === undefined) return undefined
  const access = { principal: issued.ok, tenant, session: id }
  const [work, modes] = await Promise.all([
    service.work.readWork(access),
    installation.readModes(access),
  ])
  if (!('ok' in work) || modes.kind !== 'read') return undefined
  const workspace = savedWorkspaceOf(work.ok)
  if (workspace === undefined) return undefined
  return {
    agentDefinitionRef: work.ok.definition.name,
    modes: savedModesOf(modes.modes),
    workspace,
  }
}

/** What a new session takes from a definition when a person leaves it out: that definition with its modes, and no workspace. Undefined: the tenant has no such definition, or it cannot be read. */
export async function definitionDefaultsOf(
  ctx: Context,
  tenantText: string,
  definition: string,
): Promise<ForNew | undefined> {
  const tenant = tenantCodec.parse(tenantText)
  const mappings = ctx.get(definitionMappingsKey)
  if (!tenant.ok || mappings === undefined) return undefined
  const found = await mappings.named({ tenant: tenant.value }, definition)
  if (found.kind !== 'found') return undefined
  return { agentDefinitionRef: definition, modes: savedModesOf(found.entry.modes), workspace: null }
}
