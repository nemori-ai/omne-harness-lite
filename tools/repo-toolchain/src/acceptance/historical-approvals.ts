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

// Fixed diff settings: the same Git objects must give the same bytes in every repository and
// user configuration. core.abbrev=8 matches the abbreviation length at approval time.
// Do not use --full-index: it changes the bytes and so the approved digest.
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
  'diff',
  '--no-ext-diff',
  '--no-textconv',
  '--no-color',
  '--binary',
] as const

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
  const git = (args: readonly string[]) =>
    execFileSync('git', args, {
      cwd: root,
      env: repositoryEnv(process.env),
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
        .update(git([...FINGERPRINT_DIFF_ARGS, D010.parent, commit, '--', D010.path]))
        .digest('hex'),
      decisionUrl: D010.decisionUrl,
    },
    protectedPaths,
  )
}
