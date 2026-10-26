import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { readIssueCard, REST_HEADERS, type GhCommand } from '../delivery/github-read.ts'
import { text } from '../delivery/protocol.ts'
import { IntegrationError } from './parse.ts'

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

/** The card's binding, read from the Issue body; the worktree commands derive their inputs from it. */
export function issueBinding(repository: string, number: number, call: GhCommand): TaskBinding {
  const card = readIssueCard(
    call(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repository}/issues/${number}`],
      15_000,
    ),
    repository,
    number,
  )
  const binding = readTaskBinding(card.body, {
    repository,
    number,
    url: card.url,
    id: text(card.issue.node_id, 'Issue.node_id'),
  })
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
 * `check:agents`. A failed step stops the run; nothing is deleted.
 */
export function regenerateProjections(tree: string, run: Runner = runProgram): { stage: string } {
  const stage = mkdtempSync(join(tmpdir(), 'omne-agents-stage-'))
  const python = { PYTHONDONTWRITEBYTECODE: '1' }
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
  return { stage }
}

/**
 * Prepares a new worktree for a dispatched attempt and runs `start` in it. The branch,
 * dispatch, revision and attempt come from the card's binding. Steps: refuse an existing
 * directory; fetch the branch; add the worktree on it (tracking the remote branch when no
 * local branch exists); install with the frozen lock file; restore `evidence` into the task
 * directory; regenerate the agent projections; write the start command into the task
 * directory and run the worktree's own `start`. Nothing is removed on failure.
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
}): { tree: string; context: unknown; reports: string[] } {
  if (existsSync(tree)) throw new IntegrationError('refused', `${tree} already exists`)
  const branch = binding.branch
  step(run, 'fetch branch', 'git', ['fetch', '--quiet', remote, branch], root)
  const local =
    run('git', ['show-ref', '--quiet', `refs/heads/${branch}`], { cwd: root }).status === 0
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
  return { tree, context: JSON.parse(result.stdout), reports }
}

/**
 * Replaces the old worktree of a card with a new one for the attempt now in the binding,
 * on the same branch. Refuses when the old tree has uncommitted tracked changes, is on another
 * branch, or has commits the remote branch lacks: push them first. Copies the old task
 * directory, without stage directories, aside; removes the old worktree; then prepares the
 * new one with that copy as evidence.
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
}): ReturnType<typeof prepareWorktree> & { evidence: string | undefined } {
  const branch = binding.branch
  if (
    step(
      run,
      'read old status',
      'git',
      ['status', '--porcelain', '--untracked-files=no'],
      old,
    ).trim() !== ''
  )
    throw new IntegrationError('refused', `${old} has uncommitted tracked changes`)
  const current = step(run, 'read old branch', 'git', ['branch', '--show-current'], old).trim()
  if (current !== branch)
    throw new IntegrationError('refused', `${old} is on ${current}, the binding names ${branch}`)
  step(run, 'fetch branch', 'git', ['fetch', '--quiet', remote, branch], old)
  if (
    run('git', ['merge-base', '--is-ancestor', 'HEAD', `${remote}/${branch}`], { cwd: old })
      .status !== 0
  )
    throw new IntegrationError(
      'refused',
      `${old} has commits that ${remote}/${branch} lacks; push them first`,
    )
  const source = join(old, taskDirectory(binding))
  let evidence: string | undefined
  if (existsSync(source)) {
    evidence = mkdtempSync(join(tmpdir(), `omne-swap-issue-${binding.issue.number}-`))
    cpSync(source, evidence, {
      recursive: true,
      filter: path => !/(^|\/)agents-stage[^/]*$/.test(path),
    })
  }
  step(run, 'remove old worktree', 'git', ['worktree', 'remove', '--force', old], root)
  return { ...prepareWorktree({ root, tree, binding, remote, evidence, run }), evidence }
}
