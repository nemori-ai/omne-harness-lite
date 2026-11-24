import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'
import { guidanceDirectories } from '@omne-harness/request-context-contract'
import { originRef } from '@omne-harness/execution-environment-contract'
import {
  createHostFiles,
  createHostFileLookup,
} from '@omne-harness/execution-environment-host-local'
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
  const lookup = createHostFileLookup(root)
  const sources = []
  const directories = guidanceDirectories(root, active)
  // Each lookup can start a native helper. Bound concurrent processes and retain root-to-leaf order.
  const width = 4
  for (let offset = 0; offset < directories.length; offset += width) {
    const results = await Promise.allSettled(
      directories.slice(offset, offset + width).map(async directory => {
        const path = join(directory, 'AGENTS.md')
        try {
          return await readSource(input, files, lookup, root, path)
        } catch (cause) {
          throw new Error(`workspace guidance ${relative(root, path)}: ${String(cause)}`, { cause })
        }
      }),
    )
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason
      if (result.value !== null) sources.push(result.value)
    }
  }
  return { state: 'attached', root, workspace: value.workspace, instance: value.instance, sources }
}

async function readSource(
  input: StepDirectoryInput<unknown>,
  files: ReturnType<typeof createHostFiles>,
  lookup: ReturnType<typeof createHostFileLookup>,
  root: string,
  path: string,
) {
  const found = await lookup(path)
  if (!found.ok) throw new Error('workspace guidance lookup: ' + found.failure)
  if (found.value === null) return null
  const request = {
    path,
    named: found.value.object,
    access: access(input.principal, input.tenant),
    binding: { kind: 'host_machine' as const },
    origin: originRef(input.scope.ref),
    requestId: 'workspace-guidance',
  }
  const result = await files.read({ ...request, limitBytes: found.value.size + 1 })
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
