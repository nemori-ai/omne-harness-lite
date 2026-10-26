import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { fetchIssueCard, type GhCommand } from '../delivery/github-read.ts'
import { record } from '../delivery/protocol.ts'
import { IntegrationError, json } from './parse.ts'

/**
 * Runs one program without a shell and returns its exit status and output. `env` adds to the
 * process environment. Tests replace it to record the steps.
 */
export type Runner = (
  program: string,
  args: readonly string[],
  options: { cwd: string; env?: Record<string, string> },
) => { status: number; stdout: string; stderr: string }
export const runProgram: Runner = (program, args, { cwd, env }) => {
  const result = spawnSync(program, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env },
  })
  return {
    status: result.error === undefined ? (result.status ?? 1) : 1,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  }
}
/** One step that must succeed; a failure names the step and keeps the last output lines. */
function step(
  run: Runner,
  name: string,
  program: string,
  args: readonly string[],
  cwd: string,
  env?: Record<string, string>,
): string {
  const result = run(program, args, env === undefined ? { cwd } : { cwd, env })
  if (result.status !== 0)
    throw new IntegrationError(
      'unknown',
      `${name} failed (exit ${result.status}): ${result.stderr.trim().split('\n').slice(-5).join(' | ')}`,
    )
  return result.stdout
}
/** True when the program exits 0, false when it exits 1; any other status is a failed step. */
function check(
  run: Runner,
  name: string,
  program: string,
  args: readonly string[],
  cwd: string,
): boolean {
  const result = run(program, args, { cwd })
  if (result.status === 0 || result.status === 1) return result.status === 0
  throw new IntegrationError('unknown', `${name} failed (exit ${result.status})`)
}

/** The card's binding, read from the Issue body; the worktree commands derive their inputs from it. */
export function issueBinding(repository: string, number: number, call: GhCommand): TaskBinding {
  const card = fetchIssueCard(repository, number, call)
  const binding = readTaskBinding(card.body, card.identity)
  if (binding === undefined)
    throw new IntegrationError('refused', `Issue #${number} has no binding; dispatch it first`)
  return binding
}
/** The `start` command file of a binding: the dispatch comment authorizes this exact attempt. */
export function startInput(binding: TaskBinding) {
  return {
    kind: 'start' as const,
    authority: binding.dispatch,
    issue: binding.issue.url,
    revision: binding.revision,
    attempt: binding.attempt,
  }
}
/** The task directory of a card under the worktree's tmp. */
export const taskDirectory = (binding: TaskBinding) => `tmp/issue-${binding.issue.number}`

const CURSOR_RUNTIME = ['Dockerfile', 'environment.json', 'install.sh']
/**
 * Regenerates the agent projections of a worktree from its own `.meta_harness/agents` source:
 * compile into a fresh stage directory, copy the stage over `.meta_harness/` by content,
 * relink the root entries, drop group write on the three Cursor runtime files, then run
 * `check:agents`. A failed step stops the run. The stage directory is removed in every case.
 */
export function regenerateProjections(tree: string, run: Runner = runProgram): void {
  const stage = mkdtempSync(join(tmpdir(), 'omne-agents-stage-'))
  const python = { PYTHONDONTWRITEBYTECODE: '1' }
  try {
    step(
      run,
      'compile agents',
      'uv',
      [
        'run',
        '--locked',
        'python',
        '.meta_harness/tooling/src/compile_agents.py',
        '--source',
        '.meta_harness/agents',
        '--output',
        stage,
      ],
      tree,
      python,
    )
    step(run, 'copy projections', 'rsync', ['-rlpc', `${stage}/`, '.meta_harness/'], tree)
    step(
      run,
      'link agents',
      'uv',
      [
        'run',
        '--locked',
        'python',
        '.meta_harness/tooling/src/link_agents.py',
        '--project-root',
        '.',
      ],
      tree,
      python,
    )
    for (const name of CURSOR_RUNTIME) {
      const path = join(tree, '.meta_harness/.cursor', name)
      if (existsSync(path)) chmodSync(path, statSync(path).mode & ~0o020)
    }
    step(run, 'check:agents', 'pnpm', ['run', 'check:agents'], tree)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/**
 * Makes the local branch match the remote branch tip before a worktree is added on it. Fetches
 * the branch; a missing local branch is left for `worktree add --track`; a local branch behind
 * the remote moves forward to the remote tip; a local branch ahead of the remote or on another
 * history is refused, so a new attempt never starts on a stale or unpublished head. Returns
 * whether the local branch exists.
 */
function alignLocalBranch(root: string, branch: string, remote: string, run: Runner): boolean {
  step(run, 'fetch branch', 'git', ['fetch', '--quiet', remote, branch], root)
  const local = `refs/heads/${branch}`,
    upstream = `refs/remotes/${remote}/${branch}`
  if (!check(run, 'read local branch', 'git', ['show-ref', '--quiet', '--verify', local], root))
    return false
  if (check(run, 'compare branch', 'git', ['merge-base', '--is-ancestor', upstream, local], root)) {
    if (check(run, 'compare branch', 'git', ['merge-base', '--is-ancestor', local, upstream], root))
      return true
    throw new IntegrationError(
      'refused',
      `Local ${branch} has commits that ${remote}/${branch} lacks; push them first`,
    )
  }
  if (!check(run, 'compare branch', 'git', ['merge-base', '--is-ancestor', local, upstream], root))
    throw new IntegrationError('refused', `Local ${branch} and ${remote}/${branch} have diverged`)
  step(run, 'move local branch forward', 'git', ['branch', '--force', branch, upstream], root)
  return true
}

/**
 * Prepares a new worktree for a dispatched attempt and runs `start` in it. The branch,
 * dispatch, revision and attempt come from the card's binding. Steps: refuse an existing
 * directory; align the local branch with the remote tip; add the worktree on it (tracking the
 * remote branch when no local branch exists); install with the frozen lock file; restore
 * `evidence` into the task directory; regenerate the agent projections; write the start
 * command into the task directory and run the worktree's own `start`. Nothing is removed on
 * failure.
 */
export function prepareWorktree({
  root,
  tree,
  binding,
  remote = 'origin',
  evidence,
  run = runProgram,
}: {
  root: string
  tree: string
  binding: TaskBinding
  remote?: string
  evidence?: string | undefined
  run?: Runner
}): { tree: string; context: Record<string, unknown>; reports: string[] } {
  if (existsSync(tree)) throw new IntegrationError('refused', `${tree} already exists`)
  const branch = binding.branch
  const local = alignLocalBranch(root, branch, remote, run)
  step(
    run,
    'add worktree',
    'git',
    local
      ? ['worktree', 'add', '--quiet', tree, branch]
      : ['worktree', 'add', '--quiet', tree, '-b', branch, '--track', `${remote}/${branch}`],
    root,
  )
  step(run, 'install', 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], tree)
  const task = join(tree, taskDirectory(binding))
  mkdirSync(task, { recursive: true })
  if (evidence !== undefined) cpSync(evidence, task, { recursive: true })
  regenerateProjections(tree, run)
  const input = join(task, 'start.json')
  writeFileSync(input, `${JSON.stringify(startInput(binding), null, 2)}\n`)
  const result = run(
    'node',
    [
      '--experimental-strip-types',
      'tools/dev-flow/src/integration/cli.ts',
      'execute',
      '--root',
      tree,
      '--input',
      input,
    ],
    { cwd: tree },
  )
  const reports = result.stderr.split('\n').filter(line => line.trim() !== '')
  if (result.status !== 0)
    throw new IntegrationError('refused', `start failed in ${tree}: ${reports.join(' | ')}`)
  return { tree, context: record(json(result.stdout, 'start output'), 'context'), reports }
}

/**
 * The entries `git status --porcelain --ignored` reports beyond tracked changes: untracked
 * (`??`) and ignored (`!!`) paths, minus those under `keep`.
 */
function untrackedEntries(tree: string, keep: string | undefined, run: Runner): string[] {
  return step(run, 'read untracked files', 'git', ['status', '--porcelain', '--ignored'], tree)
    .split('\n')
    .filter(line => line.startsWith('?? ') || line.startsWith('!! '))
    .map(line => line.slice(3))
    .filter(path => keep === undefined || !(path === `${keep}/` || path.startsWith(`${keep}/`)))
}
function trackedChanges(tree: string, run: Runner): string[] {
  return step(
    run,
    'read tracked changes',
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    tree,
  )
    .split('\n')
    .filter(line => line.trim() !== '')
}

/**
 * Moves a card to a new worktree for the attempt now in the binding, on the same branch,
 * without removing the old tree. Refuses when the old tree has uncommitted tracked changes,
 * is on another branch, or has commits the remote branch lacks; it never pushes. Detaches the old tree so the branch is free, copies its task directory,
 * without stage directories, aside, then prepares the new tree from the remote branch tip with
 * that copy as evidence. Untracked and ignored paths of the old tree outside its task directory
 * are listed in `warnings` and left in place; `removeWorktree` deletes the old tree on request.
 */
export function swapWorktree({
  root,
  old,
  tree,
  binding,
  remote = 'origin',
  run = runProgram,
}: {
  root: string
  old: string
  tree: string
  binding: TaskBinding
  remote?: string
  run?: Runner
}): ReturnType<typeof prepareWorktree> & { evidence: string | undefined; warnings: string[] } {
  const branch = binding.branch
  if (trackedChanges(old, run).length > 0)
    throw new IntegrationError('refused', `${old} has uncommitted tracked changes`)
  const current = step(run, 'read old branch', 'git', ['branch', '--show-current'], old).trim()
  if (current !== branch)
    throw new IntegrationError('refused', `${old} is on ${current}, the binding names ${branch}`)
  if (existsSync(tree)) throw new IntegrationError('refused', `${tree} already exists`)
  // Refuse unpublished commits before detaching, so a refusal leaves the old tree as it was.
  step(run, 'fetch branch', 'git', ['fetch', '--quiet', remote, branch], old)
  if (
    !check(
      run,
      'compare branch',
      'git',
      ['merge-base', '--is-ancestor', 'HEAD', `refs/remotes/${remote}/${branch}`],
      old,
    )
  )
    throw new IntegrationError(
      'refused',
      `${old} has commits that ${remote}/${branch} lacks; push them first`,
    )
  const warnings = untrackedEntries(old, taskDirectory(binding), run)
  const source = join(old, taskDirectory(binding))
  let evidence: string | undefined
  if (existsSync(source)) {
    evidence = mkdtempSync(join(tmpdir(), `omne-swap-issue-${binding.issue.number}-`))
    cpSync(source, evidence, {
      recursive: true,
      filter: path => !/(^|\/)agents-stage[^/]*$/.test(path),
    })
  }
  step(run, 'detach old worktree', 'git', ['checkout', '--quiet', '--detach'], old)
  return { ...prepareWorktree({ root, tree, binding, remote, evidence, run }), evidence, warnings }
}

/**
 * Removes one worktree on request. Always refuses uncommitted tracked changes. Without
 * `force` it only lists the untracked and ignored paths that removal would delete; with
 * `force` it runs `git worktree remove --force` from `root`.
 */
export function removeWorktree({
  root,
  tree,
  force,
  run = runProgram,
}: {
  root: string
  tree: string
  force: boolean
  run?: Runner
}): { tree: string; untracked: string[]; removed: boolean } {
  if (trackedChanges(tree, run).length > 0)
    throw new IntegrationError('refused', `${tree} has uncommitted tracked changes`)
  const untracked = untrackedEntries(tree, undefined, run)
  if (!force) return { tree, untracked, removed: false }
  step(run, 'remove worktree', 'git', ['worktree', 'remove', '--force', tree], root)
  return { tree, untracked, removed: true }
}
