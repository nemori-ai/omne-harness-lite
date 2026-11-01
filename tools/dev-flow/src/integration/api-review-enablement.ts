// The enablement check of the API semantic review path (candidate-r4.md 3.2).
//
// Four steps, in this order. A failed step stops the later steps, but every finding of the failed
// step is reported:
//   1. entry location: the entry module lies under `<root>/tools/dev-flow/src`. This runs before
//      any Git read, trusted-target read or JSON parse.
//   2. presence: each AuthorityFiles path exists on the targetBase side and the candidate side.
//   3. equality: each path present on both sides has the same Git object id.
//   4. parse: the targetBase `delivery-lines.json` and `api-review-owners.json` parse as JSON.
// The caller resolves the trusted candidate and targetBase (candidate-r4.md 3) through
// `resolveTrusted`, which this module calls only after step 1 passed. The caller starts the
// installed CLI, builds the Comparison, and reads comments, users, reviewers and adoption only
// after `checkEnablement` returned `code: null`.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { git } from './git.ts'

type Sha256 = string
type Commit = string
type RepoPath = string
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** The failure codes of this check and their exit codes (candidate-r4.md 7.1). */
export const ENABLEMENT_FAILURE_EXIT = {
  'api-review-entry-outside-root': 1,
  'api-review-self-authorization': 1,
  'api-review-policy-unavailable': 2,
} as const
export type EnablementFailureCode = keyof typeof ENABLEMENT_FAILURE_EXIT

export type Finding = {
  code: EnablementFailureCode
  member: null
  detail: Json
}
export type AuthorityPathPresence = {
  path: RepoPath
  targetBase: 'present' | 'absent'
  candidate: 'present' | 'absent'
}
export type Enablement =
  | { kind: 'enabled'; authoritySha256: Sha256 }
  | { kind: 'entry-outside-root'; entryRealpath: string; root: string }
  | { kind: 'presence'; rows: AuthorityPathPresence[] }
  | { kind: 'oid-differs'; paths: RepoPath[] }
  | { kind: 'unparsable'; path: RepoPath }

export type EnablementResult = {
  enablement: Enablement
  /** The primary failure code; `null` when the path is enabled. */
  code: EnablementFailureCode | null
  /** The exit code of `code`; 0 when enabled. */
  exit: 0 | 1 | 2
  findings: Finding[]
}

/** AuthorityFiles paths (candidate-r4.md 3.1). A directory is compared by its tree oid. */
export const AUTHORITY_PATHS: readonly RepoPath[] = [
  'tools/dev-flow/src',
  'tools/dev-flow/package.json',
  'docs/engineering/integration.md',
  'docs/engineering/delivery.md',
  'docs/verification.md',
  'docs/engineering/delivery-lines.json',
  'docs/engineering/api-review-owners.json',
  'docs/engineering/integration-policy.json',
  'repo-toolchain.config.json',
].sort()

const LINES_PATH = 'docs/engineering/delivery-lines.json'
const OWNERS_PATH = 'docs/engineering/api-review-owners.json'
const SOURCE_DIRECTORY = ['tools', 'dev-flow', 'src'] as const

/** Every read of this check goes through these ports, so tests can count and order them. */
export type EnablementPorts = {
  realpath(path: string): string
  /** Git object id of `path` in `commit` (blob or tree); `null` when the path is absent. */
  objectId(commit: Commit, path: RepoPath): string | null
  readBlob(commit: Commit, path: RepoPath): string
  parseJson(text: string): unknown
}

export function gitEnablementPorts(root: string): EnablementPorts {
  return {
    realpath: path => realpathSync(path),
    objectId: (commit, path) => {
      const line = git(root, ['ls-tree', commit, '--', path])
      if (line === '') return null
      const match = /^\d+ (?:blob|tree) ([0-9a-f]{40})\t/.exec(line)
      if (match === null) throw new Error(`unexpected ls-tree output for ${path}`)
      return match[1] as string
    },
    readBlob: (commit, path) => git(root, ['show', `${commit}:${path}`]),
    parseJson: text => JSON.parse(text) as unknown,
  }
}

export type EnablementInput = {
  /** Path of the running entry module, for example `fileURLToPath(import.meta.url)`. */
  entry: string
  /** The candidate checkout root. */
  root: string
  /** Step 1 passed: read the trusted candidate HEAD and targetBase (candidate-r4.md 3). */
  resolveTrusted(): { candidate: Commit; targetBase: Commit }
}

function result(enablement: Enablement, findings: Finding[]): EnablementResult {
  const code = findings.some(f => f.code === 'api-review-self-authorization')
    ? 'api-review-self-authorization'
    : (findings[0]?.code ?? null)
  return { enablement, code, exit: code === null ? 0 : ENABLEMENT_FAILURE_EXIT[code], findings }
}
function finding(code: EnablementFailureCode, detail: Json): Finding {
  return { code, member: null, detail }
}
function realpathOr(ports: EnablementPorts, path: string): string {
  try {
    return ports.realpath(path)
  } catch {
    return path
  }
}
function isInside(directory: string, path: string): boolean {
  const difference = relative(directory, path)
  return difference !== '' && !difference.startsWith('..') && !isAbsolute(difference)
}
/** H of candidate-r4.md 4 for an array of flat `{path,oid}` objects, keys in code unit order. */
function authorityDigest(entries: { path: RepoPath; oid: string }[]): Sha256 {
  const text = JSON.stringify(entries.map(({ oid, path }) => ({ oid, path })))
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function checkEnablement(input: EnablementInput, ports: EnablementPorts): EnablementResult {
  // Step 1: no Git read, no trusted-target read, no JSON parse before this point.
  const root = realpathOr(ports, input.root)
  const entryRealpath = realpathOr(ports, input.entry)
  if (!isInside(join(root, ...SOURCE_DIRECTORY), entryRealpath)) {
    return result({ kind: 'entry-outside-root', entryRealpath, root }, [
      finding('api-review-entry-outside-root', { entryRealpath, root }),
    ])
  }
  const { candidate, targetBase } = input.resolveTrusted()

  // Step 2: presence on both sides.
  const oids = AUTHORITY_PATHS.map(path => ({
    path,
    target: ports.objectId(targetBase, path),
    candidate: ports.objectId(candidate, path),
  }))
  const rows: AuthorityPathPresence[] = []
  const presenceFindings: Finding[] = []
  for (const { path, target, candidate: head } of oids) {
    if (target !== null && head !== null) continue
    const row: AuthorityPathPresence = {
      path,
      targetBase: target === null ? 'absent' : 'present',
      candidate: head === null ? 'absent' : 'present',
    }
    rows.push(row)
    presenceFindings.push(
      finding(
        target === null && head === null
          ? 'api-review-policy-unavailable'
          : 'api-review-self-authorization',
        { ...row },
      ),
    )
  }
  if (rows.length > 0) return result({ kind: 'presence', rows }, presenceFindings)

  // Step 3: object id equality.
  const differing = oids.filter(item => item.target !== item.candidate).map(item => item.path)
  if (differing.length > 0)
    return result({ kind: 'oid-differs', paths: differing }, [
      finding('api-review-self-authorization', { paths: differing }),
    ])

  // Step 4: parse the targetBase policy files, all of them reported.
  const unparsable = [LINES_PATH, OWNERS_PATH].filter(path => {
    try {
      ports.parseJson(ports.readBlob(targetBase, path))
      return false
    } catch {
      return true
    }
  })
  if (unparsable.length > 0)
    return result(
      { kind: 'unparsable', path: unparsable[0] as string },
      unparsable.map(path => finding('api-review-policy-unavailable', { path })),
    )

  return result(
    {
      kind: 'enabled',
      authoritySha256: authorityDigest(
        oids.map(item => ({ path: item.path, oid: item.target as string })),
      ),
    },
    [],
  )
}
