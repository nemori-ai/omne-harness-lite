import type { CategoryView } from '@omne-harness/assets'
import type { Outcome } from '@omne-harness/operation-result'
import {
  judgeRunStart,
  runIdOf,
  workspaceSelection,
  type AdoptionEvidenceCommand,
  type SessionAccess,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { layoutsOf } from '@omne-harness/workspace-asset-source'
import type { InstanceId, WorkspaceSources } from '@omne-harness/workspace-contract'

export type RunSourcesPorts = Readonly<{
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
  sources(): WorkspaceSources<unknown> | undefined
  categories(): CategoryView | undefined
  report(reason: string): void
}>

type StartRun = Extract<AdoptionEvidenceCommand, { kind: 'startRun' }>

/** The key of the run this command starts, by the session's own rule; null when it starts none. */
function runKeyOf(snapshot: WorkSnapshot, command: StartRun): string | null {
  const judged = judgeRunStart(snapshot, command.input.entry)
  if (judged.kind !== 'eligible') return null
  const predecessor = snapshot.run.kind === 'terminal' ? snapshot.run.terminal.run : null
  return runIdOf(snapshot.session, judged.first, predecessor)
}

/** Reads the workspace of the session once under the key of a run; null when it has none or was read. */
export async function adoptWorkspace(
  ports: RunSourcesPorts,
  access: SessionAccess<unknown>,
  work: WorkSnapshot,
  key: string,
): Promise<string | null> {
  const selection = workspaceSelection(work)
  if (selection === null) return null
  const sources = ports.sources()
  const categories = ports.categories()
  if (sources === undefined || categories === undefined) return 'the workspace sources are absent'
  const contracts = categories.list().flatMap(item => categories.lookup(item.category) ?? [])
  const adopted = await sources.adopt(access, {
    workspace: selection.workspace,
    instance: selection.attachment.instance as InstanceId,
    key,
    layouts: layoutsOf(contracts),
  })
  return adopted.kind === 'adopted' ? null : `the workspace sources answered ${adopted.kind}`
}

async function adopt(
  ports: RunSourcesPorts,
  command: StartRun,
  access: SessionAccess<unknown>,
): Promise<Readonly<{ key: string | null; failed: string | null }>> {
  const read = await ports.readWork(access)
  if (read === undefined) return { key: null, failed: 'the session cannot be read' }
  if ('failure' in read)
    return { key: null, failed: `the session read answered ${read.failure.kind}` }
  const key = runKeyOf(read.ok, command)
  if (key === null) return { key, failed: null }
  return { key, failed: await adoptWorkspace(ports, access, read.ok, key) }
}

/** Adopts once for the run a command starts, and answers the key of that run; null when it starts none. */
export async function adoptForStartedRun(
  ports: RunSourcesPorts,
  command: StartRun,
  access: SessionAccess<unknown> | undefined,
): Promise<string | null> {
  if (access === undefined) return null
  try {
    const { key, failed } = await adopt(ports, command, access)
    if (failed !== null) ports.report(failed)
    return key
  } catch (cause) {
    ports.report(`adopting the workspace sources threw: ${String(cause)}`)
    return null
  }
}

// Once for the run a command starts. A failure is reported and leaves the run without a workspace
// layer: it never stands in the way of the start.
export async function adoptRunSources(
  ports: RunSourcesPorts,
  command: StartRun,
  access: SessionAccess<unknown> | undefined,
): Promise<void> {
  await adoptForStartedRun(ports, command, access)
}
