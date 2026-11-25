import { isDeepStrictEqual } from 'node:util'
import { workspaceCodec, type TenantId, type WorkspaceId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  workspaceSelection,
  workspaceGeneration,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { FilesReach, WorkingDirectory } from '../working-directory-schema.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  workspaceGuidanceDescriptor,
  type WorkspaceGuidance,
  type WorkspaceGuidanceScope,
} from '../workspace-guidance.ts'
import { heldBlock } from './context-records.ts'
import { workingDirectoryDescriptor } from './working-directory-block.ts'

/** Whether the selected instance can be worked in now, and how far file requests reach from it. */
export type WorkingDirectoryTargets<P> = Readonly<{
  check(
    input: Readonly<{ principal: P; tenant: TenantId; workspace: WorkspaceId; instance: string }>,
  ): Promise<
    | Readonly<{ kind: 'attachable'; directory: string; files: FilesReach; rootIdentity?: string }>
    | Readonly<{ kind: 'refused'; reason: string }>
    | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  >
}>

export type StepDirectoryInput<P> = Readonly<{
  principal: P
  tenant: TenantId
  session: SessionId
  scope: ScopeRef
  snapshot: Pick<
    WorkSnapshot,
    'creation' | 'changes' | 'contextRecords' | 'workspaceVisit' | 'workspaceBackgroundVisits'
  >
}>

/** Refreshed: the block already holds the value, or the scope holds no such block. */
export type StepDirectoryResult =
  | Readonly<{ kind: 'refreshed' }>
  | Readonly<{ kind: 'commit'; value: WorkingDirectory }>
  | Readonly<{ kind: 'guidance'; value: WorkspaceGuidance }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The one place the working directory of a session changes: the action before a step. */
export type StepDirectory<P> = Readonly<{
  refresh(input: StepDirectoryInput<P>): Promise<StepDirectoryResult>
  inspectHistory?(
    input: Readonly<{ principal: P; tenant: TenantId }>,
    scopes: readonly WorkspaceGuidanceScope[],
  ): Promise<
    Outcome<
      readonly WorkspaceGuidanceScope[],
      { kind: 'denied' } | { kind: 'unavailable'; diagnostic: string }
    >
  >
  qualifyHistory?(
    input: Readonly<{ principal: P; tenant: TenantId }>,
    scopes: readonly WorkspaceGuidanceScope[],
  ): Promise<Outcome<void, { kind: 'denied' } | { kind: 'unavailable'; diagnostic: string }>>
}>

export type StepDirectoryPorts<P> = Readonly<{
  guidance?(
    input: StepDirectoryInput<P>,
    value: Extract<WorkingDirectory, { state: 'attached' }>,
    rootIdentity?: string,
  ): Promise<WorkspaceGuidance>
  defaultDirectory: string
  targets(): WorkingDirectoryTargets<P> | undefined
  recover(
    input: Readonly<{ tenant: TenantId; session: SessionId; scope: ScopeRef }>,
  ): Promise<Readonly<{ kind: 'ready' | 'absent' | 'unavailable' }>>
}>

type InForce = WorkingDirectory | Readonly<{ unavailable: string }>

const REFRESHED = Object.freeze({ kind: 'refreshed' })
// Without a workspace there is no root to keep file requests inside.
const UNLIMITED: FilesReach = Object.freeze({})
const down = (diagnostic: string): StepDirectoryResult => ({ kind: 'unavailable', diagnostic })

/** The directory of the step that begins on this snapshot: the selection, verified now. */
export async function directoryInForce<P>(
  ports: Pick<StepDirectoryPorts<P>, 'defaultDirectory' | 'targets'>,
  input: Pick<StepDirectoryInput<P>, 'principal' | 'tenant' | 'snapshot'>,
): Promise<InForce> {
  return (await verifiedDirectory(ports, input)).value
}

async function verifiedDirectory<P>(
  ports: Pick<StepDirectoryPorts<P>, 'defaultDirectory' | 'targets'>,
  input: Pick<StepDirectoryInput<P>, 'principal' | 'tenant' | 'snapshot'>,
): Promise<{ value: InForce; rootIdentity?: string | undefined }> {
  const selection = workspaceSelection(input.snapshot)
  if (selection === null)
    return { value: { state: 'default', directory: ports.defaultDirectory, files: UNLIMITED } }
  const workspace = workspaceCodec.encode(selection.workspace)
  if (!workspace.ok)
    return { value: { unavailable: 'the selected workspace is not minted by its codec' } }
  const { instance } = selection.attachment
  const targets = ports.targets()
  if (targets === undefined)
    return { value: { unavailable: 'the workspace owner is not installed' } }
  const checked = await targets.check({
    principal: input.principal,
    tenant: input.tenant,
    workspace: selection.workspace,
    instance,
  })
  switch (checked.kind) {
    case 'attachable': {
      const generation = workspaceGeneration(input.snapshot)
      return {
        rootIdentity: checked.rootIdentity,
        value: {
          state: 'attached',
          workspace: workspace.value,
          ...(generation === '0' ? {} : { generation }),
          instance,
          directory: checked.directory,
          files: checked.files,
        },
      }
    }
    case 'refused':
      return {
        value: { state: 'unusable', workspace: workspace.value, instance, reason: checked.reason },
      }
    case 'unavailable':
      return { value: { unavailable: checked.diagnostic } }
  }
}

export function createStepDirectory<P>(
  ports: StepDirectoryPorts<P>,
): StepDirectory<P> & Required<Pick<StepDirectory<P>, 'qualifyHistory' | 'inspectHistory'>> {
  const inspectHistory: NonNullable<StepDirectory<P>['inspectHistory']> = async (input, scopes) => {
    if (scopes.length === 0) return succeed([])
    const targets = ports.targets()
    if (targets === undefined)
      return fail({
        kind: 'unavailable',
        diagnostic: 'the workspace owner is unavailable for history qualification',
      })
    const denied: WorkspaceGuidanceScope[] = []
    const checkedInstances = new Set<string>()
    for (const scope of scopes) {
      const key = JSON.stringify([scope.workspace, scope.instance])
      if (checkedInstances.has(key)) continue
      checkedInstances.add(key)
      const workspace = workspaceCodec.parse(scope.workspace)
      if (!workspace.ok) {
        denied.push(scope)
        continue
      }
      try {
        const checked = await targets.check({
          ...input,
          workspace: workspace.value,
          instance: scope.instance,
        })
        if (checked.kind === 'unavailable')
          return fail({
            kind: 'unavailable',
            diagnostic: 'workspace guidance history qualification is unknown',
          })
        if (checked.kind === 'refused' && checked.reason !== 'instance-unavailable')
          denied.push(scope)
      } catch {
        return fail({
          kind: 'unavailable',
          diagnostic: 'workspace guidance history qualification threw',
        })
      }
    }
    return succeed(denied)
  }
  return {
    inspectHistory,
    async qualifyHistory(input, scopes) {
      const inspected = await inspectHistory(input, scopes)
      return 'failure' in inspected
        ? inspected
        : inspected.ok.length > 0
          ? fail({ kind: 'denied' })
          : succeed(undefined)
    },
    async refresh(input) {
      try {
        const recovered = await ports.recover(input)
        if (recovered.kind !== 'ready')
          return down(`the context scope of the session is ${recovered.kind}`)
        const held = heldBlock(
          input.snapshot.contextRecords ?? [],
          input.scope,
          workingDirectoryDescriptor.key,
        )
        if (held.kind === 'not-held') return REFRESHED
        const { value, rootIdentity } = await verifiedDirectory(ports, input)
        if ('unavailable' in value) return down(value.unavailable)
        if (held.committed === null || !isDeepStrictEqual(held.committed.value, value))
          return { kind: 'commit', value }
        if (ports.guidance === undefined) return REFRESHED
        const guidance = heldBlock(
          input.snapshot.contextRecords ?? [],
          input.scope,
          workspaceGuidanceDescriptor.key,
        )
        if (guidance.kind === 'not-held') return REFRESHED
        const next: WorkspaceGuidance =
          value.state === 'attached'
            ? await ports.guidance(input, value, rootIdentity)
            : { state: 'inactive' }
        return isDeepStrictEqual(guidance.committed?.value, next)
          ? REFRESHED
          : { kind: 'guidance', value: next }
      } catch (cause) {
        return down(`the working directory refresh threw: ${String(cause)}`)
      }
    },
  }
}
