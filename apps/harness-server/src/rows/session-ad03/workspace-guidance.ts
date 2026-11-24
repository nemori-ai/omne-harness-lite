import { createHash } from 'node:crypto'
import { isAbsolute, join, posix, relative, sep } from 'node:path'
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
  rootIdentity?: string,
): Promise<WorkspaceGuidance> {
  const root = value.directory
  const visit = input.snapshot.workspaceVisit
  const active =
    visit?.workspace === value.workspace &&
    visit.instance === value.instance &&
    visit.generation === (value.generation ?? '0')
      ? visit.directories
      : []
  const basis = { root, workspace: value.workspace, instance: value.instance }
  if (!rootIdentity || !/^\d+:[1-9]\d*$/u.test(rootIdentity))
    return {
      state: 'unavailable',
      ...basis,
      path: 'AGENTS.md',
      reason: 'unknown',
      diagnostic: 'the workspace did not verify a host root object',
    }
  const files = createHostFiles({ read: root }, rootIdentity)
  const lookup = createHostFileLookup(root, rootIdentity)
  const captured = new Map<string, Captured>()
  const sources = new Map<string, { path: string; digest: string; text: string }>()
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
          return { path, result: await readSource(input, root, files, lookup, absolute, captured) }
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
      else sources.set(result.path, { path: result.path, digest: result.digest, text: result.text })
    }
  }
  const ordered = [...sources.values()].sort((a, b) => {
    const left = posix.dirname(a.path),
      right = posix.dirname(b.path)
    if (left === right) return 0
    return left === '.' || (right !== '.' && left < right) ? -1 : 1
  })
  return { state: 'attached', ...basis, sources: ordered, absent }
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

type FoundFile = { object: { token: string }; size: number; directory: string }
type Captured = { file: FoundFile; result: ReturnType<typeof readBody> }

async function readSource(
  input: StepDirectoryInput<unknown>,
  root: string,
  files: ReturnType<typeof createHostFiles>,
  lookup: ReturnType<typeof createHostFileLookup>,
  path: string,
  captured: Map<string, Captured>,
) {
  const found = await lookup(path)
  if (!found.ok) return facilityFailure(found.failure)
  if (found.value === null) return { kind: 'absent' as const }
  const file = found.value
  const dir = relative(root, file.directory)
  if (dir === '..' || dir.startsWith('..' + sep) || isAbsolute(dir))
    return refusal('denied', 'the observed directory is outside the workspace')
  const source = posix.join(dir.split(sep).join('/'), 'AGENTS.md')
  const earlier = captured.get(source)
  if (earlier) {
    if (earlier.file.object.token !== file.object.token || earlier.file.size !== file.size)
      return refusal('unknown', 'the source changed between directory observations')
    return earlier.result
  }
  const result = readBody(input, files, path, source, file)
  captured.set(source, { file, result })
  return result
}

async function readBody(
  input: StepDirectoryInput<unknown>,
  files: ReturnType<typeof createHostFiles>,
  path: string,
  source: string,
  file: FoundFile,
) {
  const request = {
    path,
    named: file.object,
    access: access(input.principal, input.tenant),
    binding: { kind: 'host_machine' as const },
    origin: originRef(input.scope.ref),
    requestId: 'workspace-guidance',
  }
  const result = await files.read({ ...request, limitBytes: file.size + 1 })
  if (result.kind !== 'done')
    return facilityFailure(result.kind === 'rejected' ? result.reason : result.kind)
  if (!result.value.eof) return refusal('unreadable', 'incomplete file')
  const bytes = result.value.bytes
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex')
    return { kind: 'found' as const, path: source, digest, text }
  } catch (cause) {
    return refusal('unreadable', String(cause))
  }
}
