import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { repositoryEnv } from '../core/git-environment.ts'
import {
  HISTORICAL_APPROVALS,
  NULL_OBJECT_ID,
  assertUniqueApprovals,
  type HistoricalApproval,
} from './historical-approvals.data.ts'

// Fixed diff settings: the same Git objects must give the same bytes under any user or repository
// configuration that these settings cover. core.abbrev=8 matches the abbreviation length at
// approval time. Do not use --full-index: it changes the bytes and so the approved digest.
// attr.tree reads attributes from the empty tree instead of the worktree (Git 2.43 and later).
// Not covered: funcname, xfuncname or binary attributes from info/attributes; .gitattributes in the
// worktree on Git older than 2.43; and object prefix collisions that lengthen the index line.
// They change the bytes, so the approval fails closed (rejection), never opens.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const FINGERPRINT_DIFF_ARGS = [
  '-c',
  'core.abbrev=8',
  '-c',
  'diff.noprefix=false',
  '-c',
  'diff.mnemonicPrefix=false',
  '-c',
  'diff.algorithm=myers',
  '-c',
  'diff.indentHeuristic=true',
  '-c',
  'diff.context=3',
  '-c',
  'diff.interHunkContext=0',
  '-c',
  'diff.suppressBlankEmpty=false',
  '-c',
  'diff.srcPrefix=a/',
  '-c',
  'diff.dstPrefix=b/',
  '-c',
  'core.attributesFile=/dev/null',
  '-c',
  `attr.tree=${EMPTY_TREE}`,
  'diff',
  '--no-ext-diff',
  '--no-textconv',
  '--no-color',
  '--binary',
  '-U3',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--text',
] as const

/**
 * GIT_DIFF_OPTS overrides the context width even over -U3, and GIT_ATTR_SOURCE overrides
 * attr.tree, so the fingerprint call drops both. GIT_ATTR_NOSYSTEM skips system attributes.
 */
function fingerprintEnv(base: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  const {
    GIT_DIFF_OPTS: _diffOptions,
    GIT_ATTR_SOURCE: _attributeSource,
    ...env
  } = repositoryEnv(base)
  return { ...env, GIT_ATTR_NOSYSTEM: '1' }
}

type ApprovalList = readonly HistoricalApproval[]

/** The protected paths of the commit are exactly the registered ones: one more or one less fails. */
function coversExactly(
  list: ApprovalList,
  commit: string,
  protectedPaths: readonly string[],
): boolean {
  const registered = new Set(list.filter(item => item.commit === commit).map(item => item.path))
  const listed = new Set(protectedPaths)
  return (
    registered.size > 0 &&
    listed.size === protectedPaths.length &&
    listed.size === registered.size &&
    protectedPaths.every(path => registered.has(path))
  )
}

function matchAgainst(
  list: ApprovalList,
  candidate: Partial<HistoricalApproval>,
  protectedPaths: readonly string[],
): HistoricalApproval | undefined {
  const approval = list.find(
    item => item.commit === candidate.commit && item.path === candidate.path,
  )
  return approval !== undefined &&
    coversExactly(list, approval.commit, protectedPaths) &&
    candidate.parent === approval.parent &&
    candidate.oldBlob === approval.oldBlob &&
    candidate.newBlob === approval.newBlob &&
    candidate.diffSha256 === approval.diffSha256 &&
    candidate.decisionUrl === approval.decisionUrl
    ? approval
    : undefined
}

/** Internal matcher: it can recognize a compiled decision, never authorize a new one. */
export function matchHistoricalApproval(
  candidate: Partial<HistoricalApproval>,
  protectedPaths: readonly string[],
): HistoricalApproval | undefined {
  return matchAgainst(HISTORICAL_APPROVALS, candidate, protectedPaths)
}

type Git = (args: readonly string[], env?: NodeJS.ProcessEnv) => Buffer

function gitIn(root: string): Git {
  return (args, env = repositoryEnv(process.env)) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
}

function hashObject(type: 'commit' | 'blob', bytes: Buffer): string {
  return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex')
}

/** Hash the object bytes again, so a Git replacement object cannot pass as the original. */
function objectId(git: Git, type: 'commit' | 'blob', revision: string): string {
  return hashObject(type, git(['cat-file', type, revision]))
}

/** The parents written in the commit object itself, read from bytes whose hash was checked. */
function verifiedParents(git: Git, commit: string): readonly string[] | undefined {
  const bytes = git(['cat-file', 'commit', commit])
  if (hashObject('commit', bytes) !== commit) return undefined
  const header = bytes.toString('utf8').split('\n\n', 1)[0] ?? ''
  return header.split('\n').flatMap(line => {
    const parent = /^parent ([0-9a-f]{40})$/u.exec(line)?.[1]
    return parent === undefined ? [] : [parent]
  })
}

/** The blob at `revision:path`, or NULL_OBJECT_ID when the tree has no such path. */
function blobAt(git: Git, revision: string, path: string): string {
  if (git(['ls-tree', revision, '--', path]).length === 0) return NULL_OBJECT_ID
  return objectId(git, 'blob', `${revision}:${path}`)
}

/**
 * Read the change of one path between a parent and a commit from immutable Git objects. The
 * compiled constants come from this same function; errors propagate as tool failures.
 */
export function observeHistoricalChange(
  root: string,
  commit: string,
  parent: string,
  path: string,
): Pick<HistoricalApproval, 'oldBlob' | 'newBlob' | 'diffSha256'> {
  const git = gitIn(root)
  return {
    oldBlob: blobAt(git, parent, path),
    newBlob: blobAt(git, commit, path),
    diffSha256: createHash('sha256')
      .update(
        git([...FINGERPRINT_DIFF_ARGS, parent, commit, '--', path], fingerprintEnv(process.env)),
      )
      .digest('hex'),
  }
}

/**
 * Test seam only: the same check over a given list. Production code calls
 * inspectHistoricalApproval, which always passes the compiled list; no repository input reaches here.
 */
export function inspectAgainst(
  list: ApprovalList,
  root: string,
  commit: string,
  protectedPaths: readonly string[],
): readonly HistoricalApproval[] {
  assertUniqueApprovals(list)
  if (!coversExactly(list, commit, protectedPaths)) return []
  const git = gitIn(root)
  const parents = verifiedParents(git, commit)
  if (parents === undefined) return []
  return list
    .filter(item => item.commit === commit)
    .flatMap(approval => {
      // The candidate takes the registered parent, so these two checks are the only parent guards.
      if (!parents.includes(approval.parent)) return []
      if (objectId(git, 'commit', approval.parent) !== approval.parent) return []
      const matched = matchAgainst(
        list,
        {
          commit,
          parent: approval.parent,
          path: approval.path,
          ...observeHistoricalChange(root, commit, approval.parent, approval.path),
          decisionUrl: approval.decisionUrl,
        },
        protectedPaths,
      )
      return matched === undefined ? [] : [matched]
    })
}

/**
 * The compiled approvals that match this commit's protected paths exactly, one for each path.
 * Read immutable Git objects; errors propagate to the caller as tool failures.
 */
export function inspectHistoricalApproval(
  root: string,
  commit: string,
  protectedPaths: readonly string[],
): readonly HistoricalApproval[] {
  return inspectAgainst(HISTORICAL_APPROVALS, root, commit, protectedPaths)
}
