import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { writeArchive, readArchive, compareArchives } from './archive.mjs'
import { syntheticRounds } from './metrics.mjs'
import { runProcess } from './driver.mjs'

const base = resolve('tmp/line-m2-toolchain/w2/e9')
mkdirSync(base, { recursive: true })
const metadata = {
  sha: 'a'.repeat(40),
  platform: 'win32',
  osVersion: 'test',
  node: 'v26',
  cores: 4,
  slot: { state: 'unheld', reason: 'synthetic' },
  workload: { kind: 'synthetic', modelDelayMs: 10, toolDelayMs: 10 },
}

test('archive round trips absolute measurements and exports offline charts', () => {
  const dir = mkdtempSync(join(base, 'archive-test-'))
  try {
    writeArchive(dir, metadata, syntheticRounds('steady'))
    const archive = readArchive(dir)
    assert.equal(archive.summary.median.state, 'pass')
    assert.equal(archive.summary.state, 'blocked')
    assert.equal(archive.rounds.length, 200)
    assert.match(readFileSync(join(dir, 'curves.svg'), 'utf8'), /sessionIO/)
    assert.doesNotMatch(readFileSync(join(dir, 'curves.html'), 'utf8'), /https?:\/\//)
    assert.throws(() => writeArchive(dir, metadata, []), /exist/)
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'))
    summary.median.state = 'fail'
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary))
    assert.throws(() => readArchive(dir), /summary/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('comparison rejects different workloads and missing measurements', () => {
  const archive = { summary: { metadata }, rounds: syntheticRounds('steady') }
  assert.equal(compareArchives(archive, archive).state, 'comparable')
  const other = structuredClone(archive)
  other.summary.metadata.workload.modelDelayMs = 30
  assert.equal(compareArchives(archive, other).state, 'incomparable')
  assert.equal(compareArchives(archive, { ...archive, rounds: [] }).state, 'incomparable')
})

test('CLI selftest asserts synthetic controls and rejects invalid threshold before writing', async () => {
  const dir = mkdtempSync(join(base, 'cli-test-'))
  try {
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
    const run = await runProcess(process.execPath, [
      cli,
      'selftest',
      '--out',
      join(dir, 'selftest'),
    ])
    assert.equal(run.exitCode, 0, run.stderr)
    assert.match(run.stdout, /synthetic/)
    const invalid = await runProcess(process.execPath, [
      cli,
      'run',
      '--root',
      '.',
      '--out',
      join(dir, 'invalid'),
      '--threshold',
      'NaN',
    ])
    assert.equal(invalid.exitCode, 2)
    assert.match(invalid.stderr, /threshold/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})
