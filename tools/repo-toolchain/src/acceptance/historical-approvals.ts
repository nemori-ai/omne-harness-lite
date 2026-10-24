import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { repositoryEnv } from '../core/git-environment.ts'

export interface HistoricalApproval {
  readonly commit: string
  readonly parent: string
  readonly path: string
  readonly oldBlob: string
  readonly newBlob: string
  readonly diffSha256: string
  readonly decisionUrl: string
}

// The reviewed tool artifact owns this decision. Repository inputs cannot add approvals.
const D010: HistoricalApproval = Object.freeze({
  commit: '48ad37d292796326d65055a75e8a1fde44fe4233',
  parent: 'e7aab8ec73002713d2ef6486401816850c984fb1',
  path: 'packages/agent/agent/acceptance/README.md',
  oldBlob: 'f7fac2fc21bfceb51c3dd84542b866eb7bb12c89',
  newBlob: 'fbf0d08732f5d2004c3d63cff6c8be11442da99b',
  diffSha256: 'eee5be00ebfdf300db6978cb2981a1b989dcd977846fc3de2669bb835edf3a2c',
  decisionUrl: 'https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357',
})

// Fixed diff settings: the same Git objects must give the same bytes under any user or repository
// configuration that these settings cover. core.abbrev=8 matches the abbreviation length at
// approval time. Do not use --full-index: it changes the bytes and so the approved digest.
// attr.tree reads attributes from the empty tree instead of the worktree (Git 2.46 and later).
// Not covered: funcname, xfuncname or binary attributes from info/attributes; .gitattributes in the
// worktree on Git older than 2.46; and object prefix collisions that lengthen the index line.
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

/** Internal matcher: it can recognize the compiled decision, never authorize a new one. */
export function matchHistoricalApproval(
  candidate: Partial<HistoricalApproval>,
  protectedPaths: readonly string[],
): HistoricalApproval | undefined {
  return protectedPaths.length === 1 &&
    protectedPaths[0] === D010.path &&
    candidate.commit === D010.commit &&
    candidate.parent === D010.parent &&
    candidate.path === D010.path &&
    candidate.oldBlob === D010.oldBlob &&
    candidate.newBlob === D010.newBlob &&
    candidate.diffSha256 === D010.diffSha256 &&
    candidate.decisionUrl === D010.decisionUrl
    ? D010
    : undefined
}

/** Read immutable Git objects; errors propagate to the caller as tool failures. */
export function inspectHistoricalApproval(
  root: string,
  commit: string,
  protectedPaths: readonly string[],
): HistoricalApproval | undefined {
  if (commit !== D010.commit || protectedPaths.length !== 1 || protectedPaths[0] !== D010.path)
    return undefined
  const git = (args: readonly string[], env: NodeJS.ProcessEnv = repositoryEnv(process.env)) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const objectId = (type: 'commit' | 'blob', revision: string) => {
    const bytes = git(['cat-file', type, revision])
    return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex')
  }
  if (objectId('commit', commit) !== D010.commit || objectId('commit', D010.parent) !== D010.parent)
    return undefined
  const identity = git(['show', '-s', '--format=%H %P', commit]).toString('utf8').trim()
  if (identity !== `${D010.commit} ${D010.parent}`) return undefined
  return matchHistoricalApproval(
    {
      commit,
      parent: D010.parent,
      path: D010.path,
      oldBlob: objectId('blob', `${D010.parent}:${D010.path}`),
      newBlob: objectId('blob', `${commit}:${D010.path}`),
      diffSha256: createHash('sha256')
        .update(
          git(
            [...FINGERPRINT_DIFF_ARGS, D010.parent, commit, '--', D010.path],
            fingerprintEnv(process.env),
          ),
        )
        .digest('hex'),
      decisionUrl: D010.decisionUrl,
    },
    protectedPaths,
  )
}
