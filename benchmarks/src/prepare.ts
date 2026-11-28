import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Blocked } from '@omne-harness/perf-harness'
import { ran } from './driver/process.ts'

const BUILT = ['apps/harness-server/dist/lab/bin.js', 'apps/cli/dist/bin.js']
const MARK = '.perf-built'
const MEMBERS = ['@omne-harness/harness-server...', '@omne-harness/cli...']

const blocked = (reason: string): Blocked => ({ state: 'blocked', reason })

const built = (root: string): boolean => BUILT.every(file => existsSync(join(root, file)))

export const checkoutOf = (root: string, commit: string): string =>
  join(root, 'tmp', 'perf', 'checkouts', commit.slice(0, 12))

type Run = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<Readonly<{ status: number | null; stdout: string; stderr: string }>>

type Step = Readonly<{
  what: string
  command: string
  args: readonly string[]
  cwd: string
  hint?: string
}>

const run: Run = (command, args, cwd) => ran(command, args, { cwd, env: process.env })

export async function prepare(
  root: string,
  named: string,
  say: (line: string) => void,
  exec: Run = run,
): Promise<string | Blocked> {
  const resolved = await exec(
    'git',
    ['-C', root, 'rev-parse', '--verify', `${named}^{commit}`],
    root,
  )
  const commit = resolved.stdout.trim()
  if (resolved.status !== 0 || commit === '')
    return blocked(`${named} is not a commit of this repository`)
  const head = (await exec('git', ['-C', root, 'rev-parse', 'HEAD'], root)).stdout.trim()
  const dirty = (
    await exec('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], root)
  ).stdout.trim()
  if (commit === head && dirty === '')
    return built(root) ? root : blocked('this checkout is not built: run pnpm run build first')
  const directory = checkoutOf(root, commit)
  if (existsSync(join(directory, MARK)) && built(directory)) return directory
  const short = commit.slice(0, 12)
  const steps: readonly Step[] = [
    {
      what: `checking out ${short}`,
      command: 'git',
      args: ['-C', root, 'worktree', 'add', '--detach', directory, commit],
      cwd: root,
    },
    {
      what: `installing ${short}`,
      command: 'pnpm',
      args: ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
      cwd: directory,
    },
    {
      what: `building the native dependency of ${short}`,
      command: 'pnpm',
      args: ['run', 'prepare:native'],
      cwd: directory,
      hint: ' (a system compiler too old for it needs CC and CXX set: CONTRIBUTING.md)',
    },
    {
      what: `building ${short}`,
      command: 'pnpm',
      args: [
        '--workspace-concurrency=1',
        ...MEMBERS.flatMap(member => ['--filter', member]),
        '-r',
        'run',
        'build',
      ],
      cwd: directory,
    },
  ]
  mkdirSync(join(root, 'tmp', 'perf', 'checkouts'), { recursive: true })
  for (const step of existsSync(directory) ? steps.slice(1) : steps) {
    say(step.what)
    const done = await exec(step.command, step.args, step.cwd)
    if (done.status !== 0)
      return blocked(`${step.what} failed: ${done.stderr.trim().slice(-600)}${step.hint ?? ''}`)
  }
  if (!built(directory))
    return blocked(`${short} has no lab server to run: it is older than the suites`)
  writeFileSync(join(directory, MARK), `${commit}\n`)
  return directory
}
