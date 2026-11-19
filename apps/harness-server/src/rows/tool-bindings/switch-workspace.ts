import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, workspaceCodec, type WorkspaceId } from '@omne-harness/legal-identity'
import {
  deriveSessionOperation,
  type DeclarationChange,
  type DurableEvidence,
  type SessionFailure,
  type SessionId,
  type SessionManagement,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import {
  operationId,
  type InstanceId,
  type WorkspaceCatalog,
  type WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import {
  workspaceCatalogKey,
  workspaceInstancesKey,
} from '@omne-harness/workspace-cordis-contract/cordis'
import {
  attachWorkspaceSwitch,
  type BoundWorkspaceSwitch,
  type SwitchAnswer,
} from '@omne-harness/workspace-tools'
import { canonicalDigest } from '@omne-harness/tool'
import { targetOf } from '../session-access/workspace-targets.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork, type VerifiedSessionWork } from '../tool-runtime/session-work.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

type Instances = Pick<WorkspaceInstances<unknown>, 'locate' | 'associate' | 'verify'>
export type SwitchPorts = Readonly<{
  session(): Promise<VerifiedSessionWork | Readonly<{ kind: 'session'; session: string }>>
  instances(): Instances | undefined
  catalog(): Pick<WorkspaceCatalog<unknown>, 'describe'> | undefined
  management(): Pick<SessionManagement<unknown>, 'change'> | undefined
}>

/** Taking the workspace away is the agent's own declaration: nothing of Workspace stands behind it. */
const NO_WORKSPACE: DurableEvidence = Object.freeze({
  owner: '@omne-harness/workspace-tools',
  record: 'switch-workspace/none',
  revision: '1',
  digest: '0'.repeat(64),
})

type Declaration = Extract<DeclarationChange, { kind: 'workspace' }>
type Aim = Readonly<{ workspace: WorkspaceId; instance: InstanceId; associated: boolean }>
type Stop = Exclude<SwitchAnswer, { kind: 'switched' | 'half-done' }>

const refused = (reason: string): Stop => ({ kind: 'refused', reason })
const unavailable = (diagnostic: string): Stop => ({ kind: 'unavailable', diagnostic })
const isStop = (value: Aim | Stop): value is Stop => 'kind' in value

/** What the session's refusal of a change is to the agent; anything else may hold on another try. */
const REFUSALS: Partial<Record<SessionFailure['kind'], string>> = {
  denied: 'not-permitted',
  invalid: 'invalid',
  archived: 'archived',
  frozen: 'frozen',
}

export const SWITCH_ABSENT = 'a service the switch needs is absent'
export const SWITCH_SILENT = 'a service the switch needs did not answer'

/** The workspace the model was told this step, as the request pinned it. The request may be a copy, so the identity is read again from its text. */
function currentOf(request: FixedToolRequest): WorkspaceId | null {
  const pinned = request.directory?.workspace?.id as { text?: unknown } | undefined
  const parsed = workspaceCodec.parse(String(pinned?.text))
  return parsed.ok ? parsed.value : null
}

export function createBoundWorkspaceSwitch(
  parent: Parent,
  ports: SwitchPorts,
): BoundWorkspaceSwitch {
  const access = { principal: parent.principal, tenant: parent.tenant }
  const current = currentOf(parent.request)

  async function byWorkspace(text: string): Promise<Aim | Stop> {
    const workspace = workspaceCodec.parse(text)
    if (!workspace.ok) return refused('not-permitted')
    const view = await ports.catalog()?.describe(access, workspace.value)
    if (view === undefined) return unavailable(SWITCH_ABSENT)
    if (view.kind === 'not-permitted') return refused('not-permitted')
    if (view.kind === 'unavailable') return unavailable(view.diagnostic)
    const [only, ...more] = view.value.instances
    if (only === undefined) return refused('no-instance')
    if (more.length > 0) return refused('more-than-one-instance')
    return { workspace: workspace.value, instance: only.instance, associated: false }
  }

  /** The directory as one more instance of the current workspace. The operation is the call's, so a replay associates once. */
  async function associated(instances: Instances, address: string): Promise<Aim | Stop> {
    if (current === null) return refused('not-an-instance')
    const operation = operationId(`switch-${canonicalDigest({ call: parent.call })}`)!
    const made = await instances.associate(access, { operation, workspace: current, address })
    if (made.kind === 'done')
      return { workspace: current, instance: made.value.instance, associated: true }
    if (made.kind === 'not-permitted') return refused('not-permitted')
    return made.kind === 'not-performed'
      ? refused(made.reason)
      : unavailable(`the association answered ${made.kind}`)
  }

  async function byDirectory(directory: string): Promise<Aim | Stop> {
    const instances = ports.instances()
    if (instances === undefined) return unavailable(SWITCH_ABSENT)
    const located = await instances.locate(access, directory)
    if (located.kind === 'unavailable') return unavailable(located.diagnostic)
    if (located.kind === 'none') return associated(instances, directory)
    return { workspace: located.workspace, instance: located.instance, associated: false }
  }

  async function declared(
    aim: Aim | null,
  ): Promise<Readonly<{ declaration: Declaration; directory: string | null }> | Stop> {
    if (aim === null) {
      const declaration = { value: null, workspaceAttachment: null, basis: NO_WORKSPACE }
      return { declaration: { kind: 'workspace', ...declaration }, directory: null }
    }
    const { workspace, instance } = aim
    const verification = await ports.instances()?.verify(access, { workspace, instance })
    if (verification === undefined) return unavailable(SWITCH_ABSENT)
    const check = targetOf(verification)
    if (check.kind === 'unavailable') return unavailable('unavailable')
    if (check.kind === 'refused') return refused(check.reason)
    const { attachment: workspaceAttachment, basis, directory } = check
    const declaration = { value: workspace, workspaceAttachment, basis }
    return { declaration: { kind: 'workspace', ...declaration }, directory }
  }

  async function committed(session: SessionId, declaration: Declaration): Promise<Stop | null> {
    const tenant = tenantCodec.encode(parent.tenant)
    if (!tenant.ok) return refused('not-permitted')
    const { call } = parent
    const elements = { kind: 'workspace-tool-call', tenant: tenant.value, session, call } as const
    const operation = deriveSessionOperation(elements)
    const result = await ports.management()?.change({ ...access, session, operation, declaration })
    if (result === undefined) return unavailable(SWITCH_ABSENT)
    if ('ok' in result) return null
    const reason = REFUSALS[result.failure.kind]
    return reason === undefined ? unavailable(result.failure.kind) : refused(reason)
  }

  /** Verifies, then commits. Whatever stops it after an association is told as half-done. */
  async function switched(session: SessionId, aim: Aim | null): Promise<SwitchAnswer> {
    let stop: Stop | null
    let directory: string | null = null
    try {
      const selection = await declared(aim)
      if ('kind' in selection) stop = selection
      else {
        directory = selection.directory
        stop = await committed(session, selection.declaration)
      }
    } catch {
      stop = unavailable(SWITCH_SILENT)
    }
    if (stop === null) return { kind: 'switched', directory, associated: aim?.associated === true }
    if (aim?.associated !== true) return stop
    const reason = stop.kind === 'refused' ? stop.reason : stop.diagnostic
    return { kind: 'half-done', associated: aim.instance, reason }
  }

  return {
    async switch(target) {
      let aim: Aim | Stop | null = null
      try {
        const who = await ports.session()
        if (who.kind === 'denied') return refused('not-permitted')
        if (who.kind === 'unavailable') return unavailable(who.diagnostic)
        if (target.kind === 'workspace') aim = await byWorkspace(target.workspace)
        if (target.kind === 'directory') aim = await byDirectory(target.directory)
        if (aim !== null && isStop(aim)) return aim
        return await switched(who.session as SessionId, aim)
      } catch {
        return unavailable(SWITCH_SILENT)
      }
    },
  }
}

export function bindReleaseSwitchWorkspace(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  // The agent's selection enters the session as a person's does: through intake.
  const intake = ctx.intercept(sessionKey, { caller: 'intake' })
  const bound = createBoundWorkspaceSwitch(parent, {
    session: () =>
      verifySessionWork(toolRuntimeHolder(ctx).verifier(), parent.principal, parent.tenant),
    instances: () => ctx.get(workspaceInstancesKey),
    catalog: () => ctx.get(workspaceCatalogKey),
    management: () => intake.get(sessionKey, false)?.management,
  })
  return attachWorkspaceSwitch(scope, bound)
}
