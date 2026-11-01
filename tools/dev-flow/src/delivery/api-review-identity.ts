// The owner identity reader of the semantic review path (candidate r4, sections 2, 5.3, 5.3.1 and
// 5.4). It joins two trusted files of one target commit, `delivery-lines.json` and the identity
// manifest, and checks the join against the platform. The platform only confirms; it never
// writes or completes an anchor. The caller supplies both parsed files and the `gh` read.
import type {
  Actor,
  AdoptionDiagnostic,
  CommentRef,
  IdentityAdoption,
  IdentityFailureCode,
  Json,
  OwnerIdentityFact,
  OwnerIdentityManifest,
  OwnerLineResolution,
  Repository,
} from './api-review-types.ts'
import { publishReviewers, readCommentByUrl } from './baseline.ts'
import { GH_READ_TIMEOUT_MS, GhReadError, REST_HEADERS, type GhRead } from './github-read.ts'
import type { DeliveryLines } from './lines.ts'

export type {
  Actor,
  AdoptionDiagnostic,
  CommentRef,
  IdentityAdoption,
  IdentityFailureCode,
  OwnerIdentityFact,
  OwnerIdentityManifest,
  OwnerLineResolution,
  Repository,
}
export type IdentityFinding = { code: IdentityFailureCode; member: string; detail: Json }

export type OwnerIdentityReading = {
  /** Null when the member passes. */
  finding: IdentityFinding | null
  line: OwnerLineResolution
  /** The exact manifest fact when one exists for the line; never filled from a lookup. */
  fact: OwnerIdentityFact | null
  /** True when the stored and the platform login differ only in letter case. */
  loginCaseOnly: boolean
  /** Null when an earlier step refused, so no adoption comment was read. */
  adoption: AdoptionDiagnostic | null
}

const TIMEOUT_MS = GH_READ_TIMEOUT_MS

/**
 * The owner line of `member`: the lines whose `contracts` contain the exact path. Prefixes,
 * `integration.track`, `pathOwner` and `tracks[].owner` never stand in for it.
 */
export function resolveOwnerLine(table: DeliveryLines, member: string): OwnerLineResolution {
  const hits = table.lines.filter(line => line.contracts.includes(member))
  const [only] = hits
  if (hits.length === 1 && only !== undefined)
    return { kind: 'unique', lineId: only.id, ownerLogin: only.owner }
  return { kind: 'unresolved', lineIds: hits.map(line => line.id).sort() }
}

type Lookup =
  | { kind: 'found'; value: unknown }
  | { kind: 'absent' }
  | { kind: 'unknown'; reason: string }
/** Only an API answer with the exact status `404` is absence. Everything else is unknown. */
function lookup(call: GhRead, path: string): Lookup {
  try {
    return {
      kind: 'found',
      value: call(['api', '--method', 'GET', ...REST_HEADERS, path], TIMEOUT_MS),
    }
  } catch (error) {
    if (error instanceof GhReadError) {
      const status = (error.body as { status?: unknown } | null)?.status
      return status === '404'
        ? { kind: 'absent' }
        : { kind: 'unknown', reason: `API error ${String(status)}` }
    }
    return { kind: 'unknown', reason: 'read failed' }
  }
}

type PlatformRead =
  | { kind: 'read'; account: Actor | null; reviewers: string }
  | { kind: 'unknown'; reason: string }
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** The current account of `login` (null when it does not exist) and the publish reviewers. */
function observe(repository: string, login: string, call: GhRead): PlatformRead {
  const user = lookup(call, `users/${encodeURIComponent(login)}`)
  if (user.kind === 'unknown') return { kind: 'unknown', reason: `users lookup: ${user.reason}` }
  let account: Actor | null = null
  if (user.kind === 'found') {
    const value = user.value
    if (!isObject(value) || typeof value.login !== 'string' || typeof value.node_id !== 'string')
      return { kind: 'unknown', reason: 'users lookup: unexplained response' }
    account = { login: value.login, nodeId: value.node_id }
  }
  const environment = lookup(call, `repos/${repository}/environments/publish`)
  if (environment.kind !== 'found' || !isObject(environment.value))
    return { kind: 'unknown', reason: 'publish environment unreadable' }
  return {
    kind: 'read',
    account,
    reviewers: JSON.stringify(environment.value.protection_rules ?? null),
  }
}

const unreadable = (reason: string): AdoptionDiagnostic => ({ kind: 'unreadable', reason })
/** Reads the adoption comment again and compares four fields. Never throws. */
function diagnoseAdoption(
  repository: string,
  adoption: IdentityAdoption,
  call: GhRead,
): AdoptionDiagnostic {
  const read = readCommentByUrl(repository, adoption.comment.url, call)
  if (read.kind === 'foreign') return unreadable('adoption URL is not a comment of this repository')
  if (read.kind === 'failed')
    return unreadable(read.status === '404' ? 'adoption comment not found' : read.reason)
  if (read.kind === 'unexplained') return unreadable('unexplained response')
  const value = read.comment
  const fields: ('url' | 'bodySha256' | 'updatedAt' | 'authorNodeId')[] = []
  if (value.author.nodeId !== adoption.authorNodeId) fields.push('authorNodeId')
  if (value.bodySha256 !== adoption.comment.bodySha256) fields.push('bodySha256')
  if (value.updatedAt !== adoption.comment.updatedAt) fields.push('updatedAt')
  if (value.htmlUrl !== adoption.comment.url) fields.push('url')
  return fields.length === 0 ? { kind: 'consistent' } : { kind: 'drifted', fields }
}

/**
 * The identity check of one review member, in the order of candidate r4 5.3: unique line,
 * manifest fact, the users lookup against the anchor, the optional comment author, the adoption
 * diagnostic, and a second read of the platform facts. `author` is the actual author of the
 * comment that claims the owner's authority.
 */
export function readOwnerIdentity({
  repository,
  member,
  lines,
  manifest,
  call,
  author,
}: {
  repository: Repository
  member: string
  lines: DeliveryLines
  manifest: OwnerIdentityManifest
  call: GhRead
  author?: Actor
}): OwnerIdentityReading {
  const line = resolveOwnerLine(lines, member)
  let fact: OwnerIdentityFact | null = null
  let loginCaseOnly = false
  let adoption: AdoptionDiagnostic | null = null
  const result = (code: IdentityFailureCode | null, detail: Json = null): OwnerIdentityReading => ({
    finding: code === null ? null : { code, member, detail },
    line,
    fact,
    loginCaseOnly,
    adoption,
  })

  if (line.kind === 'unresolved')
    return result('api-review-owner-unresolved', { lineIds: line.lineIds })
  fact = manifest.owners.find(entry => entry.lineId === line.lineId) ?? null
  if (fact === null) return result('api-review-owner-identity-missing', { lineId: line.lineId })
  if (
    manifest.repository.name !== repository.name ||
    manifest.repository.nodeId !== repository.nodeId
  )
    return result('api-review-owner-identity-mismatch', {
      reason: 'repository',
      lineId: line.lineId,
    })
  if (fact.owner.login !== line.ownerLogin)
    return result('api-review-owner-identity-mismatch', {
      reason: 'line-owner-login',
      lineId: line.lineId,
      lines: line.ownerLogin,
      manifest: fact.owner.login,
    })

  const anchor = fact.owner
  const first = observe(repository.name, anchor.login, call)
  if (first.kind === 'unknown') return result('api-review-input-unknown', { reason: first.reason })
  const platform = first.account
  if (platform === null)
    return result('api-review-owner-identity-mismatch', {
      reason: 'users-not-found',
      lineId: line.lineId,
    })
  if (platform.nodeId !== anchor.nodeId)
    return result('api-review-owner-identity-mismatch', {
      reason: 'node-id-differs',
      lineId: line.lineId,
      anchored: anchor.nodeId,
      platform: platform.nodeId,
    })
  if (platform.login !== anchor.login) {
    loginCaseOnly = platform.login.toLowerCase() === anchor.login.toLowerCase()
    return result('api-review-owner-identity-mismatch', {
      reason: 'login-differs',
      lineId: line.lineId,
      anchored: anchor.login,
      platform: platform.login,
      loginCaseOnly,
    })
  }

  if (author !== undefined) {
    if (author.login !== anchor.login || author.nodeId !== anchor.nodeId)
      return result('api-review-unauthorized', { reason: 'author-not-owner', lineId: line.lineId })
    let isReviewer: boolean
    try {
      isReviewer = publishReviewers(repository.name, call)(author)
    } catch {
      return result('api-review-input-unknown', { reason: 'publish reviewers unreadable' })
    }
    if (!isReviewer)
      return result('api-review-unauthorized', {
        reason: 'author-not-live-reviewer',
        lineId: line.lineId,
      })
  }

  adoption = diagnoseAdoption(repository.name, fact.adoption, call)

  // The adoption comment is outside the set that must stay equal. The account and the reviewers
  // are read again; the first read never stands in for the second.
  const second = observe(repository.name, anchor.login, call)
  if (second.kind === 'unknown')
    return result('api-review-input-unknown', { reason: second.reason })
  if (JSON.stringify(first) !== JSON.stringify(second))
    return result('api-review-source-changed', { lineId: line.lineId })
  return result(null)
}
