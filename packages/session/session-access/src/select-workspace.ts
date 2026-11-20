import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { workspaceCodec, type TenantId, type WorkspaceId } from '@omne-harness/legal-identity'
import type { DurableEvidence } from '@omne-harness/session-contract'
import { commitCall, readCall, refused, UNAVAILABLE, type Answer, type Body } from './answers.ts'
import type { BackgroundCallPorts } from './background-calls.ts'
import { controlOperation } from './derivation.ts'
import type {
  WorkspaceSelectionReading,
  WorkspaceSelections,
  WorkspaceTargetCheck,
  WorkspaceTargets,
} from './ports.ts'

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

type Checked = Extract<CheckedWorkspace, { kind: 'attachable' }>

/** What the selection declares, and the directory it answers: the checked target, or none. */
const declared = (target: Checked | null) =>
  target === null
    ? { value: null, workspaceAttachment: null, basis: NO_WORKSPACE, directory: null }
    : {
        value: target.workspace,
        workspaceAttachment: target.attachment,
        basis: target.basis,
        directory: target.directory,
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
  const { directory, ...declaration } = declared(target)
  const result = await commitCall(() =>
    faces.management.change({
      ...access,
      operation: controlOperation(caller.login, tenantText, access.session, controlId),
      declaration: { kind: 'workspace', ...declaration },
    }),
  )
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('failure' in result) return refused('select-workspace', result.failure)
  return { outcome: 'succeeded', body: { controlId, directory } }
}

export type ReadWorkspaceSelectionPorts = Pick<SelectWorkspacePorts, 'admit'> &
  Readonly<{ selections: () => WorkspaceSelections | undefined }>

type Read = Extract<WorkspaceSelectionReading, { kind: 'read' }>
type Selected = Extract<Answer<'read-workspace-selection'>, { outcome: 'succeeded' }>['body']

/** The reading in the protocol's words. Undefined: a workspace its codec did not mint. */
function selectedBody({ selection, directory, revision }: Read): Selected | undefined {
  const place =
    directory.state === 'unusable'
      ? { state: directory.state, directory: null, reason: directory.reason }
      : { state: directory.state, directory: directory.directory, reason: null }
  if (selection === null) return { workspace: null, ...place, revision }
  const text = workspaceCodec.encode(selection.workspace)
  if (!text.ok) return undefined
  const workspace = { workspace: text.value, instance: selection.attachment.instance }
  return { workspace, ...place, revision }
}

/** The workspace a session stands at, with the directory and state a step beginning now works in. */
export async function readWorkspaceSelection(
  ports: ReadWorkspaceSelectionPorts,
  login: LoginIdentity,
  body: Body<'read-workspace-selection'>,
): Promise<Answer<'read-workspace-selection'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const selections = ports.selections()
  if (selections === undefined) return UNAVAILABLE
  const read = await readCall(() => selections.read(admitted.access))
  if (read === 'basis-unavailable' || read.kind === 'unavailable') return UNAVAILABLE
  if (read.kind === 'refused') return refused('read-workspace-selection', read.failure)
  const selected = selectedBody(read)
  return selected === undefined ? UNAVAILABLE : { outcome: 'succeeded', body: selected }
}
