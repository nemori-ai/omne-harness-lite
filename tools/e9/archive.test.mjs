import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { writeArchive, readArchive, compareArchives } from './archive.mjs'
import { STAGES, measured, syntheticRounds } from './metrics.mjs'
import { runProcess } from './driver.mjs'

const base = resolve('tmp/line-m2-toolchain/w2/e9-hardening')
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
    assert.equal(archive.summary.state, 'pass')
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
  const rounds = syntheticRounds('steady')
  const dir = mkdtempSync(join(base, 'compare-test-'))
  const archive = { summary: writeArchive(dir, metadata, rounds), rounds }
  rmSync(dir, { recursive: true })
  assert.equal(compareArchives(archive, archive).state, 'comparable')
  const other = structuredClone(archive)
  other.summary.metadata.workload.modelDelayMs = 30
  assert.equal(compareArchives(archive, other).state, 'incomparable')
  assert.equal(compareArchives(archive, { ...archive, rounds: [] }).state, 'incomparable')
  for (const [field, value] of [
    ['threshold', 2],
    ['method', { definitionId: 'other' }],
  ]) {
    const changed = structuredClone(archive)
    changed.summary[field] = value
    assert.equal(compareArchives(archive, changed).state, 'incomparable')
  }
  const clocks = structuredClone(archive)
  clocks.rounds[50].stageClocks.sessionIO.clockId = 'other-clock'
  assert.equal(compareArchives(archive, clocks).state, 'incomparable')
  const delay = structuredClone(archive)
  delay.rounds[50].externalWaits = [{ provider: 'model', definedDelayMs: 999 }]
  assert.equal(compareArchives(archive, delay).state, 'incomparable')
})

for (const stage of STAGES) {
  test(`single-stage growth ${stage} fails despite a constant aggregate median`, () => {
    const dir = mkdtempSync(join(base, 'single-stage-'))
    try {
      const rounds = syntheticRounds('steady')
      for (const row of rounds) {
        for (const key of STAGES)
          row.stages[key] = measured(key === stage ? row.round : 10000, 'ms', 'synthetic')
      }
      const summary = writeArchive(dir, metadata, rounds)
      assert.equal(summary.median.ratio, 1)
      assert.equal(summary.median.state, 'pass')
      assert.equal(summary.growth[stage].state, 'fail')
      assert.equal(summary.state, 'fail')
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
}

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
