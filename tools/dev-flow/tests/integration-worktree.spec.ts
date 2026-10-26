import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { TaskBindingV2 } from '../src/delivery/binding.ts'
import type { GhCommand } from '../src/delivery/github-read.ts'
import { confirmationNote, NOTE_LIMIT, waitGate } from '../src/integration/gate.ts'
import {
  issueBinding,
  prepareWorktree,
  regenerateProjections,
  startInput,
  swapWorktree,
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
type Step = { program: string; args: readonly string[]; cwd: string }
/**
 * Records every step. `answers` gives the result of a step by its first words; `git worktree
 * add` creates the directory like the real command, and start prints a context.
 */
function runner(
  answers: Record<string, { status: number; stdout?: string; stderr?: string }> = {},
) {
  const steps: Step[] = []
  const run: Runner = (program, args, { cwd }) => {
    steps.push({ program, args, cwd })
    const key = [program, ...args.slice(0, 2)].join(' ')
    if (program === 'git' && args[0] === 'worktree' && args[1] === 'add')
      mkdirSync(args[3] ?? '', { recursive: true })
    const answer =
      answers[key] ??
      (program === 'node' ? { status: 0, stdout: '{"bound":true}', stderr: '' } : { status: 0 })
    return { status: answer.status, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' }
  }
  const names = () => steps.map(step => [step.program, ...step.args.slice(0, 2)].join(' '))
  return { run, steps, names }
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

  it('adds the tracking worktree, installs, regenerates projections, then runs its own start', () => {
    const root = home(),
      tree = join(root, 'tree'),
      r = runner({ 'git show-ref --quiet': { status: 1 } })
    const result = prepareWorktree({ root, tree, binding, run: r.run })
    expect(r.names()).toEqual([
      'git fetch --quiet',
      'git show-ref --quiet',
      'git worktree add',
      'pnpm install --frozen-lockfile',
      'uv run --locked',
      'rsync -rlpc ' + r.steps[5]?.args[1],
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

  it('uses an existing local branch and restores evidence into the task directory', () => {
    const root = home(),
      evidence = join(root, 'evidence')
    mkdirSync(evidence)
    writeFileSync(join(evidence, 'report.md'), 'kept')
    const tree = join(root, 'tree'),
      r = runner()
    prepareWorktree({ root, tree, binding, evidence, run: r.run })
    expect(r.steps[2]?.args).toEqual(['worktree', 'add', '--quiet', tree, binding.branch])
    expect(readFileSync(join(tree, 'tmp/issue-7/report.md'), 'utf8')).toBe('kept')
  })

  it('refuses an existing directory and stops at the first failed step', () => {
    const root = home()
    expect(() => prepareWorktree({ root, tree: root, binding, run: runner().run })).toThrow(
      'already exists',
    )
    const r = runner({ 'pnpm install --frozen-lockfile': { status: 1, stderr: 'lock mismatch' } })
    expect(() => prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run })).toThrow(
      'install failed (exit 1): lock mismatch',
    )
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
    expect(() => prepareWorktree({ root, tree: join(root, 'tree'), binding, run: r.run })).toThrow(
      'The card lacks a milestone',
    )
  })

  it('runs check:agents after the projections are copied and linked', () => {
    const r = runner({ 'pnpm run check:agents': { status: 1, stderr: 'output differs' } })
    expect(() => regenerateProjections(home(), r.run)).toThrow(
      'check:agents failed (exit 1): output differs',
    )
    expect(r.names().slice(0, 3)).toEqual([
      'uv run --locked',
      expect.stringMatching(/^rsync -rlpc /),
      'uv run --locked',
    ])
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
  const clean = {
    'git status --porcelain': { status: 0, stdout: '' },
    'git branch --show-current': { status: 0, stdout: `${binding.branch}\n` },
  }

  it('carries the task evidence without stage directories into the new tree', () => {
    const root = home(),
      r = runner(clean)
    const result = swapWorktree({
      root,
      old: old(root),
      tree: join(root, 'new'),
      binding,
      run: r.run,
    })
    expect(r.names()).toContain('git worktree remove')
    expect(readFileSync(join(root, 'new/tmp/issue-7/handoff.md'), 'utf8')).toBe('evidence')
    expect(existsSync(join(root, 'new/tmp/issue-7/agents-stage'))).toBe(false)
    expect(result.evidence).toBeDefined()
  })

  it.each([
    [
      'uncommitted tracked changes',
      { ...clean, 'git status --porcelain': { status: 0, stdout: ' M a.ts\n' } },
      'uncommitted tracked changes',
    ],
    [
      'another branch',
      { ...clean, 'git branch --show-current': { status: 0, stdout: 'human/other\n' } },
      'is on human/other',
    ],
    [
      'unpushed commits',
      { ...clean, 'git merge-base --is-ancestor': { status: 1 } },
      'push them first',
    ],
  ])('refuses %s and removes nothing', (_name, answers, message) => {
    const root = home(),
      r = runner(answers)
    expect(() =>
      swapWorktree({ root, old: old(root), tree: join(root, 'new'), binding, run: r.run }),
    ).toThrow(message)
    expect(r.names()).not.toContain('git worktree remove')
  })
})

describe('gate wait', () => {
  function gate(script: { status: string; conclusion?: string; pending?: unknown[] }[]) {
    const calls: string[][] = []
    let index = 0
    const call: GhCommand = argv => {
      calls.push([...argv])
      const path = argv.find(item => item.startsWith('repos/')) ?? ''
      const current = script[Math.min(index, script.length - 1)] ?? { status: 'completed' }
      if (argv[2] === 'POST') return {}
      if (path.endsWith('/pending_deployments')) return current.pending ?? []
      index += 1
      return { status: current.status, conclusion: current.conclusion ?? null }
    }
    return { call, calls }
  }
  const pending = (id: number, can = true) => ({
    environment: { id },
    current_user_can_approve: can,
  })
  const options = {
    repository: 'owner/repo',
    run: 42,
    note: 'admission exit 0; D-I90 checked',
    sleep: async () => {},
    now: () => 0,
  }

  it('approves each pending environment once with the note and returns the conclusion', async () => {
    const g = gate([
      { status: 'waiting', pending: [pending(5), pending(6, false)] },
      { status: 'waiting', pending: [pending(5)] },
      { status: 'completed', conclusion: 'success' },
    ])
    await expect(waitGate({ ...options, call: g.call })).resolves.toEqual({
      run: 42,
      conclusion: 'success',
      approved: [5],
    })
    const posts = g.calls.filter(c => c[2] === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.arrayContaining([
        'environment_ids[]=5',
        'state=approved',
        'comment=admission exit 0; D-I90 checked',
      ]),
    )
  })

  it('refuses a note over the limit before any request', async () => {
    const g = gate([{ status: 'completed', conclusion: 'success' }])
    await expect(
      waitGate({ ...options, note: 'x'.repeat(NOTE_LIMIT + 1), call: g.call }),
    ).rejects.toThrow('at most 1024')
    expect(g.calls).toEqual([])
    expect(confirmationNote(`${'字'.repeat(NOTE_LIMIT)}\n`)).toHaveLength(NOTE_LIMIT)
    expect(() => confirmationNote('  ')).toThrow('empty')
  })

  it('stops with unknown after the wait', async () => {
    let clock = 0
    const g = gate([{ status: 'in_progress' }])
    await expect(
      waitGate({
        ...options,
        call: g.call,
        now: () => clock,
        sleep: async ms => void (clock += ms),
        intervalMs: 10,
        timeoutMs: 25,
      }),
    ).rejects.toThrow('did not complete')
  })
})
