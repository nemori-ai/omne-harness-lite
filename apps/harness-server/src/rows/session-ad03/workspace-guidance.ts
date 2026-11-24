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
  const basis = { root, workspace: value.workspace, instance: value.instance }
  const sources = []
  const absent = []
  const directories = guidanceDirectories(root, active)
  // Each lookup can start a native helper. Bound concurrent processes and preserve ancestor-first output.
  const width = 4
  for (let offset = 0; offset < directories.length; offset += width) {
    const results = await Promise.all(
      directories.slice(offset, offset + width).map(async directory => {
        const absolute = join(directory, 'AGENTS.md')
        const path = relative(root, absolute).split(sep).join('/')
        try {
          return { path, result: await readSource(input, files, lookup, absolute) }
        } catch (cause) {
          return { path, result: refusal('unknown', String(cause)) }
        }
      }),
    )
    for (const { path, result } of results) {
      if (result.kind === 'failed')
        return {
          state: 'unavailable',
          ...basis,
          path,
          reason: result.reason,
          diagnostic: result.diagnostic,
        }
      if (result.kind === 'absent') absent.push(path)
      else sources.push({ path, digest: result.digest, text: result.text })
    }
  }
  return { state: 'attached', ...basis, sources, absent }
}

type FailureReason = Extract<WorkspaceGuidance, { state: 'unavailable' }>['reason']
function refusal(reason: FailureReason, diagnostic: string) {
  return { kind: 'failed' as const, reason, diagnostic }
}
function facilityFailure(reason: string) {
  return refusal(
    reason === 'notAuthorized' ? 'denied' : reason === 'unsupported' ? 'unreadable' : 'unknown',
    reason,
  )
}

async function readSource(
  input: StepDirectoryInput<unknown>,
  files: ReturnType<typeof createHostFiles>,
  lookup: ReturnType<typeof createHostFileLookup>,
  path: string,
) {
  const found = await lookup(path)
  if (!found.ok) return facilityFailure(found.failure)
  if (found.value === null) return { kind: 'absent' as const }
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
    return facilityFailure(result.kind === 'rejected' ? result.reason : result.kind)
  if (!result.value.eof) return refusal('unreadable', 'incomplete file')
  const bytes = result.value.bytes
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
    return { kind: 'found' as const, digest, text }
  } catch (cause) {
    return refusal('unreadable', String(cause))
  }
}
