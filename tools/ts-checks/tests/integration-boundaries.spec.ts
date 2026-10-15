// @module-tag slow
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
  existsSync,
  realpathSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { init, commit, integrationFixture } from './fixtures/integration.ts'
import { git, repository } from '../src/integration/git.ts'
import {
  baselines,
  loadIntegration,
  writeContext,
  firstAdoptionScope,
  BOOTSTRAP_CHECK_ENV,
} from '../src/integration/context.ts'
import { touchedBase } from '../src/loop/hook-measure.ts'
import { readWorktrees } from '../src/loop/sensors/worktrees.ts'
import { bootstrap, activationCheck } from '../src/integration/adoption.ts'
import { policyCheck, adoptPolicy } from '../src/integration/policy-adoption.ts'
import { activeTrack } from '../src/integration/policy.ts'
import {
  bootstrapTrackPlan,
  bootstrapTrack,
  registerTrack,
  retireTrack,
} from '../src/integration/tracks.ts'
import { parseCommand } from '../src/integration/cli.ts'
import { prepare } from '../src/integration/candidate.ts'
import { openIntegration } from '../src/integration/engine.ts'
import { verify } from '../src/integration/verify.ts'
import { publish } from '../src/integration/publish.ts'
import { digest, canonical, object, string } from '../src/integration/parse.ts'
import { pendingPrefix, unitFor } from '../src/integration/units.ts'
import { annotatedObject } from '../src/integration/transport.ts'
import { auditHistory } from '../src/integration/audit.ts'
import { runLoopStatus } from '../src/loop/run.ts'

const homes: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function fixture(sharedLoader = false, runnerMutation = false) {
  const f = integrationFixture({ sharedLoader, runnerMutation })
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
    anchor: f.anchor,
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

const integrationStages = [
  'plan',
  'agents',
  'links',
  'docs',
  'sources',
  'objects',
  'python',
  'format',
  'selftest',
  'build',
  'typecheck',
  'test',
  'rules',
  'acceptance',
  'loop',
]

function wrapperFixture() {
  const home = mkdtempSync(join(tmpdir(), 'omne-wrapper-stages-'))
  homes.push(home)
  const runner = join(home, 'runner'),
    subject = join(home, 'subject')
  init(subject)
  const base = commit(subject, '.gitignore', 'tmp/\n')
  mkdirSync(join(runner, 'scripts'), { recursive: true })
  for (const name of [
    'check.sh',
    'integration-check.sh',
    'with-test-slot.sh',
    'git-environment.sh',
  ])
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
  case "$2" in
    */testing/cli.ts) if [[ "$3" == plan ]]; then record plan "$@"; else record "$4" "$@"; fi ;;
    */loop/cli.ts) record loop "$@" ;;
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
      OMNE_SUBJECT_ROOT: subject,
      OMNE_RUNNER_ROOT: runner,
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

it.each(['', '1'])(
  'actual check wrapper preserves all stages and engineering after test-slot reentry, FULL=%s',
  full => {
    const f = wrapperFixture()
    const result = spawnSync('bash', [join(f.runner, 'scripts/check.sh')], {
      env: { ...f.env, FULL: full },
      encoding: 'utf8',
    })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const trace = readFileSync(f.trace, 'utf8').trim().split('\n')
    expect(trace.map(line => line.split('|')[0])).toEqual(integrationStages)
    expect(trace.every(line => line.split('|')[1] !== '')).toBe(true)
    expect(trace.every(line => line.split('|')[2] === full)).toBe(true)
    expect(trace.at(-1)).toContain('--strict --scope engineering')
    expect(trace.at(-1)).toContain(`--base ${f.base}`)
  },
)

it.each(integrationStages)('actual check stops at failed stage %s', stage => {
  const f = wrapperFixture()
  const result = spawnSync('bash', [join(f.runner, 'scripts/check.sh')], {
    env: { ...f.env, OMNE_FAIL_STAGE: stage, OMNE_TEST_SLOT_HELD: 'held' },
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(1)
  expect(
    readFileSync(f.trace, 'utf8')
      .trim()
      .split('\n')
      .map(line => line.split('|')[0]),
  ).toEqual(integrationStages.slice(0, integrationStages.indexOf(stage) + 1))
})

it('ordinary local check still invokes default strict scope', () => {
  const f = wrapperFixture()
  init(f.runner)
  const result = spawnSync('bash', [join(f.runner, 'scripts/check.sh')], {
    env: { ...f.env, OMNE_SUBJECT_ROOT: '', OMNE_TEST_SLOT_HELD: 'held' },
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const trace = readFileSync(f.trace, 'utf8')
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
    anchor: f.anchor,
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
it('preserves generic master/SHA checks but refuses missing trusted main once remote or adoption exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'omne-generic-'))
  homes.push(root)
  init(root)
  commit(root, 'file', 'one')
  git(root, ['branch', '-m', 'master'])
  expect(loadIntegration(root)).toMatchObject({ kind: 'pending', reason: 'generic-unadopted' })
  expect(baselines(root, git(root, ['rev-parse', 'HEAD'])).state).toBe('pending')
  git(root, ['remote', 'add', 'origin', '/nonexistent/authority'])
  expect(loadIntegration(root).kind).toBe('unknown')
  git(root, ['remote', 'remove', 'origin'])
  git(root, ['config', '--local', 'omne.integrationAdopted', 'true'])
  expect(loadIntegration(root).kind).toBe('unknown')
})
it('bootstraps a real clone and never uses lost adoption as positive absence', () => {
  const f = fixture(),
    clone = join(f.home, 'clone')
  git(f.home, ['clone', f.remote, clone])
  expect(loadIntegration(clone).kind).toBe('unknown')
  expect(bootstrap(clone)).toMatchObject({ kind: 'adopted', context: null })
  expect(baselines(clone, 'main')).toMatchObject({
    state: 'pending',
    targetBase: 'main',
    audits: [],
  })
  git(f.remote, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  expect(() => bootstrap(clone)).toThrow('lost')
})
it.each(['1', 'retained-evidence'])(
  'bootstrap CLI refuses retained local adoption ref %s without cache or latch',
  name => {
    const f = fixture()
    const prefix = 'refs/tags/omne/integration/adoption/'
    git(f.remote, ['update-ref', '-d', `${prefix}1`])
    if (name !== '1') {
      git(f.root, ['update-ref', `${prefix}${name}`, f.anchor])
      git(f.root, ['update-ref', '-d', `${prefix}1`])
    }
    git(f.root, ['config', '--local', '--unset', 'omne.integrationAdopted'])
    const cache = join(repository(f.root).commonDir, 'omne-integration')
    rmSync(join(cache, 'anchor.json'))
    const before = {
      refs: git(f.root, ['show-ref']),
      config: git(f.root, ['config', '--local', '--list']),
      cache: readdirSync(cache),
    }
    const input = join(f.home, 'bootstrap.json')
    writeFileSync(input, JSON.stringify({ kind: 'bootstrap' }))
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url)),
        'execute',
        '--root',
        f.root,
        '--input',
        input,
      ],
      { encoding: 'utf8', env: process.env },
    )
    expect(result.status, result.stdout + result.stderr).toBe(2)
    expect(JSON.parse(result.stderr)).toMatchObject({ code: 'unknown' })
    expect(result.stdout).toBe('')
    expect(git(f.root, ['show-ref'])).toBe(before.refs)
    expect(git(f.root, ['config', '--local', '--list'])).toBe(before.config)
    expect(readdirSync(cache)).toEqual(before.cache)
    expect(loadIntegration(f.root).kind).toBe('unknown')
  },
)
it.each([
  { source: "import { fixture } from '@omne-harness/kernel-basis/testing'", status: 1 },
  { source: 'export const value = 1', status: 0 },
])('actual integration wrapper scans apps with exit $status', ({ source, status }) => {
  const home = mkdtempSync(join(tmpdir(), 'omne-wrapper-rules-'))
  homes.push(home)
  const runner = join(home, 'runner'),
    subject = join(home, 'subject')
  init(subject)
  commit(subject, '.gitignore', 'tmp/\n')
  mkdirSync(join(subject, 'packages'))
  mkdirSync(join(subject, '.meta_harness/design/product'), { recursive: true })
  mkdirSync(join(subject, 'apps/demo/src'), { recursive: true })
  writeFileSync(join(subject, 'apps/demo/src/main.ts'), source)
  mkdirSync(join(runner, 'scripts'), { recursive: true })
  const wrapper = join(runner, 'scripts/integration-check.sh')
  writeFileSync(
    join(runner, 'scripts/git-environment.sh'),
    readFileSync(new URL('../../../scripts/git-environment.sh', import.meta.url)),
  )
  writeFileSync(
    wrapper,
    readFileSync(new URL('../../../scripts/integration-check.sh', import.meta.url)),
  )
  symlinkSync(fileURLToPath(new URL('../../../tools', import.meta.url)), join(runner, 'tools'))
  const setup = join(home, 'dependencies.bash')
  writeFileSync(
    setup,
    `
node() {
  case "$2" in
    "$OMNE_RUNNER_ROOT/tools/ts-checks/src/cli.ts") command "$OMNE_REAL_NODE" "$@" ;;
    "$OMNE_RUNNER_ROOT/tools/ts-checks/src/testing/cli.ts"|"$OMNE_RUNNER_ROOT/tools/ts-checks/src/loop/cli.ts") return 0 ;;
    *) return 97 ;;
  esac
}
uv() { return 0; }
bash() {
  case "$1" in
    "$OMNE_RUNNER_ROOT/scripts/format.sh"|"$OMNE_RUNNER_ROOT/scripts/test-formatting.sh") return 0 ;;
    *) return 98 ;;
  esac
}
`,
  )
  const result = spawnSync('bash', [wrapper], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASH_ENV: setup,
      OMNE_REAL_NODE: process.execPath,
      OMNE_SUBJECT_ROOT: subject,
      OMNE_TEST_SLOT_HELD: '1',
    },
  })
  expect(result.status, result.stdout + result.stderr).toBe(status)
  if (status === 1) expect(result.stderr).toContain('[no-testing-import]')
  else expect(result.stdout).toContain(join(subject, 'apps'))
})
it('never lets bootstrap-check scope erase prior adoption or extend to another worktree', () => {
  for (const retained of ['anchor', 'latch', 'ref']) {
    const f = fixture()
    const scope = firstAdoptionScope(f.root, 'fixture-bootstrap')
    git(f.remote, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
    if (retained !== 'ref')
      git(f.root, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
    if (retained !== 'latch')
      git(f.root, ['config', '--local', '--unset', 'omne.integrationAdopted'])
    if (retained !== 'anchor') rmSync(join(f.root, '.git/omne-integration/anchor.json'))
    vi.stubEnv(BOOTSTRAP_CHECK_ENV, JSON.stringify(scope))
    expect(loadIntegration(f.root).kind).toBe('unknown')
    expect(() => activationCheck(f.root, [])).toThrow('Previously adopted')
  }
  const f = fixture()
  git(f.remote, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['config', '--local', '--unset', 'omne.integrationAdopted'])
  rmSync(join(f.root, '.git/omne-integration/anchor.json'))
  vi.stubEnv(BOOTSTRAP_CHECK_ENV, JSON.stringify(firstAdoptionScope(f.root, 'fixture-bootstrap')))
  expect(loadIntegration(f.root)).toMatchObject({ kind: 'pending', reason: 'positive-absence' })
  const other = join(f.home, 'runner')
  git(f.root, ['worktree', 'add', '--detach', other, f.main])
  expect(loadIntegration(other)).toMatchObject({
    kind: 'unknown',
    reason: 'Bootstrap check belongs to another construction or worktree',
  })
  const moved = commit(f.root, 'feature', 'main advanced')
  git(f.root, ['push', 'origin', `${moved}:refs/heads/main`])
  expect(loadIntegration(f.root).kind).toBe('unknown')
})
it('refuses activation evidence when the committed checker dirties its trusted runner', () => {
  const f = fixture(false, true)
  git(f.remote, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['config', '--local', '--unset', 'omne.integrationAdopted'])
  rmSync(join(f.root, '.git/omne-integration/anchor.json'))
  expect(() => activationCheck(f.root, [])).toThrow('not clean')
  expect(
    git(f.remote, ['for-each-ref', '--format=%(refname)', 'refs/tags/omne/integration/adoption/']),
  ).toBe('')
})
it('rejects mode fields that could mint a checkpoint with integration-only checks', () => {
  const f = fixture()
  for (const mode of ['work', 'ri', 'joint', 'fi', 'task-sync'] as const) {
    const command = {
      kind: 'prepare' as const,
      mode,
      checkpoint: 'invalid',
      sources: [{ kind: 'main' as const, source: f.main }],
    }
    expect(() => parseCommand(command)).toThrow('Only checkpoint')
    expect(() => prepare(f.root, command)).toThrow('Only checkpoint')
  }
  expect(() =>
    parseCommand({
      kind: 'prepare',
      mode: 'checkpoint',
      sources: [{ kind: 'main', source: f.main, track: 'runtime' }],
      checkpoint: 'v1',
    }),
  ).toThrow('unknown fields')
  commit(f.root, 'construction', 'work')
  expect(() => activationCheck(f.root, [])).toThrow('exact committed main')
  writeFileSync(join(f.root, 'untracked'), 'formal')
  expect(() => activationCheck(f.root, [])).toThrow('not clean')
})
it('rejects unregistered or paused routes and comments from a different actor or revoked authority', async () => {
  const f = fixture()
  expect(() =>
    prepare(f.root, {
      kind: 'prepare',
      mode: 'fi',
      track: 'missing',
      sources: [{ kind: 'main', source: f.main }],
    }),
  ).toThrow('not active and registered')
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
it('keeps human authors and actual provenance, rejects edited receipt and stale work attempt', async () => {
  const f = fixture()
  await start(f)
  const source = commit(f.root, 'feature', 'feature')
  const p = prepare(f.root, {
    kind: 'prepare',
    mode: 'work',
    sources: [{ kind: 'work', source }],
    title: 'feat(integration): deliver fixture result',
    provenance: { harness: 'codex', role: 'developer' },
  })
  if (p.kind !== 'candidate') throw new Error('conflict')
  const message = git(f.root, ['show', '-s', '--format=%B', p.candidate.candidate])
  expect(message).toContain('Harness: codex\nAgent-Role: developer')
  expect(message).not.toContain('Co-Authored-By')
  expect(git(f.root, ['show', '-s', '--format=%an%n%cn', p.candidate.candidate])).toBe(
    `${git(f.root, ['config', 'user.name'])}\n${git(f.root, ['config', 'user.name'])}`,
  )
  const receipt = verify(f.root, p.operation)
  const grant = f.authority({
    ...common,
    basis: [...common.basis],
    action: 'publish',
    operation: p.operation,
    candidate: p.candidate.candidate,
    expectedBase: p.candidate.expectedBase,
    sources: p.candidate.sources,
    tasks: p.candidate.tasks,
    receiptDigest: receipt.receiptDigest,
    allowedRefs: [p.candidate.target, `refs/tags/omne/integration/unit/${p.operation}`],
    confirmations: [],
    revalidations: [],
  })
  f.update({ ...f.binding, attempt: 'new' })
  expect(() => publish(f.root, p.operation, grant)).toThrow('no longer current')
  f.update(f.binding)
  const path = join(f.root, 'tmp/integration', p.operation, 'receipt.json'),
    record = JSON.parse(readFileSync(path, 'utf8'))
  record.value.verifiedAt = 'edited'
  record.digest = digest(canonical(record.value))
  writeFileSync(path, JSON.stringify(record))
  expect(() => publish(f.root, p.operation, grant)).toThrow('verified engine record')
})
it.each(['dirty', 'committed', 'unchanged'])(
  'publish CLI rechecks the verified runner when it is %s',
  async change => {
    const f = fixture()
    await start(f)
    const source = commit(f.root, 'feature', 'feature')
    const p = prepare(f.root, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source }],
    })
    if (p.kind !== 'candidate') throw new Error('conflict')
    function cli(input: unknown) {
      const path = join(f.home, 'command.json')
      writeFileSync(path, JSON.stringify(input))
      return spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url)),
          'execute',
          '--root',
          f.root,
          '--input',
          path,
        ],
        { encoding: 'utf8', env: process.env },
      )
    }
    const checked = cli({ kind: 'verify', operation: p.operation })
    expect(checked.status, checked.stdout + checked.stderr).toBe(0)
    const verified = object(JSON.parse(checked.stdout), 'verified')
    expect(verified.kind).toBe('verified')
    const receipt = object(verified.receipt, 'receipt')
    const runner = string(receipt.runner, 'runner')
    const grant = f.authority({
      ...common,
      basis: [...common.basis],
      action: 'publish',
      operation: p.operation,
      candidate: p.candidate.candidate,
      expectedBase: p.candidate.expectedBase,
      sources: p.candidate.sources,
      tasks: p.candidate.tasks,
      receiptDigest: string(verified.receiptDigest, 'receiptDigest'),
      allowedRefs: [p.candidate.target, `refs/tags/omne/integration/unit/${p.operation}`],
      confirmations: [],
      revalidations: [],
    })
    const home = join(f.root, 'tmp/integration', p.operation)
    const receiptBytes = readFileSync(join(home, 'receipt.json'))
    const refs = git(f.remote, ['show-ref'])
    if (change === 'dirty') writeFileSync(join(runner, 'check.mjs'), 'process.exit(0)\n')
    if (change === 'committed') {
      commit(runner, 'check.mjs', 'process.exit(0)\n')
      expect(git(runner, ['status', '--porcelain'])).toBe('')
      expect(git(runner, ['rev-parse', 'HEAD'])).not.toBe(p.candidate.policy.commit)
      expect(git(runner, ['rev-parse', 'HEAD^{tree}'])).not.toBe(receipt.runnerTree)
    }
    const result = cli({ kind: 'publish', operation: p.operation, authority: grant })
    if (change === 'unchanged') {
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ observation: { kind: 'published' } })
      expect(git(f.remote, ['rev-parse', p.candidate.target])).toBe(p.candidate.candidate)
      expect(
        git(f.remote, ['rev-parse', `refs/tags/omne/integration/unit/${p.operation}^{}`]),
      ).toBe(p.candidate.candidate)
    } else {
      expect(result.status, result.stdout + result.stderr).toBe(2)
      expect(JSON.parse(result.stderr)).toMatchObject({
        code: change === 'dirty' ? 'refused' : 'stale',
        message:
          change === 'dirty'
            ? `Candidate is not clean: ${runner}`
            : 'Trusted runner changed since verification',
      })
      expect(result.stdout).toBe('')
      expect(git(f.remote, ['show-ref'])).toBe(refs)
      expect(existsSync(join(home, 'intent.json'))).toBe(false)
      expect(existsSync(join(home, 'publication.json'))).toBe(false)
    }
    expect(readFileSync(join(home, 'receipt.json'))).toEqual(receiptBytes)
  },
)
it('rejects missing prefix units and undeclared merge parents without excluding C itself', async () => {
  const f = fixture()
  await start(f)
  const source = commit(f.root, 'feature', 'feature'),
    p = prepare(f.root, { kind: 'prepare', mode: 'work', sources: [{ kind: 'work', source }] })
  if (p.kind !== 'candidate') throw new Error('conflict')
  git(f.root, ['push', 'origin', `${p.candidate.candidate}:refs/heads/integration/runtime`])
  expect(() => pendingPrefix(f.root, f.policy, 'runtime', p.candidate.candidate, f.main)).toThrow()
  git(f.root, ['checkout', '--detach', f.initial])
  const foreign = commit(f.root, 'foreign', 'foreign')
  const extra = git(f.root, [
    'commit-tree',
    p.candidate.tree,
    '-p',
    f.initial,
    '-p',
    source,
    '-p',
    foreign,
    '-m',
    'rogue parent',
  ])
  const unit = unitFor({ ...p.candidate, candidate: extra }, 'fixture'),
    ref = `refs/tags/omne/integration/unit/${p.operation}`
  const tag = annotatedObject(f.root, ref.slice(10), extra, unit)
  git(f.remote, ['update-ref', 'refs/heads/integration/runtime', f.initial])
  git(f.root, ['push', 'origin', `${extra}:refs/heads/integration/runtime`, `${tag}:${ref}`])
  expect(() => pendingPrefix(f.root, f.policy, 'runtime', extra, f.main)).toThrow('parent')
})
it('audits reverted acceptance edits against original taskBase despite a newer target B', async () => {
  const f = fixture()
  f.binding.writeScope.push('apps')
  f.update(f.binding)
  await start(f)
  mkdirSync(join(f.root, 'apps/demo/acceptance'), { recursive: true })
  const path = 'apps/demo/acceptance/check.ts'
  commit(f.root, path, 'changed')
  git(f.root, ['commit', '--allow-empty', '-m', 'marker'])
  writeFileSync(join(f.root, path), 'weakened')
  git(f.root, ['add', path])
  git(f.root, ['commit', '-m', 'fix: weaken\n\nHarness: codex\nAgent-Role: developer'])
  writeFileSync(join(f.root, path), 'changed')
  git(f.root, ['add', path])
  git(f.root, ['commit', '-m', 'fix: restore\n\nHarness: codex\nAgent-Role: developer'])
  const source = git(f.root, ['rev-parse', 'HEAD'])
  git(f.root, ['push', 'origin', `${source}:refs/heads/integration/runtime`])
  const p = prepare(f.root, { kind: 'prepare', mode: 'work', sources: [{ kind: 'work', source }] })
  if (p.kind !== 'candidate') throw new Error('conflict')
  const ranges = auditHistory(p.candidate.subject, undefined, {
    memberRoots: ['apps'],
    directory: 'acceptance',
    ownerRoles: ['qa', 'main'],
  })
  expect(ranges.find(range => range.base === f.main)?.acceptance.violations).toHaveLength(2)
  expect(ranges.find(range => range.base === source)?.acceptance.violations).toHaveLength(0)
})

it('adopts complete checked construction through real CLI/shared loader and upgrades with the old runner', async () => {
  const f = fixture(true)
  git(f.remote, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['update-ref', '-d', 'refs/tags/omne/integration/adoption/1'])
  git(f.root, ['config', '--local', '--unset', 'omne.integrationAdopted'])
  rmSync(join(f.root, '.git/omne-integration/anchor.json'))
  expect(loadIntegration(f.root).kind).toBe('unknown')
  expect(bootstrap(f.root)).toMatchObject({ kind: 'pending', reason: 'positive-absence' })
  expect(loadIntegration(f.root).kind).toBe('unknown')
  const input = join(f.home, 'activation-command.json')
  writeFileSync(input, JSON.stringify({ kind: 'activation-check', legacy: [] }))
  const cli = new URL('../src/integration/cli.ts', import.meta.url).pathname
  const invoked = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cli, 'execute', '--root', f.root, '--input', input],
    { env: process.env, encoding: 'utf8' },
  )
  expect(invoked.status, invoked.stderr).toBe(0)
  const checked = JSON.parse(invoked.stdout)
  expect(loadIntegration(f.root).kind).toBe('unknown')
  const saved = JSON.parse(
    readFileSync(
      join(f.root, 'tmp/integration', checked.operation, 'activation-check.json'),
      'utf8',
    ),
  ).value
  expect(saved.absenceBefore).toMatchObject({
    completeness: 'complete',
    namespace: 'refs/tags/omne/integration/adoption/',
  })
  expect(readFileSync(saved.commands[0].log, 'utf8')).toContain('"state":"pending"')
  if (
    typeof checked !== 'object' ||
    checked === null ||
    !('operation' in checked) ||
    !('checksDigest' in checked) ||
    !('legacyDigest' in checked) ||
    typeof checked.operation !== 'string' ||
    typeof checked.checksDigest !== 'string' ||
    typeof checked.legacyDigest !== 'string'
  )
    throw new Error('check shape')
  const authority = f.authority({
    ...common,
    basis: [...common.basis],
    action: 'adopt',
    policyCommit: f.main,
    constructionHead: f.main,
    constructionComplete: true,
    checksDigest: checked.checksDigest,
    legacyDigest: checked.legacyDigest,
    bootstrapBasis: 'fixture construction complete',
  })
  writeFileSync(
    input,
    JSON.stringify({ kind: 'activate', operation: checked.operation, authority }),
  )
  const commandLog = saved.commands[0].log
  const originalLog = readFileSync(commandLog, 'utf8')
  writeFileSync(commandLog, 'edited evidence')
  const edited = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cli, 'execute', '--root', f.root, '--input', input],
    { env: process.env, encoding: 'utf8' },
  )
  expect(edited.status).toBe(2)
  expect(edited.stderr).toContain('Verification log changed')
  expect(
    git(f.remote, ['for-each-ref', '--format=%(refname)', 'refs/tags/omne/integration/adoption/']),
  ).toBe('')
  writeFileSync(commandLog, originalLog)
  const activated = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cli, 'execute', '--root', f.root, '--input', input],
    { env: process.env, encoding: 'utf8' },
  )
  expect(activated.status, activated.stderr).toBe(0)
  expect(JSON.parse(activated.stdout)).toMatchObject({ kind: 'adopted' })
  const oldClone = join(f.home, 'old-clone')
  git(f.home, ['clone', f.remote, oldClone])
  for (const key of ['user.name', 'user.email'])
    git(oldClone, ['config', key, git(f.root, ['config', key])])
  bootstrap(oldClone)
  git(oldClone, ['checkout', '-b', f.binding.branch])
  f.authority(
    { ...common, basis: [...common.basis], action: 'dispatch', task: f.binding, confirmations: [] },
    1,
  )
  await (
    await openIntegration({ root: oldClone })
  ).execute({
    kind: 'start',
    authority: f.binding.dispatch,
    issue: f.binding.issue.url,
    revision: 1,
    attempt: 'one',
  })
  const oldSource = commit(oldClone, 'feature', 'old clone task')
  const oldCandidate = prepare(oldClone, {
    kind: 'prepare',
    mode: 'work',
    sources: [{ kind: 'work', source: oldSource }],
  })
  if (oldCandidate.kind !== 'candidate') throw new Error('old candidate conflict')
  verify(oldClone, oldCandidate.operation)
  git(f.root, ['checkout', 'main'])
  commit(
    f.root,
    'docs/engineering/integration-policy.json',
    JSON.stringify({
      ...f.policy,
      revision: '2',
      tracks: [
        ...f.policy.tracks,
        {
          id: 'new-track',
          branch: 'integration/new-track',
          owner: 'human',
          source: f.binding.issue.url,
          status: 'active',
          initialMain: f.main,
          checks: [],
        },
      ],
    }),
  )
  git(f.root, ['push', 'origin', 'main'])
  const upgrade = policyCheck(f.root)
  if (
    typeof upgrade !== 'object' ||
    upgrade === null ||
    !('operation' in upgrade) ||
    !('checksDigest' in upgrade) ||
    !('handoffDigest' in upgrade) ||
    typeof upgrade.operation !== 'string' ||
    typeof upgrade.checksDigest !== 'string' ||
    typeof upgrade.handoffDigest !== 'string'
  )
    throw new Error('upgrade shape')
  const state = loadIntegration(f.root)
  if (state.kind !== 'adopted') throw new Error('adoption missing')
  const decision = f.authority({
    ...common,
    basis: [...common.basis],
    action: 'policy-adopt',
    previous: state.anchor,
    policyCommit: git(f.root, ['rev-parse', 'HEAD']),
    handoffDigest: upgrade.handoffDigest,
    checksDigest: upgrade.checksDigest,
  })
  expect(adoptPolicy(f.root, upgrade.operation, decision)).toMatchObject({
    observation: { kind: 'published' },
  })
  expect(bootstrap(f.root)).toMatchObject({ kind: 'adopted', policy: { revision: '2' } })
  expect(loadIntegration(oldClone)).toMatchObject({ kind: 'adopted', policy: { revision: '1' } })
  expect(() =>
    prepare(oldClone, {
      kind: 'prepare',
      mode: 'work',
      sources: [{ kind: 'work', source: oldSource }],
    }),
  ).toThrow('Authority adoption changed')
  expect(() => verify(oldClone, oldCandidate.operation)).toThrow('Authority adoption changed')
  expect(() => publish(oldClone, oldCandidate.operation, authority)).toThrow(
    'Authority adoption changed',
  )
  expect(git(f.remote, ['rev-parse', 'integration/runtime'])).toBe(f.initial)
  const plan = bootstrapTrackPlan(f.root, 'new-track')
  if (
    typeof plan !== 'object' ||
    plan === null ||
    !('operation' in plan) ||
    typeof plan.operation !== 'string' ||
    !('allowedRefs' in plan) ||
    !Array.isArray(plan.allowedRefs) ||
    !plan.allowedRefs.every(ref => typeof ref === 'string')
  )
    throw new Error('track plan shape')
  const permission = f.authority({
    ...common,
    policyRevision: '2',
    basis: [...common.basis],
    action: 'track-bootstrap',
    track: 'new-track',
    mainAnchor: f.main,
    allowedRefs: plan.allowedRefs,
    expectedAbsent: true,
  })
  expect(bootstrapTrack(f.root, plan.operation, permission)).toMatchObject({ kind: 'published' })
  expect(git(f.remote, ['rev-parse', 'integration/new-track'])).toBe(f.main)
  expect(retireTrack(f.root, 'new-track')).toMatchObject({
    kind: 'retirement-plan',
    deletion: 'not-authorized',
    pendingPrefix: { tasks: [] },
  })
  expect(
    registerTrack(f.root, {
      id: 'new-track',
      branch: 'integration/new-track',
      owner: 'human',
      source: f.binding.issue.url,
      status: 'paused',
      initialMain: f.main,
      checks: [],
    }),
  ).toMatchObject({ kind: 'policy-draft', adoption: 'required' })
  const forward = prepare(f.root, {
    kind: 'prepare',
    mode: 'fi',
    track: 'new-track',
    sources: [{ kind: 'main', source: git(f.root, ['rev-parse', 'HEAD']) }],
  })
  if (forward.kind !== 'candidate') throw new Error('FI conflict')
  const forwardReceipt = verify(f.root, forward.operation)
  const forwardPermission = f.authority({
    ...common,
    policyRevision: '2',
    basis: [...common.basis],
    action: 'publish',
    operation: forward.operation,
    candidate: forward.candidate.candidate,
    expectedBase: forward.candidate.expectedBase,
    sources: forward.candidate.sources,
    tasks: [],
    receiptDigest: forwardReceipt.receiptDigest,
    allowedRefs: [forward.candidate.target, `refs/tags/omne/integration/unit/${forward.operation}`],
    confirmations: [],
    revalidations: [],
  })
  expect(publish(f.root, forward.operation, forwardPermission)).toMatchObject({
    observation: { kind: 'published' },
  })
  const joint = prepare(f.root, {
    kind: 'prepare',
    mode: 'joint',
    sources: [
      { kind: 'track', track: 'new-track', source: forward.candidate.candidate },
      { kind: 'track', track: 'runtime', source: f.initial },
    ],
  })
  if (joint.kind !== 'candidate') throw new Error('joint conflict')
  expect(joint.candidate.tasks).toEqual([])
  expect(joint.candidate.units).toHaveLength(1)
  expect(verify(f.root, joint.operation).kind).toBe('verified')
})
