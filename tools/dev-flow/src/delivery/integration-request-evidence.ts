import { digest, object, string } from '../integration/parse.ts'
import { parseCollaborationComment } from './collaboration-read.ts'
import type { Evidence, RequestInput } from './collaboration-records.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type RequestEvidenceReader = (repo: string, evidence: Evidence) => string

export function githubRequestEvidence(read: GhRead): RequestEvidenceReader {
  return (repo, evidence) => {
    const url = new URL(evidence.url)
    if (url.origin !== 'https://github.com' || url.search !== '')
      throw new InputError('integration-request-evidence-locator-unsupported')
    const prefix = `/${repo}/`
    if (!url.pathname.startsWith(prefix))
      throw new InputError('integration-request-evidence-repository-mismatch')
    const path = url.pathname.slice(prefix.length)
    const comment = /^issues\/([1-9]\d*)$/.exec(path)
    const id = /^#issuecomment-([1-9]\d*)$/.exec(url.hash)
    if (comment !== null && id !== null) {
      const value = read(
        ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repo}/issues/comments/${id[1]}`],
        15_000,
      )
      const result = parseCollaborationComment(value, repo, Number(comment[1]))
      if (result.id !== Number(id[1]))
        throw new InputError('integration-request-evidence-id-mismatch')
      return result.body
    }
    const blob = /^blob\/([0-9a-f]{40}|[0-9a-f]{64})\/(.+)$/.exec(path)
    if (blob === null || url.hash !== '')
      throw new InputError('integration-request-evidence-locator-unsupported')
    let segments: string[]
    try {
      segments = (blob[2] ?? '').split('/').map(segment => decodeURIComponent(segment))
    } catch {
      throw new InputError('integration-request-evidence-path-invalid')
    }
    if (
      segments.some(
        segment =>
          segment === '' ||
          segment === '.' ||
          segment === '..' ||
          segment.includes('/') ||
          segment.includes('\\') ||
          [...segment].some(character => character.charCodeAt(0) < 32),
      )
    )
      throw new InputError('integration-request-evidence-path-invalid')
    const filePath = segments.join('/')
    const result = object(
      read(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          `repos/${repo}/contents/${segments.map(encodeURIComponent).join('/')}?ref=${blob[1]}`,
        ],
        15_000,
      ),
      'evidence blob',
    )
    if (result.type !== 'file' || result.encoding !== 'base64' || result.path !== filePath)
      throw new InputError('integration-request-evidence-content-unsupported')
    const bytes = Buffer.from(string(result.content, 'evidence.content'), 'base64')
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new InputError('integration-request-evidence-not-utf8')
    }
  }
}

export function verifyEvidence(
  repo: string,
  evidence: Evidence,
  read: RequestEvidenceReader,
): void {
  const bytes = read(repo, evidence)
  if (bytes.trim() === '' || digest(bytes) !== evidence.sha256)
    throw new InputError('integration-request-evidence-digest-mismatch')
}

export function verifyRequestEvidence(input: RequestInput, read: RequestEvidenceReader): void {
  for (const evidence of [input.report, ...input.verification, input.stopped.evidence]) {
    verifyEvidence(input.context.repo, evidence, read)
  }
  if (new Set(input.stopped.writers).size !== input.stopped.writers.length)
    throw new InputError('integration-request-stopped-writers-duplicate')
}
