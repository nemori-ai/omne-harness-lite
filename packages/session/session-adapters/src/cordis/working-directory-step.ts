import { isDeepStrictEqual } from 'node:util'
import { workspaceCodec, type TenantId, type WorkspaceId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  workspaceSelection,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { FilesReach, WorkingDirectory } from '../working-directory-schema.ts'
import { heldBlock } from './context-records.ts'
import { workingDirectoryDescriptor } from './working-directory-block.ts'

/** Whether the selected instance can be worked in now, and how far file requests reach from it. */
export type WorkingDirectoryTargets<P> = Readonly<{
  check(
    input: Readonly<{ principal: P; tenant: TenantId; workspace: WorkspaceId; instance: string }>,
  ): Promise<
    | Readonly<{ kind: 'attachable'; directory: string; files: FilesReach }>
    | Readonly<{ kind: 'refused'; reason: string }>
    | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  >
}>

export type StepDirectoryInput<P> = Readonly<{
  principal: P
  tenant: TenantId
  session: SessionId
  scope: ScopeRef
  snapshot: Pick<WorkSnapshot, 'creation' | 'changes' | 'contextRecords'>
}>

/** Refreshed: the block already holds the value, or the scope holds no such block. */
export type StepDirectoryResult =
  | Readonly<{ kind: 'refreshed' }>
  | Readonly<{ kind: 'commit'; value: WorkingDirectory }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The one place the working directory of a session changes: the action before a step. */
export type StepDirectory<P> = Readonly<{
  refresh(input: StepDirectoryInput<P>): Promise<StepDirectoryResult>
}>

export type StepDirectoryPorts<P> = Readonly<{
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
  const selection = workspaceSelection(input.snapshot)
  if (selection === null)
    return { state: 'default', directory: ports.defaultDirectory, files: UNLIMITED }
  const workspace = workspaceCodec.encode(selection.workspace)
  if (!workspace.ok) return { unavailable: 'the selected workspace is not minted by its codec' }
  const { instance } = selection.attachment
  const targets = ports.targets()
  if (targets === undefined) return { unavailable: 'the workspace owner is not installed' }
  const checked = await targets.check({
    principal: input.principal,
    tenant: input.tenant,
    workspace: selection.workspace,
    instance,
  })
  switch (checked.kind) {
    case 'attachable':
      return {
        state: 'attached',
        workspace: workspace.value,
        instance,
        directory: checked.directory,
        files: checked.files,
      }
    case 'refused':
      return { state: 'unusable', workspace: workspace.value, instance, reason: checked.reason }
    case 'unavailable':
      return { unavailable: checked.diagnostic }
  }
}

export function createStepDirectory<P>(ports: StepDirectoryPorts<P>): StepDirectory<P> {
  return {
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
        const value = await directoryInForce(ports, input)
        if ('unavailable' in value) return down(value.unavailable)
        return held.committed !== null && isDeepStrictEqual(held.committed.value, value)
          ? REFRESHED
          : { kind: 'commit', value }
      } catch (cause) {
        return down(`the working directory refresh threw: ${String(cause)}`)
      }
    },
  }
}
