import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  chmodSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import {
  issueBinding,
  prepareWorktree,
  regenerateProjections,
  removeWorktree,
  copyProjections,
  pnpmCommand,
  prepareClosures,
  formatClosures,
  startInput,
  swapWorktree,
  changedEnvironment,
  runProgram,
  swapWarnings,
  WorktreeStepError,
  type EnvChanges,
  type Host,
  type Runner,
} from '../src/integration/worktree.ts'

const homes: string[] = []
afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})
function home(): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'omne-worktree-')))
  homes.push(path)
  return path
}
/**
 * A host whose `PATH` is one fresh directory holding the given (empty) files. `linux` below has
 * an `rsync` there, so the copy step runs the `rsync` command the recorded steps expect.
 */
function hostWith(platform: NodeJS.Platform, files: string[] = []): Host {
  return hostOnPath(platform, [files])
}
/** A host whose `PATH` lists one fresh directory per entry of `directories`, in that order. */
function hostOnPath(platform: NodeJS.Platform, directories: string[][]): Host {
  const paths = directories.map(files => {
    const directory = home()
    for (const file of files) {
      mkdirSync(join(directory, file, '..'), { recursive: true })
      writeFileSync(join(directory, file), '')
    }
    return directory
  })
  return {
    platform,
    env: { PATH: paths.join(platform === 'win32' ? ';' : ':') },
    execPath: '/node',
  }
}
const linux = hostWith('linux', ['rsync'])
const url = 'https://github.com/owner/repo/issues/7'
const binding: TaskBindingV2 = {
  schemaVersion: 2,
  issue: { repository: 'owner/repo', id: 'I_7', number: 7, url },
  revision: 1,
  attempt: '7-r1-a2',
  responsible: 'human',
  branch: 'human/issue-7',
  route: { kind: 'track', track: 'legacy-refactor' },
  completionTarget: 'track',
  taskBase: 'a'.repeat(40),
  writeScope: ['tools'],
  dispatch: `${url}#issuecomment-9`,
  conditions: [],
  authorization: ['basis'],
  line: 'engineering-toolchain',
  nature: 'impl',
  contractChange: 'none',
  milestone: 'M1',
}
const local = 'refs/heads/human/issue-7',
  upstream = 'refs/remotes/origin/human/issue-7'
type Answer = { status: number; stdout?: string; stderr?: string }
/**
 * Records every step. `answers` gives the result of a step by its full argument list joined
 * with spaces, or by its first three words. `git worktree add` creates the directory like the
 * real command, and start prints a context.
 */
function runner(answers: Record<string, Answer> = {}) {
  const steps: { program: string; args: readonly string[]; cwd: string; env?: EnvChanges }[] = []
  const run: Runner = (program, args, { cwd, env }) => {
    steps.push(env === undefined ? { program, args, cwd } : { program, args, cwd, env })
    if (program === 'git' && args[0] === 'worktree' && args[1] === 'add')
      mkdirSync(args[3] ?? '', { recursive: true })
    const answer =
      answers[[program, ...args].join(' ')] ??
      answers[[program, ...args.slice(0, 2)].join(' ')] ??
      (program === 'node' ? { status: 0, stdout: '{"bound":true}' } : { status: 0 })
    return { status: answer.status, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' }
  }
  const names = () => steps.map(step => [step.program, ...step.args.slice(0, 2)].join(' '))
  const ran = (program: string, ...args: string[]) =>
    steps.some(step => step.program === program && args.every((arg, i) => step.args[i] === arg))
  return { run, steps, names, ran }
}
/** The error `work` throws; fails the test when it returns. */
function thrown(work: () => unknown): unknown {
  try {
    work()
  } catch (error) {
    return error
  }
  throw new Error('expected a failure')
}
/** Evidence copies `runSwap` reported in the running test; each is removed when the test ends. */
const evidenceCopies: string[] = []
afterEach(() => {
  for (const copy of evidenceCopies.splice(0)) rmSync(copy, { recursive: true, force: true })
})
/**
 * Runs `swapWorktree` and keeps the evidence copy it reports, whether it returns it or throws it
 * in a `WorktreeStepError`. A run that reports no evidence leaves nothing to remove.
 */
function runSwap(input: Parameters<typeof swapWorktree>[0]): ReturnType<typeof swapWorktree> {
  try {
    const result = swapWorktree(input)
    if (result.evidence !== undefined) evidenceCopies.push(result.evidence)
    return result
  } catch (error) {
    if (error instanceof WorktreeStepError && error.evidence !== undefined)
      evidenceCopies.push(error.evidence)
    throw error
  }
}
const ancestor = (older: string, newer: string, status: number): Record<string, Answer> => ({
  [`git merge-base --is-ancestor ${older} ${newer}`]: { status },
})
/** The local branch exists and is behind the remote tip. */
const behind = {
  ...ancestor(upstream, local, 1),
  ...ancestor(local, upstream, 0),
}

describe('worktree preparation', () => {
  it('derives the start command from the binding', () => {
    expect(startInput(binding)).toEqual({
      kind: 'start',
      authority: binding.dispatch,
      issue: url,
      revision: 1,
      attempt: '7-r1-a2',
    })
  })

  it('reads the binding from the card and refuses a card without one', () => {
    const body = `- 交付修订：1\n\`\`\`json omne-integration-binding:v2\n${JSON.stringify(binding)}\n\`\`\`\n`
    const answer =
      (text: string): GhCommand =>
      () => ({ number: 7, node_id: 'I_7', html_url: url, body: text, labels: [] })
    expect(issueBinding('owner/repo', 7, answer(body))).toEqual(binding)
    expect(() => issueBinding('owner/repo', 7, answer('no binding'))).toThrow('dispatch it first')
  })

  it('adds a tracking worktree, installs, regenerates projections, then runs its own start', () => {
    const root = home(),
      tree = join(root, 'tree'),
      r = runner({ [`git show-ref --quiet --verify ${local}`]: { status: 1 } })
    const result = prepareWorktree({ root, tree, binding, run: r.run, host: linux })
    expect(r.names()).toEqual([
      'git fetch --quiet',
      'git show-ref --quiet',
      'git worktree add',
      'pnpm install --frozen-lockfile',
      'uv run --locked',
      expect.stringMatching(/^rsync -rlpc /),
      'uv run --locked',
      'pnpm run check:agents',
      'node --experimental-strip-types tools/dev-flow/src/integration/cli.ts',
    ])
    expect(r.steps[2]?.args).toEqual([
      'worktree',
      'add',
      '--quiet',
      tree,
      '-b',
      binding.branch,
      '--track',
      `origin/${binding.branch}`,
    ])
    const input = JSON.parse(readFileSync(join(tree, 'tmp/issue-7/start.json'), 'utf8'))
    expect(input).toEqual(startInput(binding))
    expect(result).toMatchObject({ tree, context: { bound: true } })
  })

  it('moves a local branch that is behind forward to the remote tip before adding the tree', () => {
    const root = home(),
      evidence = join(root, 'evidence')
    mkdirSync(evidence)
    writeFileSync(join(evidence, 'report.md'), 'kept')
    const tree = join(root, 'tree'),
      r = runner(behind)
    prepareWorktree({ root, tree, binding, evidence, run: r.run, host: linux })
    expect(r.ran('git', 'branch', '--force', binding.branch, upstream)).toBe(true)
    expect(r.ran('git', 'worktree', 'add', '--quiet', tree, binding.branch)).toBe(true)
    expect(readFileSync(join(tree, 'tmp/issue-7/report.md'), 'utf8')).toBe('kept')
  })

  it.each([
    [
      'ahead of the remote',
      { ...ancestor(upstream, local, 0), ...ancestor(local, upstream, 1) },
      'push them first',
    ],
    [
      'diverged from the remote',
      { ...ancestor(upstream, local, 1), ...ancestor(local, upstream, 1) },
      'have diverged',
    ],
  ])('refuses a local branch %s and adds no tree', (_name, answers, message) => {
    const root = home(),
      r = runner(answers)
    expect(() =>
      prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run, host: linux }),
    ).toThrow(message)
    expect(r.ran('git', 'worktree', 'add')).toBe(false)
  })

  it('refuses an existing directory and stops at the first failed step', () => {
    const root = home()
    expect(() => prepareWorktree({ root, tree: root, binding, run: runner().run })).toThrow(
      'already exists',
    )
    const r = runner({ 'pnpm install --frozen-lockfile': { status: 1, stderr: 'lock mismatch' } })
    expect(() =>
      prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run, host: linux }),
    ).toThrow('install failed (exit 1): lock mismatch')
    expect(r.names().at(-1)).toBe('pnpm install --frozen-lockfile')
  })

  it('writes start.json before installing, and a failed install names what is done and how to continue', () => {
    const root = home(),
      evidence = join(root, 'evidence'),
      tree = join(root, 'tree')
    mkdirSync(evidence)
    // The evidence of an earlier attempt carries that attempt's start command.
    writeFileSync(join(evidence, 'start.json'), '{"attempt":"7-r1-a1"}')
    const r = runner({
      [`git show-ref --quiet --verify ${local}`]: { status: 1 },
      'pnpm install --frozen-lockfile': { status: 1, stderr: 'lock mismatch' },
    })
    const failure = thrown(() =>
      prepareWorktree({ root, tree, binding, evidence, run: r.run, host: linux }),
    )
    const input = join(tree, 'tmp/issue-7/start.json')
    expect(failure).toBeInstanceOf(WorktreeStepError)
    expect(failure).toMatchObject({
      code: 'unknown',
      message: 'install failed (exit 1): lock mismatch',
      done: [
        `added worktree ${tree} on ${binding.branch}`,
        `restored ${evidence} into ${join(tree, 'tmp/issue-7')}`,
        `wrote ${input} for attempt 7-r1-a2`,
      ],
      resume: [
        `pnpm --dir ${tree} install --frozen-lockfile --ignore-scripts`,
        expect.stringMatching(/worktree-cli\.ts projections --tree .*tree$/),
        expect.stringMatching(/cli\.ts execute --root .*tree --input .*start\.json$/),
      ],
    })
    expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual(startInput(binding))
  })

  it('reports a refused start with its report lines', () => {
    const root = home(),
      r = runner({
        'node --experimental-strip-types tools/dev-flow/src/integration/cli.ts': {
          status: 2,
          stderr: '{"code":"refused","message":"The card lacks a milestone"}',
        },
      })
    expect(() =>
      prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run, host: linux }),
    ).toThrow('The card lacks a milestone')
  })

  it('runs check:agents after copying and linking, and removes the stage either way', () => {
    const r = runner({ 'pnpm run check:agents': { status: 1, stderr: 'output differs' } })
    expect(() => regenerateProjections(home(), r.run, linux)).toThrow(
      'check:agents failed (exit 1): output differs',
    )
    expect(r.names().slice(0, 3)).toEqual([
      'uv run --locked',
      expect.stringMatching(/^rsync -rlpc /),
      'uv run --locked',
    ])
    const stage = r.steps[0]?.args.at(-1) ?? ''
    expect(stage).toMatch(/omne-agents-stage-/)
    expect(existsSync(stage)).toBe(false)
  })

  it('starts uv run --locked without the index variables of the caller', () => {
    const r = runner()
    regenerateProjections(home(), r.run, linux)
    // check:agents runs `uv run --locked` through its pnpm script.
    expect(r.steps.find(step => step.args.includes('check:agents'))?.env).toStrictEqual({
      UV_DEFAULT_INDEX: undefined,
      UV_INDEX_URL: undefined,
    })
    const uv = r.steps.filter(step => step.program === 'uv')
    expect(uv).toHaveLength(2)
    // toStrictEqual: a key set to undefined differs from a key that is missing.
    for (const step of uv)
      expect(step.env).toStrictEqual({
        PYTHONDONTWRITEBYTECODE: '1',
        UV_DEFAULT_INDEX: undefined,
        UV_INDEX_URL: undefined,
      })
  })

  it('removes a variable that a step sets to undefined, on Windows in any case', () => {
    const base = { UV_DEFAULT_INDEX: 'mirror', uv_index_url: 'mirror', KEEP: 'k' }
    const changes = { UV_DEFAULT_INDEX: undefined, UV_INDEX_URL: undefined, ADD: 'a' }
    expect(changedEnvironment(base, changes, 'win32')).toEqual({ KEEP: 'k', ADD: 'a' })
    expect(changedEnvironment(base, changes, 'linux')).toEqual({
      uv_index_url: 'mirror',
      KEEP: 'k',
      ADD: 'a',
    })
    // The real runner hands the changed environment to the child process. On Windows the second
    // variable is set in lower case, and the child still reads it as UV_INDEX_URL unless removed.
    vi.stubEnv('UV_DEFAULT_INDEX', 'https://mirror.example/simple')
    vi.stubEnv(
      process.platform === 'win32' ? 'uv_index_url' : 'UV_INDEX_URL',
      'https://mirror.example/simple',
    )
    try {
      const result = runProgram(
        process.execPath,
        [
          '-e',
          'console.log(JSON.stringify([process.env.UV_DEFAULT_INDEX ?? null, process.env.UV_INDEX_URL ?? null, process.env.ADD]))',
        ],
        { cwd: home(), env: changes },
      )
      expect(JSON.parse(result.stdout)).toEqual([null, null, 'a'])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('gives the compiler a physical staging path when the temporary directory is a symlink', () => {
    const root = home(),
      physical = join(root, 'physical'),
      alias = join(root, 'alias'),
      r = runner()
    mkdirSync(physical)
    symlinkSync(physical, alias, 'dir')
    for (const name of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(name, alias)
    try {
      regenerateProjections(
        root,
        (program, args, options) => {
          if (args.includes('.meta_harness/tooling/src/compile_agents.py')) {
            const stage = args.at(-1) ?? ''
            expect(stage).toBe(realpathSync(stage))
          }
          return r.run(program, args, options)
        },
        linux,
      )
      expect(existsSync(r.steps[0]?.args.at(-1) ?? '')).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('worktree preparation on a host without rsync or with Windows pnpm', () => {
  const windowsPnpm = () => hostWith('win32', ['pnpm.cmd', 'node_modules/pnpm/bin/pnpm.cjs'])
  const entry = (host: Host) => join(host.env['PATH'] ?? '', 'node_modules/pnpm/bin/pnpm.cjs')
  const noBranch = { [`git show-ref --quiet --verify ${local}`]: { status: 1 } }

  it('starts pnpm through the current Node on Windows and as pnpm elsewhere', () => {
    const host = windowsPnpm()
    expect(pnpmCommand(host)).toEqual({ program: '/node', args: [entry(host)] })
    expect(pnpmCommand(linux)).toEqual({ program: 'pnpm', args: [] })
  })

  describe('on a Windows PATH with pnpm.exe, the npm global layout, or both', () => {
    const NPM = ['pnpm.cmd', 'node_modules/pnpm/bin/pnpm.cjs']
    const directories = (host: Host) => (host.env['PATH'] ?? '').split(';')

    it('starts pnpm.exe itself when it is the only layout', () => {
      const host = hostWith('win32', ['pnpm.exe'])
      expect(pnpmCommand(host)).toEqual({
        program: join(directories(host)[0] ?? '', 'pnpm.exe'),
        args: [],
      })
    })

    it('takes the first directory in PATH order that can start pnpm', () => {
      const exeFirst = hostOnPath('win32', [['pnpm.exe'], NPM])
      expect(pnpmCommand(exeFirst).program).toBe(join(directories(exeFirst)[0] ?? '', 'pnpm.exe'))
      const npmFirst = hostOnPath('win32', [NPM, ['pnpm.exe']])
      expect(pnpmCommand(npmFirst)).toEqual({
        program: '/node',
        args: [join(directories(npmFirst)[0] ?? '', 'node_modules/pnpm/bin/pnpm.cjs')],
      })
      // A pnpm.cmd without pnpm.cjs beside it does not stop the search.
      const bareFirst = hostOnPath('win32', [['pnpm.cmd'], ['pnpm.exe']])
      expect(pnpmCommand(bareFirst).program).toBe(join(directories(bareFirst)[1] ?? '', 'pnpm.exe'))
    })
  })

  it('reports a Windows PATH where pnpm is missing or pnpm.cmd has no pnpm.cjs beside it', () => {
    expect(() => pnpmCommand(hostWith('win32'))).toThrow('Neither pnpm.exe nor pnpm.cmd is on PATH')
    expect(() => pnpmCommand(hostWith('win32', ['pnpm.cmd']))).toThrow('has no node_modules/pnpm')
  })

  it('runs install and check:agents with the pnpm.cjs entry on Windows', () => {
    const host = windowsPnpm(),
      root = home(),
      r = runner(noBranch)
    prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run, host })
    const pnpm = r.steps.filter(step => step.args[0] === entry(host))
    expect(pnpm.map(step => [step.program, ...step.args.slice(1)])).toEqual([
      ['/node', 'install', '--frozen-lockfile', '--ignore-scripts'],
      ['/node', 'run', 'check:agents'],
    ])
    expect(r.steps.some(step => step.program === 'pnpm')).toBe(false)
  })

  it('refuses before any step and adds no tree when pnpm cannot start', () => {
    const root = home(),
      tree = join(root, 'tree'),
      r = runner(noBranch)
    expect(() =>
      prepareWorktree({ root, tree, binding, run: r.run, host: hostWith('win32', ['pnpm.cmd']) }),
    ).toThrow('has no node_modules/pnpm')
    expect(r.steps).toEqual([])
    expect(existsSync(tree)).toBe(false)
  })

  it('copies the stage with Node when no rsync is usable, and never starts rsync', () => {
    const tree = home(),
      r = runner()
    mkdirSync(join(tree, '.meta_harness/.claude'), { recursive: true })
    writeFileSync(join(tree, '.meta_harness/.claude/old.md'), 'not in the stage')
    const run: Runner = (program, args, options) => {
      if (args.includes('.meta_harness/tooling/src/compile_agents.py')) {
        const stage = args.at(-1) ?? ''
        mkdirSync(join(stage, '.claude/agents'), { recursive: true })
        writeFileSync(join(stage, '.claude/agents/qa.md'), 'projected')
      }
      return r.run(program, args, options)
    }
    // A POSIX host whose PATH lacks rsync, and a Windows host whose PATH has one.
    const hosts = [
      hostWith('linux'),
      hostWith('win32', ['pnpm.cmd', 'rsync', 'node_modules/pnpm/bin/pnpm.cjs']),
    ]
    for (const host of hosts) {
      rmSync(join(tree, '.meta_harness/.claude/agents'), { recursive: true, force: true })
      regenerateProjections(tree, run, host)
      expect(readFileSync(join(tree, '.meta_harness/.claude/agents/qa.md'), 'utf8')).toBe(
        'projected',
      )
    }
    expect(r.steps.some(step => step.program === 'rsync')).toBe(false)
    expect(readFileSync(join(tree, '.meta_harness/.claude/old.md'), 'utf8')).toBe(
      'not in the stage',
    )
  })

  it('still uses rsync on a POSIX host that has it', () => {
    const r = runner()
    regenerateProjections(home(), r.run, linux)
    expect(r.steps.filter(step => step.program === 'rsync')).toHaveLength(1)
  })
})

describe('copyProjections', () => {
  function pair() {
    const base = home(),
      source = join(base, 'stage'),
      destination = join(base, '.meta_harness')
    mkdirSync(join(source, 'a/b'), { recursive: true })
    return { source, destination }
  }

  it('copies nested files, rewrites changed content, and deletes nothing', () => {
    const { source, destination } = pair()
    writeFileSync(join(source, 'a/b/new.md'), 'new')
    writeFileSync(join(source, 'a/same.md'), 'same')
    writeFileSync(join(source, 'a/changed.md'), 'after')
    mkdirSync(join(destination, 'a'), { recursive: true })
    writeFileSync(join(destination, 'a/changed.md'), 'before')
    writeFileSync(join(destination, 'a/extra.md'), 'kept')
    copyProjections(source, destination)
    const read = (path: string) => readFileSync(join(destination, path), 'utf8')
    expect([
      read('a/b/new.md'),
      read('a/same.md'),
      read('a/changed.md'),
      read('a/extra.md'),
    ]).toEqual(['new', 'same', 'after', 'kept'])
  })

  it('leaves a file with the same content untouched', () => {
    const { source, destination } = pair()
    writeFileSync(join(source, 'a/same.md'), 'same')
    mkdirSync(join(destination, 'a'), { recursive: true })
    const target = join(destination, 'a/same.md'),
      marker = new Date(2020, 0, 1)
    writeFileSync(target, 'same')
    utimesSync(target, marker, marker)
    copyProjections(source, destination)
    expect(statSync(target).mtimeMs).toBe(marker.getTime())
  })

  it('copies a symbolic link as a link and replaces a stale one', ctx => {
    const { source, destination } = pair()
    try {
      symlinkSync('target-new', join(source, 'a/link'))
    } catch {
      ctx.skip()
    }
    mkdirSync(join(destination, 'a'), { recursive: true })
    symlinkSync('target-old', join(destination, 'a/link'))
    copyProjections(source, destination)
    expect(lstatSync(join(destination, 'a/link')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(destination, 'a/link'))).toBe('target-new')
  })

  it.skipIf(process.platform === 'win32')('carries the source permission bits', () => {
    const { source, destination } = pair()
    writeFileSync(join(source, 'a/tool.sh'), 'x')
    chmodSync(join(source, 'a/tool.sh'), 0o750)
    mkdirSync(join(destination, 'a'), { recursive: true })
    writeFileSync(join(destination, 'a/tool.sh'), 'x')
    chmodSync(join(destination, 'a/tool.sh'), 0o600)
    copyProjections(source, destination)
    expect(statSync(join(destination, 'a/tool.sh')).mode & 0o777).toBe(0o750)
  })

  it('refuses a path that is a directory on one side only', () => {
    const { source, destination } = pair()
    writeFileSync(join(source, 'a/b.md'), 'file')
    mkdirSync(join(destination, 'a/b.md'), { recursive: true })
    expect(() => copyProjections(source, destination)).toThrow('is a directory')
  })
})

describe('worktree swap', () => {
  function old(root: string) {
    const path = join(root, 'old')
    mkdirSync(join(path, 'tmp/issue-7/agents-stage'), { recursive: true })
    writeFileSync(join(path, 'tmp/issue-7/handoff.md'), 'evidence')
    writeFileSync(join(path, 'tmp/issue-7/agents-stage/x'), 'stage')
    return path
  }
  const clean: Record<string, Answer> = {
    'git status --porcelain --untracked-files=no': { status: 0, stdout: '' },
    'git status --porcelain --ignored': {
      status: 0,
      stdout: '!! tmp/\n!! node_modules/\n?? notes.md\n!! dist/\n M ignored-by-filter\n',
    },
    'git branch --show-current': { status: 0, stdout: `${binding.branch}\n` },
    [`git merge-base --is-ancestor HEAD ${upstream}`]: { status: 0 },
    ...behind,
  }

  it('detaches the old tree, keeps it, and builds the new tree from the remote tip without pushing', () => {
    const root = home(),
      oldTree = old(root),
      r = runner(clean)
    const result = runSwap({
      root,
      old: oldTree,
      tree: join(root, 'new'),
      binding,
      run: r.run,
      host: linux,
    })
    expect(r.ran('git', 'checkout', '--quiet', '--detach')).toBe(true)
    expect(r.ran('git', 'branch', '--force', binding.branch, upstream)).toBe(true)
    expect(r.ran('git', 'worktree', 'remove')).toBe(false)
    expect(r.ran('git', 'push')).toBe(false)
    expect(existsSync(join(oldTree, 'tmp/issue-7/handoff.md'))).toBe(true)
    expect(readFileSync(join(root, 'new/tmp/issue-7/handoff.md'), 'utf8')).toBe('evidence')
    expect(existsSync(join(root, 'new/tmp/issue-7/agents-stage'))).toBe(false)
    expect(result.warnings).toEqual([
      'notes.md',
      'node_modules: 1 ignored paths, not copied; pnpm install makes them again',
      'dist: 1 ignored paths, not copied; a build makes them again',
    ])
    // The old tree is detached before the local branch moves.
    const detach = r.steps.findIndex(s => s.args[0] === 'checkout'),
      move = r.steps.findIndex(s => s.args[0] === 'branch' && s.args[1] === '--force')
    expect(detach).toBeLessThan(move)
  })

  it.each([
    [
      'uncommitted tracked changes',
      {
        ...clean,
        'git status --porcelain --untracked-files=no': { status: 0, stdout: ' M a.ts\n' },
      },
      'uncommitted tracked changes',
    ],
    [
      'another branch',
      { ...clean, 'git branch --show-current': { status: 0, stdout: 'human/other\n' } },
      'is on human/other',
    ],
    [
      'unpushed commits',
      { ...clean, [`git merge-base --is-ancestor HEAD ${upstream}`]: { status: 1 } },
      'push them first',
    ],
  ])('refuses %s and leaves the old tree attached', (_name, answers, message) => {
    const root = home(),
      r = runner(answers)
    expect(() =>
      runSwap({
        root,
        old: old(root),
        tree: join(root, 'new'),
        binding,
        run: r.run,
        host: linux,
      }),
    ).toThrow(message)
    expect(r.ran('git', 'checkout')).toBe(false)
    expect(r.ran('git', 'worktree')).toBe(false)
  })

  it('refuses a host that cannot start pnpm before the old tree changes', () => {
    const root = home(),
      r = runner(clean)
    expect(() =>
      runSwap({
        root,
        old: old(root),
        tree: join(root, 'new'),
        binding,
        run: r.run,
        host: hostWith('win32'),
      }),
    ).toThrow('Neither pnpm.exe nor pnpm.cmd is on PATH')
    expect(r.ran('git', 'checkout')).toBe(false)
    expect(existsSync(join(root, 'new'))).toBe(false)
  })

  it('rewrites start.json for the new attempt before a later step fails, and says how to continue', () => {
    const root = home(),
      oldTree = old(root),
      tree = join(root, 'new')
    writeFileSync(join(oldTree, 'tmp/issue-7/start.json'), '{"attempt":"7-r1-a1"}')
    const r = runner({ ...clean, 'uv run --locked': { status: 1, stderr: 'lock check failed' } })
    const failure = thrown(() =>
      runSwap({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
    )
    const input = join(tree, 'tmp/issue-7/start.json')
    expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual(startInput(binding))
    expect(failure).toBeInstanceOf(WorktreeStepError)
    const { done, resume } = failure as WorktreeStepError
    expect(done).toEqual([
      expect.stringMatching(/^copied .*issue-7 to .*omne-swap-issue-7-/),
      `detached ${oldTree}`,
      `added worktree ${tree} on ${binding.branch}`,
      expect.stringMatching(/^restored .*omne-swap-issue-7-/),
      `wrote ${input} for attempt 7-r1-a2`,
      'installed dependencies',
    ])
    expect(resume).toEqual([
      expect.stringMatching(/worktree-cli\.ts projections --tree .*new$/),
      expect.stringMatching(/cli\.ts execute --root .*new --input .*start\.json$/),
    ])
    // The copy stays in the temporary directory for the operator; this test's runSwap removes it.
    const copy = /to (.*)$/.exec(done[0] ?? '')?.[1] ?? ''
    expect((failure as WorktreeStepError).evidence).toBe(copy)
    expect(readFileSync(join(copy, 'handoff.md'), 'utf8')).toBe('evidence')
  })

  it('reports a prepare command with the copy when a step fails before the new tree exists', () => {
    const root = home(),
      oldTree = old(root),
      tree = join(root, 'new')
    const r = runner({ ...clean, 'git branch --force': { status: 1, stderr: 'locked ref' } })
    const failure = thrown(() =>
      runSwap({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
    )
    expect(failure).toBeInstanceOf(WorktreeStepError)
    const { done, resume, message, evidence } = failure as WorktreeStepError
    expect(message).toContain('move local branch forward failed')
    expect(done).toEqual([expect.stringMatching(/^copied /), `detached ${oldTree}`])
    const copy = /to (.*)$/.exec(done[0] ?? '')?.[1] ?? ''
    expect(evidence).toBe(copy)
    expect(resume).toEqual([
      expect.stringContaining(
        `prepare --issue 7 --tree ${tree} --evidence ${copy} --root ${root} --remote origin`,
      ),
    ])
    expect(existsSync(tree)).toBe(false)
  })
})

describe('a swap whose detach fails', () => {
  it('keeps the copy, names it, and repeats the swap to continue', () => {
    const root = home(),
      oldTree = join(root, 'old'),
      tree = join(root, 'new')
    mkdirSync(join(oldTree, 'tmp/issue-7'), { recursive: true })
    writeFileSync(join(oldTree, 'tmp/issue-7/handoff.md'), 'evidence')
    const r = runner({
      'git status --porcelain --untracked-files=no': { status: 0, stdout: '' },
      'git status --porcelain --ignored': { status: 0, stdout: '' },
      'git branch --show-current': { status: 0, stdout: `${binding.branch}\n` },
      [`git merge-base --is-ancestor HEAD ${upstream}`]: { status: 0 },
      'git checkout --quiet': { status: 1, stderr: 'index.lock exists' },
    })
    const failure = thrown(() =>
      runSwap({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
    )
    expect(failure).toBeInstanceOf(WorktreeStepError)
    const { done, resume, evidence } = failure as WorktreeStepError
    expect(done).toEqual([`copied ${join(oldTree, 'tmp/issue-7')} to ${evidence}`])
    expect(resume).toEqual([
      expect.stringContaining(
        `swap --issue 7 --old ${oldTree} --tree ${tree} --root ${root} --remote origin`,
      ),
    ])
    expect(readFileSync(join(evidence ?? '', 'handoff.md'), 'utf8')).toBe('evidence')
    expect(r.ran('git', 'worktree')).toBe(false)
  })
})

describe('worktree-cli errors outside the known kinds', () => {
  const cli = fileURLToPath(new URL('../src/integration/worktree-cli.ts', import.meta.url))
  /** Runs the CLI with a `PATH` of one empty directory, so `gh` cannot start. */
  function worktreeCli(args: string[]) {
    const env: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(process.env))
      if (key.toLowerCase() !== 'path') env[key] = value
    env['PATH'] = home()
    const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
      encoding: 'utf8',
      env,
    })
    return {
      status: result.status,
      error: JSON.parse(result.stderr.trim().split('\n').at(-1) ?? ''),
    }
  }

  it('names the phase, the error type and its message', { tags: ['slow'] }, () => {
    const root = home(),
      config = join(root, 'missing.json')
    const result = worktreeCli([
      'prepare',
      '--issue',
      '7',
      '--tree',
      join(root, 'tree'),
      '--root',
      root,
      '--config',
      config,
    ])
    expect(result.status).toBe(2)
    expect(result.error.message).toMatch(/^read the delivery config failed \(Error\): ENOENT/)
    expect(result.error.message).toContain('missing.json')
  })

  it('names the GitHub phase and the error type, and omits the output', { tags: ['slow'] }, () => {
    const root = home()
    const result = worktreeCli([
      'prepare',
      '--issue',
      '7',
      '--tree',
      join(root, 'tree'),
      '--root',
      root,
    ])
    expect(result.status).toBe(2)
    expect(result.error).toEqual({
      kind: 'worktree-error',
      code: 'input-error',
      message: 'read the binding of Issue #7 from GitHub failed (Error). API output omitted.',
    })
  })
})

describe('swap warnings', () => {
  it('counts the regenerable ignored paths by category and names every other path', () => {
    const entries = [
      ...['node_modules/', 'apps/a/node_modules/', 'tools/b/node_modules/'].map(path => ({
        path,
        ignored: true,
      })),
      { path: 'tools/b/dist/', ignored: true },
      { path: 'tools/b/.turbo/', ignored: true },
      { path: '.venv/', ignored: true },
      { path: 'tools/c/__pycache__/', ignored: true },
      { path: '.pytest_cache/', ignored: true },
      { path: '.meta_harness/.claude/', ignored: true },
      { path: '.meta_harness/.cursor/hooks.json', ignored: true },
      // Not on the list: an ignored file, a name that only starts like a listed one, and a
      // directory whose name is on the list but that git reports as untracked.
      { path: 'tools/c/generated/', ignored: true },
      { path: 'distribution/', ignored: true },
      { path: 'node_modules/', ignored: false },
      { path: 'notes.md', ignored: false },
    ]
    expect(swapWarnings(entries)).toEqual([
      'tools/c/generated/',
      'distribution/',
      'node_modules/',
      'notes.md',
      'node_modules: 3 ignored paths, not copied; pnpm install makes them again',
      'dist: 1 ignored paths, not copied; a build makes them again',
      '.turbo: 1 ignored paths, not copied; turbo makes its cache again',
      '.venv: 1 ignored paths, not copied; uv makes the environment again',
      'Python caches: 2 ignored paths, not copied; Python and pytest make them again',
      'agent projections: 2 ignored paths, not copied; projections makes them again',
    ])
    expect(swapWarnings([])).toEqual([])
  })
})

describe('worktree removal', () => {
  const listing: Record<string, Answer> = {
    'git status --porcelain --untracked-files=no': { status: 0, stdout: '' },
    'git status --porcelain --ignored': {
      status: 0,
      stdout: '?? tmp/issue-7/\n!! node_modules/\n',
    },
  }

  it('lists what removal would delete and removes only with force', () => {
    const r = runner(listing)
    expect(removeWorktree({ root: '/r', tree: '/t', force: false, run: r.run })).toEqual({
      tree: '/t',
      untracked: ['tmp/issue-7/', 'node_modules/'],
      removed: false,
    })
    expect(r.ran('git', 'worktree')).toBe(false)
  })

  it('reports removed when git worktree remove leaves no directory', () => {
    const tree = join(home(), 'tree'),
      r = runner(listing)
    expect(removeWorktree({ root: '/r', tree, force: true, run: r.run })).toEqual({
      tree,
      untracked: ['tmp/issue-7/', 'node_modules/'],
      removed: true,
    })
    expect(r.ran('git', 'worktree', 'remove', '--force', tree)).toBe(true)
  })

  it('refuses uncommitted tracked changes even with force', () => {
    const r = runner({
      ...listing,
      'git status --porcelain --untracked-files=no': { status: 0, stdout: ' M a.ts\n' },
    })
    expect(() => removeWorktree({ root: '/r', tree: '/t', force: true, run: r.run })).toThrow(
      'uncommitted tracked changes',
    )
    expect(r.ran('git', 'worktree')).toBe(false)
  })

  describe('when git worktree remove leaves the directory behind', () => {
    // Each base holds a tree and a store. The cleanup deletes the links by themselves before it
    // removes the base, so it never recurses into a link either.
    const bases: string[] = []
    afterAll(() => {
      for (const path of bases) {
        unlinkAll(path)
        rmSync(path, { recursive: true, force: true })
      }
    })
    function unlinkAll(path: string): void {
      const stats = lstatSync(path, { throwIfNoEntry: false })
      if (stats?.isSymbolicLink() === true)
        try {
          unlinkSync(path)
        } catch {
          rmdirSync(path)
        }
      else if (stats?.isDirectory() === true)
        for (const name of readdirSync(path)) unlinkAll(join(path, name))
    }
    function base(): string {
      const path = realpathSync(mkdtempSync(join(tmpdir(), 'omne-worktree-links-')))
      bases.push(path)
      return path
    }
    /**
     * Builds in `tree` what git leaves of a pnpm tree on Windows: directory junctions (symbolic
     * links on POSIX) and empty directories. The links point into a store beside the tree, at
     * another link, at a deleted directory, and at the base that holds both; a deletion that
     * follows any of them reaches the store.
     */
    function skeleton(at: string, tree: string) {
      const store = join(at, 'store'),
        inner = join(tree, 'node_modules/.pnpm/pkg@1/node_modules'),
        gone = join(at, 'gone')
      mkdirSync(join(store, 'pkg'), { recursive: true })
      writeFileSync(join(store, 'pkg/index.js'), 'store content')
      mkdirSync(inner, { recursive: true })
      mkdirSync(join(tree, 'tmp/issue-7'), { recursive: true })
      mkdirSync(gone)
      const links = [
        [join(store, 'pkg'), join(inner, 'pkg')],
        [join(inner, 'pkg'), join(tree, 'node_modules/pkg')],
        [gone, join(tree, 'node_modules/gone')],
        [at, join(tree, 'node_modules/up')],
      ] as const
      for (const [target, link] of links) symlinkSync(target, link, 'junction')
      rmdirSync(gone)
      return { store, links: links.map(([, link]) => link) }
    }
    const storeIntact = (store: string) =>
      expect(readFileSync(join(store, 'pkg/index.js'), 'utf8')).toBe('store content')

    it('deletes only the links and the empty directories, then reports removed', () => {
      const at = base(),
        tree = join(at, 'tree'),
        { store } = skeleton(at, tree)
      expect(removeWorktree({ root: '/r', tree, force: true, run: runner(listing).run })).toEqual({
        tree,
        untracked: ['tmp/issue-7/', 'node_modules/'],
        removed: true,
        leftover: { links: 4, directories: 7 },
      })
      expect(lstatSync(tree, { throwIfNoEntry: false })).toBeUndefined()
      storeIntact(store)
    })

    it('deletes nothing and names the first files when a regular file is left', () => {
      const at = base(),
        tree = join(at, 'tree'),
        { store, links } = skeleton(at, tree),
        names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      for (const name of names) writeFileSync(join(tree, `tmp/issue-7/${name}.md`), 'kept')
      const result = removeWorktree({ root: '/r', tree, force: true, run: runner(listing).run })
      expect(result).toEqual({
        tree,
        untracked: ['tmp/issue-7/', 'node_modules/'],
        removed: false,
        reason: expect.stringContaining('7 regular files'),
        files: names.slice(0, 5).map(name => `tmp/issue-7/${name}.md`),
      })
      for (const link of links) expect(lstatSync(link).isSymbolicLink()).toBe(true)
      for (const name of names)
        expect(readFileSync(join(tree, `tmp/issue-7/${name}.md`), 'utf8')).toBe('kept')
      storeIntact(store)
    })

    // Slow: runs real git and the CLI as child processes.
    it(
      'removes a real worktree through the CLI and keeps every link target',
      {
        tags: ['slow'],
      },
      () => {
        const at = base(),
          repository = join(at, 'repository'),
          tree = join(at, 'tree')
        const git = (...args: string[]) => {
          const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' })
          expect(result.status, result.stderr).toBe(0)
          return result.stdout
        }
        mkdirSync(repository)
        git('init', '--quiet')
        writeFileSync(join(repository, 'a.txt'), 'a')
        git('add', 'a.txt')
        git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'a')
        git('worktree', 'add', '--quiet', '--detach', tree)
        const { store } = skeleton(at, tree)
        writeFileSync(join(tree, 'tmp/issue-7/notes.md'), 'an ignored or untracked file')
        const cli = fileURLToPath(new URL('../src/integration/worktree-cli.ts', import.meta.url))
        const result = spawnSync(
          process.execPath,
          ['--experimental-strip-types', cli, 'remove', '--tree', tree, '--root', repository],
          { cwd: repository, encoding: 'utf8' },
        )
        expect(result.status, result.stderr).toBe(1)
        const forced = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            cli,
            'remove',
            '--tree',
            tree,
            '--root',
            repository,
            '--force',
          ],
          { cwd: repository, encoding: 'utf8' },
        )
        expect(forced.status, forced.stderr).toBe(0)
        expect(JSON.parse(forced.stdout)).toMatchObject({ tree, removed: true })
        expect(lstatSync(tree, { throwIfNoEntry: false })).toBeUndefined()
        expect(git('worktree', 'list', '--porcelain')).not.toContain('/tree\n')
        storeIntact(store)
        expect(lstatSync(repository).isDirectory()).toBe(true)
      },
    )
  })
})

describe('prepare-closures', () => {
  const BASE = 'b'.repeat(40)
  type Forced = (program: string, args: readonly string[], cwd: string) => Answer | undefined
  type Recorded = { program: string; args: readonly string[]; cwd: string }
  /**
   * Stands in for git and the build programs. It keeps the branches and registered worktrees a
   * run creates, so a second run sees them. `git worktree add` makes the directory like git.
   */
  function closureFake(root: string, fail?: Forced) {
    const branches = new Map<string, string>(),
      trees = new Map<string, string>(),
      refs = new Map([
        [BASE, BASE],
        ['main', BASE],
      ]),
      agents = { tree: 'c'.repeat(40), status: '' },
      steps: Recorded[] = []
    const answer = (stdout = '', status = 0) => ({ status, stdout, stderr: '' })
    const run: Runner = (program, args, { cwd }) => {
      steps.push({ program, args, cwd })
      const forced = fail?.(program, args, cwd)
      if (forced !== undefined)
        return { status: forced.status, stdout: forced.stdout ?? '', stderr: forced.stderr ?? '' }
      if (program !== 'git') return answer()
      const line = args.join(' '),
        last = args.at(-1) ?? ''
      const branch = last.startsWith('refs/heads/') ? last.slice('refs/heads/'.length) : ''
      if (args[0] === 'rev-parse' && last.endsWith('^{commit}')) {
        const sha = refs.get(last.slice(0, -'^{commit}'.length))
        return sha === undefined ? answer('', 1) : answer(`${sha}\n`)
      }
      if (args[0] === 'show-ref') return answer('', branches.has(branch) ? 0 : 1)
      if (args[0] === 'rev-parse' && branch !== '') return answer(`${branches.get(branch)}\n`)
      if (line === 'worktree list --porcelain') {
        const entries = [[root, 'main'], ...trees].map(
          ([path, name]) =>
            `worktree ${(path ?? '').replaceAll('\\', '/')}\nHEAD ${BASE}\nbranch refs/heads/${name}\n`,
        )
        return answer(`${entries.join('\n')}\n`)
      }
      if (args[0] === 'worktree' && args[1] === 'add') {
        const [name, tree, from] =
          args[2] === '-b'
            ? [args[3] ?? '', args[4] ?? '', args[5] ?? '']
            : [args[3] ?? '', args[2] ?? '', branches.get(args[3] ?? '') ?? '']
        mkdirSync(tree, { recursive: true })
        branches.set(name, from)
        trees.set(tree, name)
        return answer()
      }
      if (line === 'rev-parse HEAD:.meta_harness/agents') return answer(`${agents.tree}\n`)
      if (line === 'status --porcelain -- .meta_harness/agents') return answer(agents.status)
      return answer()
    }
    const ran = (program: string, ...args: string[]) =>
      steps.filter(step => step.program === program && args.every((arg, i) => step.args[i] === arg))
    return { run, steps, ran, branches, trees, agents }
  }
  type Fake = ReturnType<typeof closureFake>
  const closures = (...names: string[]) => names.map(name => ({ name, branch: `c/${name}` }))
  const treeOf = (root: string, name: string) => join(root, '.worktrees', name)
  const input = (root: string, fake: Fake, rest: Record<string, unknown> = {}) => ({
    root,
    base: BASE,
    closures: closures('t1', 't2'),
    run: fake.run,
    host: linux,
    ...rest,
  })
  const readyOf = (root: string, name: string) =>
    JSON.parse(readFileSync(join(treeOf(root, name), 'tmp/closures', name, 'ready.json'), 'utf8'))
  const has = (steps: readonly Recorded[], text: string, cwd?: string) =>
    steps.some(s => s.args.join(' ') === text && (cwd === undefined || s.cwd === cwd))
  const INSTALL = 'install --frozen-lockfile --ignore-scripts',
    CHECK = 'run check:agents'
  /** The steps that install, project or build: everything a skipped closure does not run. */
  const work = (steps: readonly Recorded[]) =>
    steps.filter(s => s.program === 'uv' || s.program === 'rsync' || s.program === 'pnpm')

  it('P1 adds each closure tree on a new branch from the base, without upstream, and installs and projects', () => {
    const root = home(),
      fake = closureFake(root)
    const result = prepareClosures(input(root, fake))
    expect(result.ok).toBe(true)
    expect(result.closures.map(c => [c.name, c.status])).toEqual([
      ['t1', 'created'],
      ['t2', 'created'],
    ])
    for (const name of ['t1', 't2']) {
      const tree = treeOf(root, name)
      expect(fake.ran('git', 'worktree', 'add', '-b', `c/${name}`, tree, BASE)).toHaveLength(1)
      expect(has(fake.steps, INSTALL, tree)).toBe(true)
      expect(has(fake.steps, CHECK, tree)).toBe(true)
      expect(readyOf(root, name)).toMatchObject({
        base: BASE,
        branch: `c/${name}`,
        steps: [
          { name: 'install', ok: true },
          { name: 'projections', ok: true },
        ],
      })
      expect(typeof readyOf(root, name).completedAt).toBe('string')
    }
    const text = fake.steps.map(s => [s.program, ...s.args].join(' ')).join('\n')
    expect(text).not.toMatch(/--track|upstream/)
  })

  it('resolves the base to a 40-digit commit', () => {
    const root = home(),
      fake = closureFake(root)
    expect(prepareClosures(input(root, fake, { base: 'main' })).base).toBe(BASE)
    expect(fake.ran('git', 'worktree', 'add', '-b', 'c/t1', treeOf(root, 't1'), BASE)).toHaveLength(
      1,
    )
  })

  it('P2 refuses a closure whose branch exists on another commit while its directory is missing', () => {
    const root = home(),
      fake = closureFake(root)
    fake.branches.set('c/t1', 'd'.repeat(40))
    const result = prepareClosures(input(root, fake))
    expect(result.ok).toBe(false)
    expect(result.closures[0]).toMatchObject({ name: 't1', status: 'refused' })
    expect(result.closures[0]?.message).toContain('c/t1')
    expect(existsSync(treeOf(root, 't1'))).toBe(false)
    expect(fake.branches.get('c/t1')).toBe('d'.repeat(40))
    // The other closure does not depend on the refused one.
    expect(result.closures[1]).toMatchObject({ name: 't2', status: 'created' })
  })

  it('uses an existing branch that is at the base when the directory is missing', () => {
    const root = home(),
      fake = closureFake(root)
    fake.branches.set('c/t1', BASE)
    const result = prepareClosures(input(root, fake, { closures: closures('t1') }))
    expect(result.closures[0]?.status).toBe('created')
    expect(fake.ran('git', 'worktree', 'add', treeOf(root, 't1'), 'c/t1')).toHaveLength(1)
    expect(fake.ran('git', 'worktree', 'add', '-b')).toHaveLength(0)
  })

  it('refuses a directory that is not a registered worktree on the closure branch', () => {
    const root = home(),
      fake = closureFake(root)
    mkdirSync(treeOf(root, 't1'), { recursive: true })
    fake.trees.set(treeOf(root, 't2'), 'other/branch')
    mkdirSync(treeOf(root, 't2'), { recursive: true })
    const result = prepareClosures(input(root, fake))
    expect(result.closures.map(c => c.status)).toEqual(['refused', 'refused'])
    expect(work(fake.steps)).toEqual([])
  })

  it('P3 skips install, projections and build when the key is unchanged', () => {
    const root = home(),
      fake = closureFake(root),
      builds = ['tools/x']
    prepareClosures(input(root, fake, { builds }))
    const before = fake.steps.length
    const again = prepareClosures(input(root, fake, { builds }))
    expect(again.ok).toBe(true)
    expect(again.closures.map(c => c.status)).toEqual(['skipped', 'skipped'])
    expect(work(fake.steps.slice(before))).toEqual([])
    expect(fake.ran('git', 'worktree', 'add')).toHaveLength(2)
  })

  it('P4 redoes install and projections, without a new tree, when pnpm-lock.yaml changes', () => {
    const root = home(),
      fake = closureFake(root),
      one = input(root, fake, { closures: closures('t1') })
    prepareClosures(one)
    writeFileSync(join(treeOf(root, 't1'), 'pnpm-lock.yaml'), 'lock: one\n')
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
    expect(prepareClosures(one).closures[0]?.status).toBe('skipped')
    writeFileSync(join(treeOf(root, 't1'), 'pnpm-lock.yaml'), 'lock: two\n')
    const before = fake.steps.length
    const result = prepareClosures(one)
    const added = fake.steps.slice(before)
    expect(result.closures[0]).toMatchObject({ status: 'reused' })
    expect(has(added, INSTALL)).toBe(true)
    expect(has(added, CHECK)).toBe(true)
    expect(added.some(s => s.args[0] === 'worktree' && s.args[1] === 'add')).toBe(false)
    expect(fake.ran('git', 'worktree', 'add')).toHaveLength(1)
  })

  it('P5 projects again when .meta_harness/agents has uncommitted changes or another tree', () => {
    const root = home(),
      fake = closureFake(root),
      one = input(root, fake, { closures: closures('t1') })
    prepareClosures(one)
    fake.agents.status = ' M .meta_harness/agents/skills/x/SKILL.md\n'
    let before = fake.steps.length
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
    expect(has(fake.steps.slice(before), CHECK)).toBe(true)
    fake.agents.status = ''
    fake.agents.tree = 'e'.repeat(40)
    before = fake.steps.length
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
    expect(has(fake.steps.slice(before), CHECK)).toBe(true)
  })

  it('P6 stops at the closure whose install fails, keeps the trees, and gives the same command to resume', () => {
    const root = home()
    const failing = treeOf(root, 't2')
    const fake = closureFake(root, (program, args, cwd) =>
      program === 'pnpm' && args[0] === 'install' && cwd === failing
        ? { status: 1, stderr: 'lock mismatch' }
        : undefined,
    )
    const result = prepareClosures(
      input(root, fake, { closures: closures('t1', 't2', 't3'), builds: ['tools/x'] }),
    )
    expect(result.ok).toBe(false)
    expect(result.closures.map(c => [c.name, c.status])).toEqual([
      ['t1', 'created'],
      ['t2', 'failed'],
    ])
    expect(result.closures[1]?.message).toContain('install failed (exit 1): lock mismatch')
    expect(result.closures[1]?.steps).toMatchObject([{ name: 'install', ok: false }])
    expect(existsSync(join(treeOf(root, 't1'), 'tmp/closures/t1/ready.json'))).toBe(true)
    expect(existsSync(join(failing, 'tmp/closures/t2/ready.json'))).toBe(false)
    expect(existsSync(failing)).toBe(true)
    expect(existsSync(treeOf(root, 't3'))).toBe(false)
    expect(fake.ran('git', 'worktree', 'remove')).toHaveLength(0)
    expect(result.resume).toContain('prepare-closures')
    expect(result.resume).toContain(`--base ${BASE}`)
    for (const name of ['t1', 't2', 't3'])
      expect(result.resume).toContain(`--closure ${name}:c/${name}`)
    expect(result.resume).toContain('--build tools/x')
    expect(result.resume).toContain(`--root ${root}`)
  })

  it('removes a ready.json that no longer matches when the redo fails', () => {
    const root = home()
    let broken = false
    const fake = closureFake(root, (program, args) =>
      broken && program === 'pnpm' && args[0] === 'install' ? { status: 1 } : undefined,
    )
    const one = input(root, fake, { closures: closures('t1') })
    prepareClosures(one)
    fake.agents.tree = 'e'.repeat(40)
    broken = true
    expect(prepareClosures(one).closures[0]?.status).toBe('failed')
    expect(existsSync(join(treeOf(root, 't1'), 'tmp/closures/t1/ready.json'))).toBe(false)
    // With the old key back and the failure gone, the missing record means the steps run again.
    fake.agents.tree = 'c'.repeat(40)
    broken = false
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
  })

  it('does not take a record with a failed step, or one for another branch, as ready', () => {
    const root = home(),
      fake = closureFake(root),
      one = input(root, fake, { closures: closures('t1') })
    prepareClosures(one)
    const file = join(treeOf(root, 't1'), 'tmp/closures/t1/ready.json')
    const record = readyOf(root, 't1')
    writeFileSync(
      file,
      JSON.stringify({ ...record, steps: [{ name: 'install', ok: false, ms: 1 }] }),
    )
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
    writeFileSync(file, JSON.stringify({ ...readyOf(root, 't1'), branch: 'c/other' }))
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
    writeFileSync(file, '{ not json')
    expect(prepareClosures(one).closures[0]?.status).toBe('reused')
  })

  it('P7 runs one turbo build per --build filter, in order, in each tree', () => {
    const root = home(),
      fake = closureFake(root)
    prepareClosures(input(root, fake, { closures: closures('t1'), builds: ['tools/x', 'tools/y'] }))
    const builds = fake.steps.filter(s => s.args[0] === 'turbo')
    expect(builds.map(s => [s.program, ...s.args])).toEqual([
      ['pnpm', 'turbo', 'run', 'build', '--filter=tools/x'],
      ['pnpm', 'turbo', 'run', 'build', '--filter=tools/y'],
    ])
    expect(builds.every(s => s.cwd === treeOf(root, 't1'))).toBe(true)
    expect(readyOf(root, 't1').steps.map((s: { name: string }) => s.name)).toEqual([
      'install',
      'projections',
      'build tools/x',
      'build tools/y',
    ])
  })

  it('P8 refuses with an exit-2 error before any change when pnpm cannot start or the base is no commit', () => {
    const root = home(),
      fake = closureFake(root)
    const noPnpm = hostWith('win32', ['pnpm.cmd'])
    expect(() => prepareClosures(input(root, fake, { host: noPnpm }))).toThrow(
      'has no node_modules/pnpm',
    )
    expect(fake.ran('git', 'worktree', 'add')).toHaveLength(0)
    expect(existsSync(join(root, '.worktrees'))).toBe(false)
    expect(() => prepareClosures(input(root, fake, { base: 'f'.repeat(40) }))).toThrow(
      'resolve base failed',
    )
    expect(fake.ran('git', 'worktree', 'add')).toHaveLength(0)
  })

  it('refuses duplicate or unusable closures before any change', () => {
    const root = home(),
      fake = closureFake(root)
    for (const bad of [
      [],
      [...closures('t1'), ...closures('t1')],
      [
        { name: 't1', branch: 'c/a' },
        { name: 't2', branch: 'c/a' },
      ],
      [{ name: '../x', branch: 'c/x' }],
      [{ name: 't1', branch: '' }],
    ])
      expect(() => prepareClosures(input(root, fake, { closures: bad }))).toThrow()
    expect(fake.steps).toEqual([])
  })

  it('P9 never runs start and never pushes', () => {
    const root = home(),
      fake = closureFake(root)
    prepareClosures(input(root, fake, { builds: ['tools/x'] }))
    prepareClosures(input(root, fake, { builds: ['tools/x'] }))
    const lines = fake.steps.map(s => [s.program, ...s.args].join(' '))
    expect(lines.filter(line => /cli\.ts|execute|\bpush\b/.test(line))).toEqual([])
    expect(fake.steps.some(s => s.program === 'node')).toBe(false)
  })

  it('P10 starts pnpm as pnpmCommand says on a Windows host', () => {
    const host = hostWith('win32', ['pnpm.cmd', 'node_modules/pnpm/bin/pnpm.cjs']),
      root = home(),
      fake = closureFake(root)
    const entry = join(host.env['PATH'] ?? '', 'node_modules/pnpm/bin/pnpm.cjs')
    prepareClosures(input(root, fake, { host, closures: closures('t1'), builds: ['tools/x'] }))
    const pnpm = fake.steps.filter(s => s.args[0] === entry)
    expect(pnpm.map(s => [s.program, ...s.args.slice(1)])).toEqual([
      ['/node', 'install', '--frozen-lockfile', '--ignore-scripts'],
      ['/node', 'run', 'check:agents'],
      ['/node', 'turbo', 'run', 'build', '--filter=tools/x'],
    ])
    expect(fake.steps.some(s => s.program === 'pnpm')).toBe(false)
  })

  it('formats one line per closure and the resume command', () => {
    const root = home(),
      fake = closureFake(root, (program, args) =>
        program === 'pnpm' && args[0] === 'install' ? { status: 1, stderr: 'boom' } : undefined,
      )
    const text = formatClosures(prepareClosures(input(root, fake, { closures: closures('t1') })))
    expect(text).toContain(`t1\tfailed\t${treeOf(root, 't1')}\tc/t1`)
    expect(text).toContain('install failed (exit 1): boom')
    expect(text).toContain('resume: ')
  })
})

describe('prepare-closures with real git', () => {
  it('builds trees from the base without an upstream, skips an unchanged rerun and redoes a changed one', () => {
    const root = home()
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
      if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
      return result.stdout.trim()
    }
    git(root, 'init', '--quiet', '-b', 'main')
    mkdirSync(join(root, '.meta_harness/agents'), { recursive: true })
    writeFileSync(join(root, '.meta_harness/agents/x.md'), 'x\n')
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lock\n')
    git(root, 'add', '.')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '--quiet', '-m', 'b')
    const base = git(root, 'rev-parse', 'HEAD')
    // Git runs for real; the programs that install and build are recorded.
    const programs: string[] = []
    const run: Runner = (program, args, options) => {
      if (program === 'git') return runProgram(program, args, options)
      programs.push([program, ...args].join(' '))
      return { status: 0, stdout: '', stderr: '' }
    }
    const request = {
      root,
      base,
      closures: [
        { name: 't1', branch: 'c/t1' },
        { name: 't2', branch: 'c/t2' },
      ],
      run,
      host: linux,
    }
    const first = prepareClosures(request)
    expect(first.closures.map(c => c.status)).toEqual(['created', 'created'])
    for (const name of ['t1', 't2']) {
      const tree = join(root, '.worktrees', name)
      expect(git(tree, 'rev-parse', 'HEAD')).toBe(base)
      expect(git(tree, 'branch', '--show-current')).toBe(`c/${name}`)
      const upstream = spawnSync('git', ['rev-parse', '--abbrev-ref', `c/${name}@{upstream}`], {
        cwd: root,
      })
      expect(upstream.status).not.toBe(0)
      expect(existsSync(join(tree, 'tmp/closures', name, 'ready.json'))).toBe(true)
    }
    const count = programs.length
    expect(prepareClosures(request).closures.map(c => c.status)).toEqual(['skipped', 'skipped'])
    expect(programs).toHaveLength(count)
    writeFileSync(join(root, '.worktrees/t1/.meta_harness/agents/x.md'), 'changed\n')
    expect(prepareClosures(request).closures.map(c => c.status)).toEqual(['reused', 'skipped'])
  })
})

describe('worktree-cli prepare-closures', () => {
  const cli = fileURLToPath(new URL('../src/integration/worktree-cli.ts', import.meta.url))
  const closuresCli = (args: string[]) => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
      encoding: 'utf8',
    })
    return {
      status: result.status,
      error: JSON.parse(result.stderr.trim().split('\n').at(-1) ?? 'null'),
    }
  }
  it(
    'accepts repeated --closure and --build, and reports a base that is no commit with exit 2',
    { tags: ['slow'] },
    () => {
      const root = home()
      spawnSync('git', ['init', '--quiet'], { cwd: root })
      const result = closuresCli([
        'prepare-closures',
        '--base',
        'no-such-ref',
        '--closure',
        't1:c/t1',
        '--closure',
        't2:c/t2',
        '--build',
        'tools/x',
        '--build',
        'tools/y',
        '--root',
        root,
      ])
      expect(result.status).toBe(2)
      expect(result.error.message).toContain('resolve base failed')
    },
  )
  it(
    'exits 1 and reports the closure when one is refused, as lines or as JSON',
    { tags: ['slow'] },
    () => {
      const root = home()
      const git = (...args: string[]) =>
        spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
          cwd: root,
          encoding: 'utf8',
        })
      git('init', '--quiet', '-b', 'main')
      git('commit', '--quiet', '--allow-empty', '-m', 'one')
      git('branch', 'c/t1')
      git('commit', '--quiet', '--allow-empty', '-m', 'two')
      const args = ['prepare-closures', '--base', 'main', '--closure', 't1:c/t1', '--root', root]
      const run = (extra: string[]) =>
        spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args, ...extra], {
          encoding: 'utf8',
        })
      const lines = run([])
      expect(lines.status, lines.stderr).toBe(1)
      expect(lines.stdout).toContain('t1	refused	')
      const json = run(['--json'])
      expect(json.status, json.stderr).toBe(1)
      expect(JSON.parse(json.stdout)).toMatchObject({
        ok: false,
        closures: [{ name: 't1', status: 'refused', branch: 'c/t1' }],
      })
    },
  )
  it(
    'refuses a closure without name and branch, and unknown options, with exit 2',
    { tags: ['slow'] },
    () => {
      const root = home()
      for (const args of [
        ['--base', 'main', '--closure', 'nocolon', '--root', root],
        ['--closure', 't1:c/t1', '--root', root],
        ['--base', 'main', '--closure', 't1:c/t1', '--bogus', 'x'],
      ]) {
        const result = closuresCli(['prepare-closures', ...args])
        expect(result.status).toBe(2)
        expect(result.error.kind).toBe('worktree-error')
      }
    },
  )
})
