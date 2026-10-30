import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { fetchIssueCard, type GhCommand } from '../delivery/github-read.ts'
import { record } from '../delivery/protocol.ts'
import { IntegrationError, json } from './parse.ts'

/**
 * Changes to the process environment for one step: a string sets the variable, `undefined`
 * removes it. On Windows the removal ignores case, as the environment there does.
 */
export type EnvChanges = Readonly<Record<string, string | undefined>>
/**
 * Runs one program without a shell and returns its exit status and output. `env` changes the
 * process environment. Tests replace it to record the steps.
 */
export type Runner = (
  program: string,
  args: readonly string[],
  options: { cwd: string; env?: EnvChanges },
) => { status: number; stdout: string; stderr: string }
/** `base` with `changes` applied. */
export function changedEnvironment(
  base: Readonly<Record<string, string | undefined>>,
  changes: EnvChanges,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const same = (a: string, b: string) =>
    platform === 'win32' ? a.toUpperCase() === b.toUpperCase() : a === b
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(base))
    if (value !== undefined && !Object.keys(changes).some(name => same(name, key)))
      result[key] = value
  for (const [key, value] of Object.entries(changes)) if (value !== undefined) result[key] = value
  return result
}
export const runProgram: Runner = (program, args, { cwd, env }) => {
  const result = spawnSync(program, [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: changedEnvironment(process.env, env ?? {}),
  })
  return {
    status: result.error === undefined ? (result.status ?? 1) : 1,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? '',
  }
}
/**
 * The parts of the host that decide how programs are started: the platform, the environment
 * whose `PATH` is searched, and the Node executable. Tests inject one to cover the other
 * platform or a `PATH` without `rsync`.
 */
export type Host = {
  platform: NodeJS.Platform
  env: Readonly<Record<string, string | undefined>>
  execPath: string
}
export const realHost = (): Host => ({
  platform: process.platform,
  env: process.env,
  execPath: process.execPath,
})
const pathDirectories = (host: Host) =>
  (host.env['PATH'] ?? host.env['Path'] ?? '')
    .split(host.platform === 'win32' ? ';' : delimiter)
    .filter(directory => directory !== '')

/** The program and leading arguments that start pnpm. */
export type PnpmCommand = { program: string; args: string[] }
/**
 * How pnpm starts on `host`. POSIX runs `pnpm`. Windows searches `PATH` in order, because Node
 * cannot start `pnpm.cmd` without a shell. The first directory that holds `pnpm.exe` (the
 * standalone layout) starts that file. The first directory that holds `pnpm.cmd` with
 * `node_modules/pnpm/bin/pnpm.cjs` beside it (the npm global layout) runs that file with the
 * current Node. A `pnpm.cmd` without `pnpm.cjs` is skipped. Throws when no directory qualifies.
 */
export function pnpmCommand(host: Host): PnpmCommand {
  if (host.platform !== 'win32') return { program: 'pnpm', args: [] }
  const seen: string[] = []
  for (const directory of pathDirectories(host)) {
    const exe = join(directory, 'pnpm.exe')
    if (existsSync(exe)) return { program: exe, args: [] }
    if (!existsSync(join(directory, 'pnpm.cmd'))) continue
    const entry = join(directory, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    if (existsSync(entry)) return { program: host.execPath, args: [entry] }
    seen.push(join(directory, 'pnpm.cmd'))
  }
  throw new IntegrationError(
    'unknown',
    seen.length === 0
      ? 'Neither pnpm.exe nor pnpm.cmd is on PATH'
      : `pnpm.exe is not on PATH, and ${seen.join(', ')} has no node_modules/pnpm/bin/pnpm.cjs beside it, so pnpm cannot start`,
  )
}
/** Whether the copy step can use `rsync`: only on POSIX, and only when a `PATH` entry holds it. */
function hasRsync(host: Host): boolean {
  return host.platform !== 'win32' && pathDirectories(host).some(d => existsSync(join(d, 'rsync')))
}
/** One step that runs pnpm with `args`, started as `pnpm` says. */
function pnpmStep(
  run: Runner,
  name: string,
  args: readonly string[],
  cwd: string,
  pnpm: PnpmCommand,
): string {
  return step(run, name, pnpm.program, [...pnpm.args, ...args], cwd)
}

/**
 * Copies the files under `source` into `destination` the way `rsync -rlpc source/ destination/`
 * does: directories are created as needed, symbolic links are copied as links, a file is
 * rewritten only when its content differs, and permission bits follow the source (POSIX only).
 * Nothing in `destination` is deleted. A path that is a directory on one side and not on the
 * other is refused.
 */
export function copyProjections(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name),
      to = join(destination, entry.name),
      existing = lstatSync(to, { throwIfNoEntry: false })
    if (entry.isDirectory()) {
      if (existing !== undefined && !existing.isDirectory())
        throw new IntegrationError('unknown', `copy projections: ${to} is not a directory`)
      copyProjections(from, to)
      continue
    }
    if (existing?.isDirectory() === true)
      throw new IntegrationError('unknown', `copy projections: ${to} is a directory`)
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(from)
      if (existing?.isSymbolicLink() !== true || readlinkSync(to) !== target) {
        rmSync(to, { force: true })
        symlinkSync(target, to)
      }
    } else if (entry.isFile()) {
      const mode = statSync(from).mode & 0o7777
      const same =
        existing?.isFile() === true &&
        existing.size === statSync(from).size &&
        readFileSync(from).equals(readFileSync(to))
      if (!same) {
        rmSync(to, { force: true })
        copyFileSync(from, to)
      }
      // Windows keeps no POSIX permission bits, so there is nothing to carry over.
      if (process.platform !== 'win32' && (statSync(to).mode & 0o7777) !== mode) chmodSync(to, mode)
    }
  }
}

/** One step that must succeed; a failure names the step and keeps the last output lines. */
function step(
  run: Runner,
  name: string,
  program: string,
  args: readonly string[],
  cwd: string,
  env?: EnvChanges,
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
 * The environment changes for `uv run --locked`. The lock file fixes where each package comes
 * from, so an index from the user's environment (for example a mirror) only makes the lock
 * check fail; both index variables are removed.
 */
export const LOCKED_UV_ENV: EnvChanges = {
  PYTHONDONTWRITEBYTECODE: '1',
  UV_DEFAULT_INDEX: undefined,
  UV_INDEX_URL: undefined,
}
/**
 * Regenerates the agent projections of a worktree from its own `.meta_harness/agents` source:
 * compile into a fresh stage directory, copy the stage over `.meta_harness/` by content,
 * relink the root entries, drop group write on the three Cursor runtime files, then run
 * `check:agents`. A failed step stops the run. The stage directory is removed in every case.
 * The copy runs `rsync` on a POSIX host that has it, and `copyProjections` everywhere else.
 * How pnpm starts is decided before the first step, so a host without pnpm changes nothing.
 */
export function regenerateProjections(
  tree: string,
  run: Runner = runProgram,
  host: Host = realHost(),
): void {
  const pnpm = pnpmCommand(host)
  const stage = localStep('create stage directory', () =>
    mkdtempSync(join(realpathSync(tmpdir()), 'omne-agents-stage-')),
  )
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
      LOCKED_UV_ENV,
    )
    if (hasRsync(host))
      step(run, 'copy projections', 'rsync', ['-rlpc', `${stage}/`, '.meta_harness/'], tree)
    else localStep('copy projections', () => copyProjections(stage, join(tree, '.meta_harness')))
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
      LOCKED_UV_ENV,
    )
    localStep('drop group write', () => {
      for (const name of CURSOR_RUNTIME) {
        const path = join(tree, '.meta_harness/.cursor', name)
        if (existsSync(path)) chmodSync(path, statSync(path).mode & ~0o020)
      }
    })
    pnpmStep(run, 'check:agents', ['run', 'check:agents'], tree, pnpm)
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
 * `error` as an `IntegrationError`. Another error becomes `unknown` with a message that names
 * the step `name`, the error type and its message.
 */
function failureOf(name: string, error: unknown): IntegrationError {
  if (error instanceof IntegrationError) return error
  const type = error instanceof Error ? error.name : typeof error
  const detail = error instanceof Error ? error.message : String(error)
  return new IntegrationError('unknown', `${name} failed (${type}): ${detail}`)
}
/** Runs the local step `name`; an error from the file system names the step. */
function localStep<T>(name: string, work: () => T): T {
  try {
    return work()
  } catch (error) {
    throw failureOf(name, error)
  }
}
/** What a `WorktreeStepError` reports besides the failure. */
type Progress = {
  /** The finished changes, in order. */
  done: readonly string[]
  /** The commands that finish the run from the failed step, in order. */
  resume: readonly string[]
  /** The task directory copy that the run restores, when there is one. */
  evidence: string | undefined
}
/**
 * A step of `prepare` or `swap` that failed after the run changed the disk. The code and
 * message are those of the failed step; `done`, `resume` and `evidence` are its `Progress`.
 */
export class WorktreeStepError extends IntegrationError {
  override name = 'WorktreeStepError'
  readonly done: string[]
  readonly resume: string[]
  readonly evidence: string | undefined
  constructor(failure: IntegrationError, progress: Progress) {
    super(failure.code, failure.message)
    this.done = [...progress.done]
    this.resume = [...progress.resume]
    this.evidence = progress.evidence
  }
}
/**
 * Runs the step `name`; a failure becomes a `WorktreeStepError` with `progress`. A
 * `WorktreeStepError` from inside `work` is kept as it is.
 */
function resumable<T>(name: string, progress: Progress, work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof WorktreeStepError) throw error
    throw new WorktreeStepError(failureOf(name, error), progress)
  }
}
/** The worktree command beside this module, as a resume command starts it. */
const WORKTREE_CLI = fileURLToPath(
  new URL(`./worktree-cli${extname(fileURLToPath(import.meta.url))}`, import.meta.url),
)
/** The `start` entry of a worktree, relative to it. */
const START_CLI = 'tools/dev-flow/src/integration/cli.ts'
const worktreeCommand = (args: string) => `node --experimental-strip-types ${WORKTREE_CLI} ${args}`
/** The `prepare` command line that repeats a run with these inputs. */
function prepareCommand(input: {
  root: string
  tree: string
  binding: TaskBinding
  remote: string
  evidence: string | undefined
}): string {
  const evidence = input.evidence === undefined ? '' : ` --evidence ${input.evidence}`
  return worktreeCommand(
    `prepare --issue ${input.binding.issue.number} --tree ${input.tree}${evidence} --root ${input.root} --remote ${input.remote}`,
  )
}

/**
 * Prepares a new worktree for a dispatched attempt and runs `start` in it. The branch,
 * dispatch, revision and attempt come from the card's binding. Steps: refuse an existing
 * directory; decide how pnpm starts, and refuse when it cannot; align the local branch with
 * the remote tip; add the worktree on it (tracking the remote branch when no local branch
 * exists); restore `evidence` into the task directory and write the start command there;
 * install with the frozen lock file; regenerate the agent projections; run the worktree's own
 * `start`. Nothing is removed on failure. A failure after the worktree exists is a
 * `WorktreeStepError` that names the finished steps and the commands that continue the run.
 */
export function prepareWorktree({
  root,
  tree,
  binding,
  remote = 'origin',
  evidence,
  run = runProgram,
  host = realHost(),
}: {
  root: string
  tree: string
  binding: TaskBinding
  remote?: string
  evidence?: string | undefined
  run?: Runner
  host?: Host
}): { tree: string; context: Record<string, unknown>; reports: string[] } {
  if (existsSync(tree)) throw new IntegrationError('refused', `${tree} already exists`)
  // Decide before anything changes: a host that cannot start pnpm gets no tree.
  const pnpm = pnpmCommand(host)
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
  const task = join(tree, taskDirectory(binding)),
    input = join(task, 'start.json')
  const done = [`added worktree ${tree} on ${branch}`]
  const commands = {
    install: `pnpm --dir ${tree} install --frozen-lockfile --ignore-scripts`,
    projections: worktreeCommand(`projections --tree ${tree}`),
    start: `node --experimental-strip-types ${join(tree, START_CLI)} execute --root ${tree} --input ${input}`,
  }
  const progress = (resume: readonly string[]): Progress => ({ done, resume, evidence })
  resumable(
    'restore evidence and write start.json',
    progress([
      worktreeCommand(`remove --tree ${tree} --root ${root} --force`),
      prepareCommand({ root, tree, binding, remote, evidence }),
    ]),
    () => {
      mkdirSync(task, { recursive: true })
      if (evidence !== undefined) cpSync(evidence, task, { recursive: true })
      // The copy may hold the start command of an earlier attempt; this one replaces it first.
      writeFileSync(input, `${JSON.stringify(startInput(binding), null, 2)}\n`)
    },
  )
  if (evidence !== undefined) done.push(`restored ${evidence} into ${task}`)
  done.push(`wrote ${input} for attempt ${binding.attempt}`)
  resumable('install', progress([commands.install, commands.projections, commands.start]), () =>
    pnpmStep(run, 'install', ['install', '--frozen-lockfile', '--ignore-scripts'], tree, pnpm),
  )
  done.push('installed dependencies')
  resumable('projections', progress([commands.projections, commands.start]), () =>
    regenerateProjections(tree, run, host),
  )
  done.push('regenerated agent projections')
  const result = run(
    'node',
    ['--experimental-strip-types', START_CLI, 'execute', '--root', tree, '--input', input],
    { cwd: tree },
  )
  const reports = result.stderr.split('\n').filter(line => line.trim() !== '')
  if (result.status !== 0)
    throw new WorktreeStepError(
      new IntegrationError('refused', `start failed in ${tree}: ${reports.join(' | ')}`),
      progress([commands.start]),
    )
  return { tree, context: record(json(result.stdout, 'start output'), 'context'), reports }
}

/** One path `git status --porcelain --ignored` reports beyond tracked changes. */
type UntrackedEntry = { path: string; ignored: boolean }
/**
 * The entries `git status --porcelain --ignored` reports beyond tracked changes: untracked
 * (`??`) and ignored (`!!`) paths, minus those under `keep`.
 */
function untrackedEntries(tree: string, keep: string | undefined, run: Runner): UntrackedEntry[] {
  return step(run, 'read untracked files', 'git', ['status', '--porcelain', '--ignored'], tree)
    .split('\n')
    .filter(line => line.startsWith('?? ') || line.startsWith('!! '))
    .map(line => ({ path: line.slice(3), ignored: line.startsWith('!! ') }))
    .filter(
      ({ path }) => keep === undefined || !(path === `${keep}/` || path.startsWith(`${keep}/`)),
    )
}

/**
 * The fixed list of ignored paths that a new tree makes again, so `swap` counts them instead of
 * naming each one. A path is in a category when its last segment is one of `names`, or when it
 * is one of `prefixes` or lies under one.
 */
export const REGENERABLE: readonly {
  category: string
  names?: readonly string[]
  prefixes?: readonly string[]
  remedy: string
}[] = [
  { category: 'node_modules', names: ['node_modules'], remedy: 'pnpm install makes them again' },
  { category: 'dist', names: ['dist'], remedy: 'a build makes them again' },
  { category: '.turbo', names: ['.turbo'], remedy: 'turbo makes its cache again' },
  { category: '.venv', names: ['.venv'], remedy: 'uv makes the environment again' },
  {
    category: 'Python caches',
    names: ['__pycache__', '.pytest_cache'],
    remedy: 'Python and pytest make them again',
  },
  {
    category: 'agent projections',
    prefixes: [
      '.meta_harness/.agents',
      '.meta_harness/.claude',
      '.meta_harness/.codex',
      '.meta_harness/.cursor',
    ],
    remedy: 'projections makes them again',
  },
]
/** The category of an ignored path in `REGENERABLE`, or undefined. */
function regenerableCategory(path: string): (typeof REGENERABLE)[number] | undefined {
  const bare = path.replace(/\/+$/, '')
  const last = bare.slice(bare.lastIndexOf('/') + 1)
  return REGENERABLE.find(
    entry =>
      entry.names?.includes(last) === true ||
      entry.prefixes?.some(prefix => bare === prefix || bare.startsWith(`${prefix}/`)) === true,
  )
}
/**
 * The `swap` warnings for the paths left in the old tree: each untracked path and each ignored
 * path outside `REGENERABLE` by name, then one count per regenerable category.
 */
export function swapWarnings(entries: readonly UntrackedEntry[]): string[] {
  const named: string[] = [],
    counts = new Map<(typeof REGENERABLE)[number], number>()
  for (const entry of entries) {
    const category = entry.ignored ? regenerableCategory(entry.path) : undefined
    if (category === undefined) named.push(entry.path)
    else counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return [
    ...named,
    ...REGENERABLE.flatMap(entry => {
      const count = counts.get(entry) ?? 0
      return count === 0
        ? []
        : [`${entry.category}: ${count} ignored paths, not copied; ${entry.remedy}`]
    }),
  ]
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
 * is on another branch, or has commits the remote branch lacks, and when pnpm cannot start; it
 * never pushes. Copies the task directory, without stage directories, aside, detaches the old
 * tree so the branch is free, then prepares the new tree from the remote branch tip with that
 * copy as evidence. The copy stays in the system temporary directory. Untracked and ignored
 * paths of the old tree outside its task directory are left in place and reported by
 * `swapWarnings`; `removeWorktree` deletes the old tree on request. A failure after the old
 * tree is detached is a `WorktreeStepError` whose `done` starts with the copy and the detach.
 */
export function swapWorktree({
  root,
  old,
  tree,
  binding,
  remote = 'origin',
  run = runProgram,
  host = realHost(),
}: {
  root: string
  old: string
  tree: string
  binding: TaskBinding
  remote?: string
  run?: Runner
  host?: Host
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
  // Decide before the old tree changes: a host that cannot start pnpm leaves it attached.
  pnpmCommand(host)
  // Real git reports an ignored directory as `!! tmp/`. The task directory under it is copied.
  const warnings = swapWarnings(
    untrackedEntries(old, taskDirectory(binding), run).filter(entry => entry.path !== 'tmp/'),
  )
  const source = join(old, taskDirectory(binding))
  const again = worktreeCommand(
    `swap --issue ${binding.issue.number} --old ${old} --tree ${tree} --root ${root} --remote ${remote}`,
  )
  const done: string[] = []
  let evidence: string | undefined
  if (existsSync(source)) {
    evidence = localStep('create the copy directory', () =>
      mkdtempSync(join(tmpdir(), `omne-swap-issue-${binding.issue.number}-`)),
    )
    const copy = evidence
    // The old tree is unchanged until the detach, so a failure here repeats the whole swap.
    resumable('copy task directory', { done, resume: [again], evidence }, () =>
      cpSync(source, copy, {
        recursive: true,
        // cpSync hands the filter native paths, so the last segment comes from path.basename.
        filter: path => !basename(path).startsWith('agents-stage'),
      }),
    )
    done.push(`copied ${source} to ${evidence}`)
  }
  resumable('detach old worktree', { done, resume: [again], evidence }, () =>
    step(run, 'detach old worktree', 'git', ['checkout', '--quiet', '--detach'], old),
  )
  done.push(`detached ${old}`)
  try {
    return {
      ...prepareWorktree({ root, tree, binding, remote, evidence, run, host }),
      evidence,
      warnings,
    }
  } catch (error) {
    // A failure after the new tree exists already carries its own steps and resume commands.
    if (error instanceof WorktreeStepError)
      throw new WorktreeStepError(error, {
        done: [...done, ...error.done],
        resume: error.resume,
        evidence,
      })
    // Before the new tree exists, prepare with the copy finishes the swap.
    throw new WorktreeStepError(failureOf('prepare', error), {
      done,
      resume: [prepareCommand({ root, tree, binding, remote, evidence })],
      evidence,
    })
  }
}

/** How many of the regular files left in a tree an incomplete removal names. */
const NAMED_FILES = 5
/** What a path holds, read with `lstat` only: no link is followed, so a link's target is never read. */
type Leftover = { links: string[]; directories: string[]; files: string[] }
function readLeftover(path: string): Leftover {
  const leftover: Leftover = { links: [], directories: [], files: [] }
  const visit = (entry: string): void => {
    const stats = lstatSync(entry, { throwIfNoEntry: false })
    if (stats === undefined) return
    if (stats.isSymbolicLink()) leftover.links.push(entry)
    else if (stats.isDirectory()) {
      for (const name of readdirSync(entry)) visit(join(entry, name))
      // Children are listed first, so the directories come out deepest first.
      leftover.directories.push(entry)
    } else leftover.files.push(entry)
  }
  visit(path)
  return leftover
}
/**
 * Deletes one link and never its target. `unlink` removes a symbolic link on every platform;
 * a Windows directory junction that `unlink` refuses is removed with `rmdir`, which deletes the
 * junction itself. `rmdir` runs only while the entry is still a link, and it never recurses.
 */
function unlinkOnly(link: string): void {
  try {
    unlinkSync(link)
  } catch (error) {
    if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink() !== true) throw error
    rmdirSync(link)
  }
}

/** The result of `removeWorktree`. */
export type WorktreeRemoval =
  | {
      tree: string
      untracked: string[]
      /** True only when the directory is gone from the disk. */
      removed: boolean
      /** Links and empty directories that `git worktree remove` left and this run deleted. */
      leftover?: { links: number; directories: number }
    }
  | {
      tree: string
      untracked: string[]
      removed: false
      /** Why the directory is still there after `git worktree remove`. */
      reason: string
      /** The first regular files left in the directory, relative to it. */
      files: string[]
    }

/**
 * Deletes what `git worktree remove` left of `tree`, when that is only links and empty
 * directories. On Windows, git removes the files of a tree but leaves the directory junctions
 * that pnpm creates, and still exits 0. The leftover is read with `lstat`; a regular file in it
 * stops the run before anything is deleted. Otherwise each link is deleted by itself, never by
 * recursion into it, then the directories are deleted deepest first with a plain `rmdir`.
 * Returns the counts deleted when `tree` is gone afterwards, and the reason when it is not.
 */
function removeLeftover(
  tree: string,
): { leftover: { links: number; directories: number } } | { reason: string; files: string[] } {
  const leftover = readLeftover(tree)
  const name = (path: string) => relative(tree, path).split(sep).join('/')
  if (leftover.files.length > 0)
    return {
      reason: `${tree} still holds ${leftover.files.length} regular files after git worktree remove; nothing more was deleted`,
      files: leftover.files.slice(0, NAMED_FILES).map(name),
    }
  try {
    for (const link of leftover.links) unlinkOnly(link)
    // A plain rmdir fails on a directory that is not empty, so a file that appears meanwhile stays.
    for (const directory of leftover.directories) rmdirSync(directory)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      reason: `cannot delete what git worktree remove left in ${tree}: ${detail}`,
      files: [],
    }
  }
  if (lstatSync(tree, { throwIfNoEntry: false }) !== undefined)
    return {
      reason: `${tree} still exists after its links and empty directories were deleted`,
      files: [],
    }
  return { leftover: { links: leftover.links.length, directories: leftover.directories.length } }
}

/**
 * Removes one worktree on request. Always refuses uncommitted tracked changes. Without
 * `force` it only lists the untracked and ignored paths that removal would delete; with
 * `force` it runs `git worktree remove --force` from `root`, then checks the disk. `removed`
 * is true only when the directory is gone: a leftover of links and empty directories is
 * deleted without following any link, and a leftover with a regular file is kept and reported
 * with `removed: false`, the reason and the first files.
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
}): WorktreeRemoval {
  if (trackedChanges(tree, run).length > 0)
    throw new IntegrationError('refused', `${tree} has uncommitted tracked changes`)
  const untracked = untrackedEntries(tree, undefined, run).map(entry => entry.path)
  if (!force) return { tree, untracked, removed: false }
  step(run, 'remove worktree', 'git', ['worktree', 'remove', '--force', tree], root)
  if (lstatSync(tree, { throwIfNoEntry: false }) === undefined)
    return { tree, untracked, removed: true }
  const result = removeLeftover(tree)
  return 'reason' in result
    ? { tree, untracked, removed: false, ...result }
    : { tree, untracked, removed: true, ...result }
}
