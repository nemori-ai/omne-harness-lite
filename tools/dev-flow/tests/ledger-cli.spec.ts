// Each case runs ledger-cli.ts as a child process; one run takes about 0.2 s, so the file stays
// in the fast tier.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CARD_COLUMNS,
  LEDGER_VERSION,
  LINE_COLUMNS,
  MILESTONE_COLUMNS,
  WAVE_COLUMNS,
} from '../src/ledger/derive.ts'

const homes: string[] = []
afterEach(() => homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true })))
const cli = fileURLToPath(new URL('../src/ledger/ledger-cli.ts', import.meta.url))
const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/ledger/${name}`, import.meta.url))
function run(args: string[]) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', NO_COLOR: '1' },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
const header = (text: string) => text.split('\r\n')[0]

describe('ledger-cli derive', () => {
  it('writes the four tables and the meta file and exits 0', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-ledger-cli-')))
    homes.push(home)
    const out = join(home, 'm1.5')
    const result = run([
      'derive',
      '--capture',
      fixture('capture.json'),
      '--admission',
      fixture('admission'),
      '--slots',
      fixture('slots.jsonl'),
      '--board',
      fixture('board.json'),
      '--milestone',
      'M1.5',
      '--out',
      out,
    ])
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'ledger-derived',
      cards: 3,
      waves: 2,
      lines: 2,
    })
    const read = (name: string) => readFileSync(join(out, name), 'utf8')
    expect(header(read('cards.csv'))).toBe(CARD_COLUMNS.join(','))
    expect(header(read('waves.csv'))).toBe(WAVE_COLUMNS.join(','))
    expect(header(read('milestone.csv'))).toBe(MILESTONE_COLUMNS.join(','))
    expect(header(read('lines.csv'))).toBe(LINE_COLUMNS.join(','))
    expect(read('cards.csv').split('\r\n')).toHaveLength(5)
    const meta: unknown = JSON.parse(read('ledger-meta.json'))
    expect(meta).toMatchObject({ version: LEDGER_VERSION, unmappedAdmissionRuns: 1 })
  })

  it('exits 2 with one error line and no output files when --capture is missing', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-ledger-cli-')))
    homes.push(home)
    const out = join(home, 'out')
    const result = run(['derive', '--out', out])
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr.trimEnd().split('\n')).toHaveLength(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'ledger-error',
      message: expect.stringMatching(/^Usage: ledger-cli\.ts derive/),
    })
    expect(existsSync(out)).toBe(false)
  })

  it('exits 2 and names the file when the capture cannot be read', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-ledger-cli-')))
    homes.push(home)
    const result = run(['derive', '--capture', join(home, 'absent.json'), '--out', home])
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toMatchObject({
      kind: 'ledger-error',
      message: expect.stringContaining('absent.json: cannot read (ENOENT)'),
    })
  })
})
