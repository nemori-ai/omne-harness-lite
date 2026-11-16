import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { repositoryEnv } from '../core/git-environment.ts'
import {
  HISTORICAL_APPROVALS,
  NULL_OBJECT_ID,
  assertUniqueApprovals,
  type HistoricalApproval,
} from './historical-approvals.data.ts'

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

function fingerprintEnv(base: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  const {
    GIT_DIFF_OPTS: _diffOptions,
    GIT_ATTR_SOURCE: _attributeSource,
    ...env
  } = repositoryEnv(base)
  return { ...env, GIT_ATTR_NOSYSTEM: '1' }
}

type ApprovalList = readonly HistoricalApproval[]

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

function objectId(git: Git, type: 'commit' | 'blob', revision: string): string {
  return hashObject(type, git(['cat-file', type, revision]))
}

function verifiedParents(git: Git, commit: string): readonly string[] | undefined {
  const bytes = git(['cat-file', 'commit', commit])
  if (hashObject('commit', bytes) !== commit) return undefined
  const header = bytes.toString('utf8').split('\n\n', 1)[0] ?? ''
  return header.split('\n').flatMap(line => {
    const parent = /^parent ([0-9a-f]{40})$/u.exec(line)?.[1]
    return parent === undefined ? [] : [parent]
  })
}

function blobAt(git: Git, revision: string, path: string): string {
  if (git(['ls-tree', revision, '--', path]).length === 0) return NULL_OBJECT_ID
  return objectId(git, 'blob', `${revision}:${path}`)
}

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

export function inspectHistoricalApproval(
  root: string,
  commit: string,
  protectedPaths: readonly string[],
): readonly HistoricalApproval[] {
  return inspectAgainst(HISTORICAL_APPROVALS, root, commit, protectedPaths)
}
