// @module-tag slow
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { init, commit, integrationFixture } from './fixtures/integration.ts'
import { git, repository } from '../src/integration/git.ts'
import { writeContext } from '../src/integration/context.ts'
import { touchedBase } from '@omne-harness/repo-toolchain/loop/hook-measure'
import { readWorktrees } from '@omne-harness/repo-toolchain/loop/sensors/worktrees'
import { activeTrack } from '../src/integration/policy.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { runLoopStatus } from '@omne-harness/repo-toolchain/loop/run'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function fixture() {
  const f = integrationFixture()
  homes.push(f.home)
  vi.stubEnv('PATH', `${f.bin}:${process.env.PATH}`)
  vi.stubEnv('OMNE_GH_FIXTURE', f.home)
  return f
}
const common = {
  schemaVersion: 1,
  policyRevision: '1',
  responsible: 'human',
  basis: ['fixture authority'],
} as const
async function start(f: ReturnType<typeof fixture>) {
  f.authority(
    { ...common, basis: [...common.basis], action: 'dispatch', task: f.binding, confirmations: [] },
    1,
  )
  await (
    await openIntegration({ root: f.root })
  ).execute({
    kind: 'start',
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: f.binding.revision,
    attempt: f.binding.attempt,
  })
}

it('engineering loop carries all task baselines and rejects stale context', async () => {
  const f = fixture()
  mkdirSync(join(f.root, 'packages/core/demo/src'), { recursive: true })
  const sourceBase = commit(f.root, 'packages/core/demo/src/index.ts', 'export const value = 1')
  git(f.root, ['rm', '-rq', 'packages'])
  mkdirSync(join(f.root, 'apps/demo/tests'), { recursive: true })
  const testBase = commit(f.root, 'apps/demo/tests/index.spec.ts', 'test("check", () => {})')
  git(f.root, ['rm', '-rq', 'apps'])
  const head = commit(f.root, 'README.md', 'empty product')
  const info = repository(f.root)
  writeContext(f.root, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase: f.main,
    tasks: [sourceBase, testBase].map(taskBase => ({
      binding: { ...f.binding, taskBase },
      taskSource: head,
    })),
    ownerTask: null,
    operation: 'fixture-candidate',
  })
  const out = join(f.home, 'loop')
  const options = {
    root: f.root,
    out,
    strict: true,
    snapshot: false,
    scope: 'engineering',
  } as const
  const result = await runLoopStatus(options, { OMNE_METRICS_HOME: join(f.home, 'metrics') })
  expect(result.code).toBe(1)
  const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8'))
  expect(status.scope.evidence.baselines).toEqual([
    { commit: f.main, inputs: { sources: 0, tests: 0 } },
    { commit: sourceBase, inputs: { sources: 1, tests: 0 } },
    { commit: testBase, inputs: { sources: 0, tests: 1 } },
  ])
  expect(status.hardLines.sensors.notApplicable).toEqual([])
  git(f.root, ['branch', '-m', 'human/stale-context'])
  await expect(runLoopStatus(options, {})).rejects.toThrow('Context belongs to another')
})

function wrapperFixture() {
  const home = mkdtempSync(join(tmpdir(), 'omne-wrapper-stages-'))
  homes.push(home)
  const runner = join(home, 'runner'),
    subject = join(home, 'subject')
  init(subject)
  const base = commit(subject, '.gitignore', 'tmp/\n')
  mkdirSync(join(runner, 'scripts'), { recursive: true })
  for (const name of ['check.sh', 'with-test-slot.sh', 'with-test-slot.mjs', 'git-environment.sh'])
    writeFileSync(
      join(runner, 'scripts', name),
      readFileSync(new URL(`../../../scripts/${name}`, import.meta.url)),
      { mode: 0o755 },
    )
  const setup = join(home, 'dependencies.bash'),
    trace = join(home, 'trace')
  writeFileSync(
    setup,
    `
record() {
  printf '%s|%s|%s|%s\\n' "$1" "$OMNE_TEST_SLOT_HELD" "$FULL" "$*" >> "$OMNE_TRACE"
  [[ "$1" != "$OMNE_FAIL_STAGE" ]]
}
node() {
  local script=
  for argument in "$@"; do case "$argument" in --*) ;; *) script=$argument; break ;; esac; done
  case "$script" in
    */testing/cli.ts) if [[ "$3" == plan ]]; then record plan "$@"; else record "$4" "$@"; fi ;;
    */integration/cli.ts) printf '{"targetBase":"%s"}' "$BASELINE" ;;
    */src/cli.ts) record rules "$@" ;;
    *) command node "$@" ;;
  esac
}
uv() {
  case "$*" in
    *compile_agents.py*) record agents ;;
    *link_agents.py*) record links ;;
    *check_docs*) record docs ;;
    *check_sources.py*) record sources ;;
    *domain_objects.py*) record objects ;;
    *) return 97 ;;
  esac
}
bash() {
  case "$1" in
    */format.sh) record format "$@" ;;
    */test-formatting.sh) record selftest "$@" ;;
    *) command bash "$@" ;;
  esac
}
make() { record make "$@"; }
pnpm() { record pnpm "$@"; }
`,
  )
  return {
    home,
    runner,
    subject,
    base,
    trace,
    env: {
      ...process.env,
      BASH_ENV: setup,
      BASELINE: base,
      FULL: '',
      OMNE_FAIL_STAGE: '',
      OMNE_TRACE: trace,
      OMNE_TEST_SLOT_HELD: '',
      OMNE_TEST_SLOT_DIR: join(home, 'slots'),
      OMNE_TEST_SLOT_LEDGER: join(home, 'ledger'),
    },
  }
}

it('runs the ordinary local check even when a subject root is set', () => {
  const f = wrapperFixture()
  init(f.runner)
  const result = spawnSync('bash', [join(f.runner, 'scripts/check.sh')], {
    env: { ...f.env, OMNE_SUBJECT_ROOT: f.subject, OMNE_TEST_SLOT_HELD: 'held' },
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const trace = readFileSync(f.trace, 'utf8')
  expect(trace).toContain(`plan --base ${f.base}`)
  expect(trace).toContain('loop-status STRICT=1')
  expect(trace).not.toContain('--scope engineering')
})
it('reads the hook root and each worktree own immutable task baseline', async () => {
  const f = fixture()
  await start(f)
  mkdirSync(join(f.root, 'packages/core/first'), { recursive: true })
  const newer = commit(f.root, 'packages/core/first/file.ts', 'export const first = 1')
  const other = join(f.home, 'other')
  git(f.root, ['worktree', 'add', '-b', 'human/other', other, newer])
  expect(touchedBase(f.root, 'not-a-primary')).toBe(f.main)
  // Without a task context the hook falls back to the merge base with the primary branch;
  // this worktree changed no product source, so there is nothing to measure.
  expect(touchedBase(other, 'main')).toBeUndefined()
  expect(readWorktrees(f.root, 'main')).toEqual([
    { path: realpathSync(other), branch: 'human/other', members: ['packages/core/first'] },
  ])
  const info = repository(other)
  const binding = { ...f.binding, branch: 'human/other', taskBase: newer, attempt: 'other' }
  mkdirSync(join(other, 'packages/core/second'), { recursive: true })
  const head = commit(other, 'packages/core/second/file.ts', 'export const second = 2')
  writeContext(other, {
    schemaVersion: 1,
    root: info.root,
    gitDir: info.gitDir,
    branch: info.branch,
    targetBase: f.initial,
    tasks: [{ binding, taskSource: head }],
    ownerTask: binding,
    operation: null,
  })
  expect(touchedBase(other, 'main')).toBe(newer)
  expect(readWorktrees(f.root, 'main')).toEqual([
    { path: other, branch: 'human/other', members: ['packages/core/second'] },
  ])
})
it('rejects unregistered or paused routes and comments from a different actor or revoked authority', async () => {
  const f = fixture()
  expect(() => activeTrack(f.policy, 'missing')).toThrow('not registered')
  expect(() =>
    activeTrack(
      { ...f.policy, tracks: f.policy.tracks.map(track => ({ ...track, status: 'paused' })) },
      'runtime',
    ),
  ).toThrow('not active and registered')
  f.authority(
    { ...common, basis: [...common.basis], action: 'dispatch', task: f.binding, confirmations: [] },
    1,
  )
  const platform = join(f.home, 'platform.json')
  const observed = JSON.parse(readFileSync(platform, 'utf8'))
  observed.comments[0].user = { login: 'another-human', node_id: 'U_other' }
  writeFileSync(platform, JSON.stringify(observed))
  const engine = await openIntegration({ root: f.root })
  const command = {
    kind: 'start' as const,
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: 1,
    attempt: 'one',
  }
  await expect(engine.execute(command)).rejects.toThrow('not a reviewer of the publish environment')
  observed.comments[0].user = { login: 'human', node_id: 'U_human' }
  observed.comments.push({
    ...observed.comments[0],
    id: 2,
    html_url: f.binding.issue.url + '#issuecomment-2',
    body:
      '```json omne-integration-revocation:v1\n' +
      JSON.stringify({
        schemaVersion: 1,
        decisions: [f.binding.dispatch],
        basis: 'dispatch withdrawn',
      }) +
      '\n```',
  })
  writeFileSync(platform, JSON.stringify(observed))
  await expect(engine.execute(command)).rejects.toThrow('revocation')
})
it('runs the actual trusted formatter on subject bytes, not its own clean source', () => {
  const f = fixture(),
    runner = new URL('../../../', import.meta.url).pathname
  mkdirSync(join(f.root, 'tools/demo/src'), { recursive: true })
  commit(f.root, 'tools/demo/src/invalid.ts', 'export const x={a:1,b:2};\n')
  const result = spawnSync('bash', [join(runner, 'scripts/format.sh'), 'check'], {
    env: { ...process.env, OMNE_SUBJECT_ROOT: f.root },
    encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  expect(result.stdout).toContain(`Formatting subject ${f.root}`)
  expect(result.stderr + result.stdout).toContain('invalid.ts')
})
