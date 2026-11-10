// @module-tag slow
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { init, commit, git } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function temporary(prefix: string): string {
  const home = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  homes.push(home)
  return home
}

function wrapperFixture() {
  const home = temporary('omne-wrapper-stages-')
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
    */testing/cli.ts)
      case "$3" in
        check) record check "$@" ;;
        *) record "$3" "$@" ;;
      esac ;;
    */src/cli.ts) record rules "$@" ;;
    */integration/cli.ts) record contract-check "$@" ;;
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

it('the check wrapper forwards to the runner inside its slot even when a subject root is set', () => {
  const f = wrapperFixture()
  init(f.runner)
  const result = spawnSync('bash', [join(f.runner, 'scripts/check.sh'), '--admission'], {
    env: { ...f.env, OMNE_SUBJECT_ROOT: f.subject, OMNE_TEST_SLOT_HELD: 'held' },
    encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const trace = readFileSync(f.trace, 'utf8')
  // Exactly one call: the runner's check command, with the flags passed through and the slot held.
  expect(trace.trim().split('\n')).toHaveLength(1)
  expect(trace).toMatch(/^check\|held\|.*testing\/cli\.ts check --admission$/mu)
  expect(trace).not.toContain('pnpm')
  expect(trace).not.toContain('--scope engineering')
})

it('the check step table runs the dev-flow entry, the snapshot check after the build', () => {
  const cli = fileURLToPath(new URL('../../test-runner/src/testing/cli.ts', import.meta.url))
  const listed = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cli, 'check', '--list'],
    {
      encoding: 'utf8',
    },
  )
  expect(listed.status, listed.stdout + listed.stderr).toBe(0)
  const rows = new Map(
    listed.stdout
      .trim()
      .split('\n')
      .map(line => line.split('\t'))
      .map(([name, after, , command]) => [name, { after: after ?? '', command: command ?? '' }]),
  )
  // The snapshot check runs through dev-flow, after the build and the type check (which may rebuild a dist), and no longer through pnpm.
  expect(rows.get('contract-check')?.after).toBe('build,typecheck')
  expect(rows.get('contract-check')?.command).toMatch(/integration\/cli\.ts contract-check$/u)
  expect(listed.stdout).not.toContain('contract:api --check')
})
it('runs the actual trusted formatter on subject bytes, not its own clean source', () => {
  const root = join(temporary('omne-format-subject-'), 'subject'),
    runner = fileURLToPath(new URL('../../../', import.meta.url))
  init(root)
  mkdirSync(join(root, 'tools/demo/src'), { recursive: true })
  commit(root, 'tools/demo/src/invalid.ts', 'export const x={a:1,b:2};\n')
  const result = spawnSync('bash', [join(runner, 'scripts/format.sh'), 'check'], {
    env: { ...process.env, OMNE_SUBJECT_ROOT: root },
    encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  // format.sh names the subject by `git rev-parse --show-toplevel`; on Windows that is the form with
  // forward slashes and long names.
  expect(result.stdout).toContain(`Formatting subject ${git(root, ['rev-parse', '--show-toplevel'])}`)
  expect(result.stderr + result.stdout).toContain('invalid.ts')
})
