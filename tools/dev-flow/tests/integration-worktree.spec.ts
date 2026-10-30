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
  readlinkSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  const directory = home()
  for (const file of files) {
    mkdirSync(join(directory, file, '..'), { recursive: true })
    writeFileSync(join(directory, file), '')
  }
  return { platform, env: { PATH: directory }, execPath: '/node' }
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
  const steps: { program: string; args: readonly string[]; cwd: string }[] = []
  const run: Runner = (program, args, { cwd }) => {
    steps.push({ program, args, cwd })
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

  it('reports a Windows PATH where pnpm.cmd is missing or has no pnpm.cjs beside it', () => {
    expect(() => pnpmCommand(hostWith('win32'))).toThrow('pnpm.cmd is not on PATH')
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

  it('stops a Windows run before installing when pnpm cannot be found', () => {
    const root = home(),
      r = runner(noBranch)
    expect(() =>
      prepareWorktree({
        root,
        tree: join(root, 'tree'),
        binding,
        run: r.run,
        host: hostWith('win32'),
      }),
    ).toThrow('pnpm.cmd is not on PATH')
    expect(r.names().at(-1)).toBe('git worktree add')
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
    expect(result.warnings).toEqual(['notes.md', 'dist/'])
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
    const forced = runner(listing)
    expect(removeWorktree({ root: '/r', tree: '/t', force: true, run: forced.run }).removed).toBe(
      true,
    )
    expect(forced.ran('git', 'worktree', 'remove', '--force', '/t')).toBe(true)
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
})
