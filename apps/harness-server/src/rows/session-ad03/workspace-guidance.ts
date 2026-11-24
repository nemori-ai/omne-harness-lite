import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { guidanceDirectories } from '@omne-harness/request-context-contract'
import { originRef } from '@omne-harness/execution-environment-contract'
import { createHostFiles, hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { access } from '@omne-harness/legal-identity'
import type { WorkingDirectory, WorkspaceGuidance } from '@omne-harness/session-adapters'
import type { StepDirectoryInput } from '@omne-harness/session-adapters/cordis'

export async function readWorkspaceGuidance(
  input: StepDirectoryInput<unknown>,
  value: Extract<WorkingDirectory, { state: 'attached' }>,
): Promise<WorkspaceGuidance> {
  const root = value.directory
  const visit = input.snapshot.workspaceVisit
  const active =
    visit?.workspace === value.workspace &&
    visit.instance === value.instance &&
    visit.generation === (value.generation ?? '0')
      ? visit.directories
      : []
  const files = createHostFiles({ read: root, write: root })
  const sources = []
  for (const directory of guidanceDirectories(root, active)) {
    const path = join(directory, 'AGENTS.md')
    const source = await readSource(input, files, root, path).catch((cause: unknown) => {
      throw new Error(`workspace guidance ${relative(root, path)}: ${String(cause)}`, { cause })
    })
    if (source !== null) sources.push(source)
  }
  return { state: 'attached', root, workspace: value.workspace, instance: value.instance, sources }
}

async function readSource(
  input: StepDirectoryInput<unknown>,
  files: ReturnType<typeof createHostFiles>,
  root: string,
  path: string,
) {
  const stat = await lstat(path).catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null
    throw cause
  })
  if (stat === null) return null
  if (!stat.isFile())
    throw new Error('workspace guidance must be a regular file inside the workspace')
  const request = {
    path,
    named: await hostObjectToken(path),
    access: access(input.principal, input.tenant),
    binding: { kind: 'host_machine' as const },
    origin: originRef(input.scope.ref),
    requestId: 'workspace-guidance',
  }
  const result = await files.read({ ...request, limitBytes: stat.size + 1 })
  if (result.kind !== 'done')
    throw new Error(
      'workspace guidance read: ' + (result.kind === 'rejected' ? result.reason : result.kind),
    )
  if (!result.value.eof) throw new Error('incomplete workspace guidance')
  const bytes = result.value.bytes
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
  return { path: relative(root, path).split(sep).join('/'), digest, text }
}
