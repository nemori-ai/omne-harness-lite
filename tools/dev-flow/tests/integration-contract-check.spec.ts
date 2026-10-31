// The failing `contract:api --check` step of `pnpm run check`. Unit cases judge injected
// `--check --json` output; the slow cases run the installed, pinned `omne-contract-api` in a
// temporary Git checkout through the integration CLI.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contractCheckExitCode,
  judgeCheck,
  parseCheckRun,
  runContractCheck,
} from '../src/integration/contract-check.ts'
import { git } from '../src/integration/git.ts'
import { IntegrationError } from '../src/integration/parse.ts'
import {
  contracts,
  MEMBERS,
  SNAPSHOT_TEMPLATE,
  snapshotOf,
  write,
  writeSnapshots,
} from './fixtures/contract-api.ts'
import { init } from './fixtures/integration.ts'

const homes: string[] = []
afterEach(() => {
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function temporary(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-contract-check-')))
  homes.push(root)
  return root
}

const sha256 = 'f'.repeat(64)
const member = (directory: string, status: string, extra: object = {}) => ({
  directory,
  status,
  ...extra,
})
/** One member in each of the six statuses of the pinned `--check --json`. */
const SIX = {
  match: member('pkg/match', 'match', { snapshotFile: 'pkg/match/api/match.api.md', sha256 }),
  differs: member('pkg/differs', 'differs', {
    snapshotFile: 'pkg/differs/api/differs.api.md',
    sha256,
    change: 'additive',
    differences: [],
  }),
  unreadable: member('pkg/unreadable', 'unreadable', {
    snapshotFile: 'pkg/unreadable/api/unreadable.api.md',
    sha256,
    message: '快照格式版本不对',
  }),
  missing: member('pkg/missing', 'missing', { snapshotFile: 'pkg/missing/api/missing.api.md' }),
  unbuilt: member('pkg/unbuilt', 'unbuilt', { snapshotFile: 'pkg/unbuilt/api/unbuilt.api.md' }),
  invalid: member('pkg/invalid', 'invalid', { message: 'exports 缺 types 条件' }),
}
const output = (...members: object[]) => JSON.stringify({ typescript: '6.0.3', members }, null, 2)
const judged = (...members: object[]) => judgeCheck(parseCheckRun(output(...members)))

describe('the judgement of one --check run', () => {
  it('passes match and only reports unbuilt', () => {
    const report = judged(SIX.match, SIX.unbuilt)
    expect(contractCheckExitCode(report)).toBe(0)
    expect(report.failures).toEqual([])
    expect(report.unbuilt).toEqual(['pkg/unbuilt'])
    expect(report.counts).toMatchObject({ match: 1, unbuilt: 1, differs: 0 })
  })

  it('fails each of differs, unreadable, missing and invalid with the member and a remedy', () => {
    for (const status of ['differs', 'unreadable', 'missing', 'invalid'] as const) {
      const report = judged(SIX.match, SIX[status])
      expect(contractCheckExitCode(report), status).toBe(1)
      expect(report.failures).toEqual([
        expect.objectContaining({ member: `pkg/${status}`, status }),
      ])
      const [failure] = report.failures
      expect(failure?.message).toContain(`pkg/${status}`)
      expect(failure?.remedy).not.toBe('')
    }
  })

  it('lists every failing member of one run', () => {
    const report = judged(...Object.values(SIX))
    expect(contractCheckExitCode(report)).toBe(1)
    expect(report.failures.map(item => item.status)).toEqual([
      'differs',
      'unreadable',
      'missing',
      'invalid',
    ])
    expect(report.counts).toEqual({
      match: 1,
      differs: 1,
      unreadable: 1,
      missing: 1,
      unbuilt: 1,
      invalid: 1,
    })
  })

  it('refuses output of another shape', () => {
    expect(() => parseCheckRun('not json')).toThrow(IntegrationError)
    expect(() => parseCheckRun(output(member('pkg/x', 'unknown-status')))).toThrow(IntegrationError)
    expect(() => parseCheckRun(JSON.stringify({ members: [] }))).toThrow(IntegrationError)
  })
})

// 起不了进程时的错误码：POSIX 上没有执行位的文件是 EACCES；Windows 不看执行位，非可执行映像按找不到报 ENOENT。
const CANNOT_START = process.platform === 'win32' ? 'ENOENT' : 'EACCES'

describe('the --check process', () => {
  it('throws with the error code when the process cannot start', () => {
    const root = temporary(),
      file = join(root, 'not-executable')
    writeFileSync(file, 'plain text\n', { mode: 0o644 })
    expect(() =>
      runContractCheck({ root, timeoutMs: 60_000, command: { file, args: [] } }),
    ).toThrow(`进程出错（${CANNOT_START}）`)
  })
})

/** Runs `integration contract-check` as `scripts/check.sh` does. */
function cli(root: string) {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      fileURLToPath(new URL('../src/integration/cli.ts', import.meta.url)),
      'contract-check',
      '--root',
      root,
    ],
    { cwd: root, encoding: 'utf8' },
  )
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
/** A Git checkout with the members, their dist and snapshots that match the dist. */
function snapshotted(): string {
  const root = temporary()
  init(root)
  write(root, '.gitignore', 'node_modules/\n')
  contracts(
    root,
    { members: 'docs/lines.json', snapshot: SNAPSHOT_TEMPLATE },
    { lines: [{ id: 'line', contracts: Object.keys(MEMBERS) }] },
  )
  writeSnapshots(root)
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'snapshots'])
  return root
}

describe('integration contract-check with the installed omne-contract-api', () => {
  it(
    'fails when a snapshot differs from the dist and passes after the revert',
    { tags: ['slow'] },
    () => {
      const root = snapshotted()
      const passed = cli(root)
      expect(passed.status, passed.stderr).toBe(0)
      expect(JSON.parse(passed.stdout)).toMatchObject({
        counts: { match: Object.keys(MEMBERS).length },
        failures: [],
      })

      const file = join(root, snapshotOf('pkg/a')),
        original = readFileSync(file, 'utf8')
      writeFileSync(file, original.replace('a: string;', 'a: number;'))
      const failed = cli(root)
      expect(failed.status, failed.stderr).toBe(1)
      expect(JSON.parse(failed.stdout).failures).toEqual([
        expect.objectContaining({ member: 'pkg/a', status: 'differs' }),
      ])
      expect(failed.stderr).toContain('contract-check: differs pkg/a')

      writeFileSync(file, original)
      expect(cli(root).status).toBe(0)
    },
  )

  it('only reports a member without dist', { tags: ['slow'] }, () => {
    const root = snapshotted()
    rmSync(join(root, 'pkg/c/dist'), { recursive: true })
    const result = cli(root)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ unbuilt: ['pkg/c'], failures: [] })
  })

  it('exits 2 when the CLI refuses its configuration', { tags: ['slow'] }, () => {
    const root = snapshotted()
    write(
      root,
      'repo-toolchain.config.json',
      JSON.stringify({ contractApi: { members: 'docs/lines.json', snapshot: 'x', extra: 1 } }),
    )
    const result = cli(root)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
  })
})
