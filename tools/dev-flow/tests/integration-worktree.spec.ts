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
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import {
  issueBinding,
  prepareWorktree,
  regenerateProjections,
  removeWorktree,
  copyProjections,
  pnpmCommand,
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
    const result = swapWorktree({
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
      swapWorktree({
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
      swapWorktree({
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
      swapWorktree({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
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
    // The copy stays in the temporary directory until the operator deletes it.
    const copy = /to (.*)$/.exec(done[0] ?? '')?.[1] ?? ''
    expect((failure as WorktreeStepError).evidence).toBe(copy)
    expect(readFileSync(join(copy, 'handoff.md'), 'utf8')).toBe('evidence')
    rmSync(copy, { recursive: true, force: true })
  })

  it('reports a prepare command with the copy when a step fails before the new tree exists', () => {
    const root = home(),
      oldTree = old(root),
      tree = join(root, 'new')
    const r = runner({ ...clean, 'git branch --force': { status: 1, stderr: 'locked ref' } })
    const failure = thrown(() =>
      swapWorktree({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
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
    rmSync(copy, { recursive: true, force: true })
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
      swapWorktree({ root, old: oldTree, tree, binding, run: r.run, host: linux }),
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
    rmSync(evidence ?? '', { recursive: true, force: true })
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
