import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { workspaceCodec, type TenantId, type WorkspaceId } from '@omne-harness/legal-identity'
import type { DurableEvidence } from '@omne-harness/session-contract'
import { commitCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'
import type { WorkspaceTargetCheck, WorkspaceTargets } from './ports.ts'

export type SelectWorkspacePorts = BackgroundCallPorts &
  Readonly<{ workspaces: () => WorkspaceTargets | undefined }>

/** Taking the workspace away is the person's own declaration: nothing of Workspace stands behind it. */
const NO_WORKSPACE: DurableEvidence = Object.freeze({
  owner: 'session-access',
  record: 'select-workspace/none',
  revision: '1',
  digest: '0'.repeat(64),
})

type Asked = Readonly<{ workspace: string; instance: string }>
type Attachable = Extract<WorkspaceTargetCheck, { kind: 'attachable' }>
export type CheckedWorkspace =
  | Exclude<WorkspaceTargetCheck, Attachable>
  | (Attachable & Readonly<{ workspace: WorkspaceId }>)

/** The instance as Workspace judges it now. A text that is no workspace identity is not permitted. */
export async function checkedWorkspace(
  workspaces: () => WorkspaceTargets | undefined,
  caller: Readonly<{ principal: Principal; tenant: TenantId }>,
  asked: Asked,
): Promise<CheckedWorkspace> {
  const workspace = workspaceCodec.parse(asked.workspace)
  if (!workspace.ok) return { kind: 'refused', reason: 'not-permitted' }
  const targets = workspaces()
  if (targets === undefined) return { kind: 'unavailable' }
  try {
    const { principal, tenant } = caller
    const input = { principal, tenant, workspace: workspace.value, instance: asked.instance }
    const check = await targets.check(input)
    return check.kind === 'attachable' ? { ...check, workspace: workspace.value } : check
  } catch {
    return { kind: 'unavailable' }
  }
}

// The target is verified before anything is committed; the control identity derives the operation.
export async function selectWorkspace(
  ports: SelectWorkspacePorts,
  login: LoginIdentity,
  body: Body<'select-workspace'>,
): Promise<Answer<'select-workspace'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const { controlId, workspace: asked } = body
  const target = asked === null ? null : await checkedWorkspace(ports.workspaces, access, asked)
  if (target?.kind === 'unavailable') return UNAVAILABLE
  if (target?.kind === 'refused') return { outcome: 'invalid', body: { reason: target.reason } }
  const result = await commitCall(() =>
    faces.management.change({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      declaration: {
        kind: 'workspace',
        value: target?.workspace ?? null,
        workspaceAttachment: target?.attachment ?? null,
        basis: target?.basis ?? NO_WORKSPACE,
      },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('select-workspace', result.failure)
  return { outcome: 'succeeded', body: { controlId, directory: target?.directory ?? null } }
}
