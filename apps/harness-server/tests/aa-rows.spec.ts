import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const member = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))
const SCRIPT = member('scripts/aa-rows.mjs')
const FORMAL_AA = member('../../docs/architecture/runtime/application-assembly.md')
const FORMAL_ROWS = member('src/s0/aa-rows.json')
const fixture = (name: string): string => member(`tests/fixtures/aa/${name}`)

type Run = { status: number | null; stdout: string; stderr: string }

function run(command: 'check' | 'write', aa: string, rows: string): Run {
  const result = spawnSync(process.execPath, [SCRIPT, command, '--aa', aa, '--rows', rows], {
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

let scratch: string
let baseRows: string

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'aa-rows-')))
  baseRows = join(scratch, 'base.rows.json')
  expect(run('write', fixture('base.md'), baseRows).status).toBe(0)
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('AA row snapshot', () => {
  test('R-P1 the formal AA matches the committed snapshot', () => {
    const result = run('check', FORMAL_AA, FORMAL_ROWS)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^aa-rows: ok rows=\d+ trusted=(\d+|none)\n$/)
  })

  test('R-P2 write then check agrees, and a second write keeps the bytes', () => {
    expect(run('check', fixture('base.md'), baseRows).status).toBe(0)
    const before = readFileSync(baseRows)
    expect(run('write', fixture('base.md'), baseRows).status).toBe(0)
    expect(readFileSync(baseRows).equals(before)).toBe(true)
  })

  test('R-P2 the committed fixture snapshot is what write produces', () => {
    const committed = readFileSync(fixture('base.rows.json'))
    expect(committed.equals(readFileSync(baseRows))).toBe(true)
  })

  test('the snapshot is canonical JSON: two-space indent, trailing newline', () => {
    const text = readFileSync(baseRows, 'utf8')
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
    expect(JSON.parse(text)).toEqual({
      source: 'docs/architecture/runtime/application-assembly.md',
      rows: ['storage', 'identity', 'server-entry'],
      trusted: [{ row: 'storage', names: ['storage', 'tenantDomainLookup'] }],
    })
  })

  test('a table outside the plugin-tree section is not read as rows', () => {
    expect(readFileSync(baseRows, 'utf8')).not.toContain('not-a-row')
  })

  test('a snapshot without a trusted table prints trusted=none', () => {
    const aa = join(scratch, 'no-trusted.md')
    const text = readFileSync(fixture('base.md'), 'utf8').replace(
      /### 受信子树[\s\S]*?(?=## 缺口)/,
      '',
    )
    writeFileSync(aa, text)
    const rows = join(scratch, 'no-trusted.rows.json')
    expect(run('write', aa, rows).status).toBe(0)
    expect(JSON.parse(readFileSync(rows, 'utf8')).trusted).toBeNull()
    const result = run('check', aa, rows)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('aa-rows: ok rows=3 trusted=none\n')
  })

  test('R-N1 an extra AA row is reported with +id', () => {
    const result = run('check', fixture('extra-row.md'), baseRows)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/^aa-rows: mismatch\n/)
    expect(result.stderr).toContain('+extra-row')
  })

  test('R-N2 a missing AA row is reported with -id', () => {
    const result = run('check', fixture('missing-row.md'), baseRows)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('-identity')
  })

  test('R-N3 the same rows in another order are reported with order', () => {
    const result = run('check', fixture('reordered.md'), baseRows)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('order 0 aa=identity rows=storage')
  })

  test('R-N4 a renamed row with an unchanged count reports both sides', () => {
    const result = run('check', fixture('renamed.md'), baseRows)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('+entry')
    expect(result.stderr).toContain('-server-entry')
  })

  test('R-N5 a changed trusted name list is reported with scope', () => {
    const result = run('check', fixture('scope-changed.md'), baseRows)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('scope storage aa=storage rows=storage,tenantDomainLookup')
  })

  test.each(['no-section.md', 'bad-id-cell.md', 'duplicate-id.md', 'trusted-unknown-row.md'])(
    'R-N6 %s is a parse error with exit 2',
    name => {
      const check = run('check', fixture(name), baseRows)
      expect(check.status).toBe(2)
      expect(check.stderr).toMatch(/^aa-rows: parse .+ line \d+\n$/)
      const target = join(scratch, `${name}.json`)
      copyFileSync(baseRows, target)
      const write = run('write', fixture(name), target)
      expect(write.status).toBe(2)
      expect(readFileSync(target).equals(readFileSync(baseRows))).toBe(true)
    },
  )
})
