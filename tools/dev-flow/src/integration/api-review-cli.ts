#!/usr/bin/env node
// Commands of the API semantic review (candidate-r4.md 8): `draft-card`, `draft-ri`,
// `draft-milestone`, `check-milestone` and `verify-owner-adoption`. A draft only prepares data for
// a human to review; it posts nothing and passes nothing. There is no `--record`,
// `--trust-local` or owner argument.
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AdoptionReadBack,
  AdoptionVerifyCode,
  AdoptionVerifyEntry,
  AdoptionVerifyFinding,
  AdoptionVerifyReport,
  OwnerIdentityFact,
  RunExit,
} from '../delivery/api-review-types.ts'
import { OWNER_IDENTITY_PATH, parseOwnerIdentityManifest } from '../delivery/api-review-owners.ts'
import { GhReadError, REST_HEADERS, runGhRead, type GhRead } from '../delivery/github-read.ts'
import { record as asRecord, text as asText } from '../delivery/protocol.ts'
import { checkMilestone, draftMilestone, type TrustedTarget } from './contract-baseline-review.ts'
import { exactTextBlob, git } from './git.ts'
import { IntegrationError } from './parse.ts'
import { taskStatus } from './sync.ts'

/** One failure code, one exit code (candidate-r4.md 8.6). */
export const ADOPTION_VERIFY_EXIT = {
  'adoption-verify-foreign-url': 1,
  'adoption-verify-comment-missing': 1,
  'adoption-verify-mismatch': 1,
  'adoption-verify-manifest-invalid': 1,
  'adoption-verify-input-unknown': 2,
} as const satisfies Record<AdoptionVerifyCode, 1 | 2>

const COMMIT = /^[0-9a-f]{40}$/
const TIMEOUT_MS = 15_000
const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex')

export type VerifyAdoptionResult = {
  report: AdoptionVerifyReport
  exit: RunExit
  /** The last line of standard error. */
  summary: string
}

function exitOf(findings: readonly AdoptionVerifyFinding[]): RunExit {
  let exit: RunExit = 0
  for (const item of findings) {
    if (ADOPTION_VERIFY_EXIT[item.code] === 2) return 2
    exit = 1
  }
  return exit
}
const unknown = (lineId: string | null, detail: string): AdoptionVerifyFinding => ({
  code: 'adoption-verify-input-unknown',
  lineId,
  detail,
})
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The Git object id of `path` in `commit` (a commit or a tree), or null when it is absent. */
function objectId(root: string, commit: string, path: string): string | null {
  const line = git(root, ['ls-tree', commit, '--', path])
  if (line === '') return null
  const match = /^\d+ blob ([0-9a-f]{40})\t/.exec(line)
  if (match?.[1] === undefined)
    throw new IntegrationError('unknown', `unexpected ls-tree output for ${path}`)
  return match[1]
}

function readAdoption(
  repository: string,
  fact: OwnerIdentityFact,
  call: GhRead,
): { readBack: AdoptionReadBack | null; findings: AdoptionVerifyFinding[] } {
  const { url, bodySha256, updatedAt } = fact.adoption.comment
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const id = new RegExp(
    `^https://github\\.com/${escaped}/issues/[1-9][0-9]*#issuecomment-([1-9][0-9]*)$`,
  ).exec(url)?.[1]
  const lineId = fact.lineId
  if (id === undefined)
    return {
      readBack: null,
      findings: [{ code: 'adoption-verify-foreign-url', lineId, detail: { url } }],
    }
  let value: unknown
  try {
    value = call(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repository}/issues/comments/${id}`],
      TIMEOUT_MS,
    )
  } catch (error) {
    const status =
      error instanceof GhReadError ? (error.body as { status?: unknown } | null)?.status : undefined
    return {
      readBack: null,
      findings: [
        status === '404'
          ? { code: 'adoption-verify-comment-missing', lineId, detail: { url } }
          : unknown(
              lineId,
              `comment read failed${status === undefined ? '' : ` (${String(status)})`}`,
            ),
      ],
    }
  }
  try {
    const comment = asRecord(value, 'comment')
    const user = asRecord(comment.user, 'comment.user')
    const body = comment.body === null ? '' : asText(comment.body, 'comment.body')
    const readBack = {
      htmlUrl: asText(comment.html_url, 'comment.html_url'),
      bodySha256: sha256(body),
      updatedAt: asText(comment.updated_at, 'comment.updated_at'),
      author: {
        login: asText(user.login, 'user.login'),
        nodeId: asText(user.node_id, 'user.node_id'),
      },
      body,
    }
    if (readBack.htmlUrl !== url)
      return {
        readBack,
        findings: [
          {
            code: 'adoption-verify-foreign-url',
            lineId,
            detail: { url, htmlUrl: readBack.htmlUrl },
          },
        ],
      }
    const fields: ('authorNodeId' | 'bodySha256' | 'updatedAt')[] = []
    if (readBack.author.nodeId !== fact.adoption.authorNodeId) fields.push('authorNodeId')
    if (readBack.bodySha256 !== bodySha256) fields.push('bodySha256')
    if (readBack.updatedAt !== updatedAt) fields.push('updatedAt')
    const [first, ...rest] = fields
    return {
      readBack,
      findings:
        first === undefined
          ? []
          : [{ code: 'adoption-verify-mismatch', lineId, fields: [first, ...rest] }],
    }
  } catch (error) {
    return {
      readBack: null,
      findings: [unknown(lineId, `unexplained comment response: ${describe(error)}`)],
    }
  }
}

/**
 * The read-only check of candidate-r4.md 8.6: the merge result of `base` and `head` against
 * `base`, entry by entry. It reads Git objects of `root` and issues GET requests only. It is not
 * part of the semantic review path: no enablement check, no Comparison, no conclusion.
 */
export function verifyOwnerAdoption(input: {
  root: string
  base: string
  head: string
  repository: string
  call: GhRead
}): VerifyAdoptionResult {
  const { root, base, head, repository, call } = input
  const finish = (report: AdoptionVerifyReport): VerifyAdoptionResult => {
    const exit =
      report.kind === 'unchanged'
        ? 0
        : report.kind === 'input-unknown'
          ? exitOf(report.findings)
          : report.exitCode
    const entries = report.kind === 'changed' ? report.entries : []
    const count = (change: string) => entries.filter(item => item.change === change).length
    const findings = report.kind === 'unchanged' ? 0 : report.findings.length
    return {
      report,
      exit,
      summary: `verify-owner-adoption: ${exit} added=${count('added')} changed=${count('changed')} removed=${count('removed')} findings=${findings}`,
    }
  }
  const refused = (detail: string): VerifyAdoptionResult =>
    finish({ kind: 'input-unknown', findings: [unknown(null, detail)] })

  if (!COMMIT.test(base) || !COMMIT.test(head))
    return refused('--base and --head must be 40-digit lowercase commits')
  let mergeTree: string
  try {
    for (const commit of [base, head]) git(root, ['cat-file', '-e', `${commit}^{commit}`])
    mergeTree = git(root, ['merge-tree', '--write-tree', base, head]).split('\n')[0] ?? ''
    if (!COMMIT.test(mergeTree)) return refused('git merge-tree gave no tree')
  } catch (error) {
    return refused(`commit or merge-tree unavailable: ${describe(error)}`)
  }

  let baseId: string | null, mergedId: string | null
  try {
    baseId = objectId(root, base, OWNER_IDENTITY_PATH)
    mergedId = objectId(root, mergeTree, OWNER_IDENTITY_PATH)
  } catch (error) {
    return refused(`identity file unreadable: ${describe(error)}`)
  }
  if (baseId === mergedId) return finish({ kind: 'unchanged', base, head, mergeTree })

  const read = (commit: string, path: string) => exactTextBlob(root, commit, path).text
  let merged: OwnerIdentityFact[] = []
  if (mergedId !== null) {
    try {
      merged = parseOwnerIdentityManifest(read(mergeTree, OWNER_IDENTITY_PATH)).owners
    } catch (error) {
      return finish({
        kind: 'changed',
        base,
        head,
        mergeTree,
        entries: [],
        findings: [
          { code: 'adoption-verify-manifest-invalid', lineId: null, detail: describe(error) },
        ],
        exitCode: 1,
      })
    }
  }
  let before: OwnerIdentityFact[] = []
  if (baseId !== null) {
    try {
      before = parseOwnerIdentityManifest(read(base, OWNER_IDENTITY_PATH)).owners
    } catch (error) {
      return refused(`base-side identity file does not parse: ${describe(error)}`)
    }
  }

  const baseByLine = new Map(before.map(fact => [fact.lineId, fact]))
  const mergedByLine = new Map(merged.map(fact => [fact.lineId, fact]))
  const entries: AdoptionVerifyEntry[] = []
  const findings: AdoptionVerifyFinding[] = []
  for (const fact of merged) {
    const old = baseByLine.get(fact.lineId)
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(fact)) continue
    const result = readAdoption(repository, fact, call)
    entries.push({
      change: old === undefined ? 'added' : 'changed',
      fact,
      readBack: result.readBack,
    })
    findings.push(...result.findings)
  }
  // A removed entry is only listed. Whether its removal was decided by the right person is the
  // judgement of the confirmer.
  for (const fact of before)
    if (!mergedByLine.has(fact.lineId)) entries.push({ change: 'removed', fact })
  entries.sort((a, b) =>
    a.fact.lineId < b.fact.lineId ? -1 : a.fact.lineId > b.fact.lineId ? 1 : 0,
  )
  return finish({
    kind: 'changed',
    base,
    head,
    mergeTree,
    entries,
    findings,
    exitCode: exitOf(findings),
  })
}

// ---------------------------------------------------------------------------------------------
// Command line

const USAGE =
  'Usage: api-review-cli.ts <draft-card|draft-ri|draft-milestone|check-milestone|verify-owner-adoption> [options]'

function options(args: readonly string[], allowed: readonly string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index] ?? '',
      value = args[index + 1]
    if (!allowed.includes(key) || value === undefined || value.startsWith('--') || values.has(key))
      throw new IntegrationError('input-error', `${USAGE}\nOptions: ${allowed.join(' ')}`)
    values.set(key, value)
  }
  return values
}
function required(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (value === undefined) throw new IntegrationError('input-error', `${key} is required`)
  return value
}
function issueNumber(value: string, key: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new IntegrationError('input-error', `${key} must be a positive integer`)
  return Number(value)
}
function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

/** The task context of this worktree with a target that equals the current remote head. */
function trustedFromContext(root: string): TrustedTarget {
  const status = taskStatus(root)
  if (!status.bound) throw new IntegrationError('refused', 'This worktree is not bound to a task')
  if (status.relation !== 'current')
    throw new IntegrationError('refused', `targetBase is ${status.relation} the remote target`)
  return { candidate: status.head, targetBase: status.targetBase, targetBranch: status.target.ref }
}

/**
 * Integration point of R3-5. `draft-card` and `draft-ri` call the functions that the card and RI
 * modules of R3-5 export. Until they are merged, these two stand-ins refuse with exit 2 and write
 * nothing, so no half draft can be signed.
 */
export type DraftResult = { exit: RunExit; output: unknown }
export type RangeDrafts = {
  draftCard(input: { root: string; call: GhRead }): DraftResult
  draftRi(input: { root: string; track: string; reviewIssue: number; call: GhRead }): DraftResult
}
export const rangeDrafts: RangeDrafts = {
  draftCard: () => ({ exit: 2, output: { code: 'unavailable', message: 'draft-card needs R3-5' } }),
  draftRi: () => ({ exit: 2, output: { code: 'unavailable', message: 'draft-ri needs R3-5' } }),
}

function main(args: readonly string[]): number {
  const [command, ...rest] = args
  const entry = fileURLToPath(import.meta.url)
  switch (command) {
    case 'draft-card': {
      const root = resolve(options(rest, ['--root']).get('--root') ?? process.cwd())
      const result = rangeDrafts.draftCard({ root, call: runGhRead })
      print(result.output)
      return result.exit
    }
    case 'draft-ri': {
      const values = options(rest, ['--root', '--track', '--review-issue'])
      const result = rangeDrafts.draftRi({
        root: resolve(values.get('--root') ?? process.cwd()),
        track: required(values, '--track'),
        reviewIssue: issueNumber(required(values, '--review-issue'), '--review-issue'),
        call: runGhRead,
      })
      print(result.output)
      return result.exit
    }
    case 'draft-milestone': {
      const values = options(rest, ['--root', '--baseline-issue'])
      const root = resolve(values.get('--root') ?? process.cwd())
      const draft = draftMilestone({
        root,
        entry,
        baselineIssue: issueNumber(required(values, '--baseline-issue'), '--baseline-issue'),
        call: runGhRead,
        resolveTrusted: () => trustedFromContext(root),
      })
      print(draft.bundle ?? { kind: 'draft-refused', findings: draft.findings })
      process.stderr.write(`draft-milestone: ${draft.exit} findings=${draft.findings.length}\n`)
      return draft.exit
    }
    case 'check-milestone': {
      const values = options(rest, ['--root', '--baseline-issue', '--semantic-review'])
      const root = resolve(values.get('--root') ?? process.cwd())
      const flag = values.get('--semantic-review')
      if (flag !== undefined && flag !== 'true')
        throw new IntegrationError('input-error', '--semantic-review only accepts true')
      const report = checkMilestone({
        root,
        entry,
        baselineIssue: issueNumber(required(values, '--baseline-issue'), '--baseline-issue'),
        semanticReview: flag === 'true',
        call: runGhRead,
        resolveTrusted: () => trustedFromContext(root),
      })
      print(report)
      process.stderr.write(
        `check-milestone: ${report.exit} pass=${String(report.pass)} rawExitCode=${String(report.rawExitCode)} findings=${report.findings.length}\n`,
      )
      return report.exit
    }
    case 'verify-owner-adoption': {
      const values = options(rest, ['--root', '--base', '--head'])
      const root = resolve(required(values, '--root'))
      const base = required(values, '--base')
      let repository: string
      try {
        const policy = JSON.parse(
          exactTextBlob(root, base, 'docs/engineering/integration-policy.json').text,
        ) as { repository?: unknown }
        if (typeof policy.repository !== 'string') throw new Error('no repository field')
        repository = policy.repository
      } catch (error) {
        print({
          kind: 'input-unknown',
          findings: [unknown(null, `repository of the base policy unreadable: ${describe(error)}`)],
        })
        process.stderr.write('verify-owner-adoption: 2 added=0 changed=0 removed=0 findings=1\n')
        return 2
      }
      const result = verifyOwnerAdoption({
        root,
        base,
        head: required(values, '--head'),
        repository,
        call: runGhRead,
      })
      print(result.report)
      process.stderr.write(`${result.summary}\n`)
      return result.exit
    }
    default:
      throw new IntegrationError('input-error', USAGE)
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        code: error instanceof IntegrationError ? error.code : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    )
    process.exitCode = 2
  }
}
