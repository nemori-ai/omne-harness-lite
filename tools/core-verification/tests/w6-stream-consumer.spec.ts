import { evidencePath } from '../src/evidence-path.ts'
import assert from 'node:assert/strict'
import { execFile, execFileSync, type ExecFileException } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const member = fileURLToPath(new URL('../', import.meta.url))
const evidenceRoot = evidencePath(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'tmp/w6-core-verification/stream-consumers',
  'stream-consumers',
)
// 固定施工清单，不从被测程序的结果生成预期。
const caseIds = [
  'w6.stream.duplicate-parameters-versus-outer-text',
  'w6.stream.lossless-numbers-and-opaque-arguments',
  'w6.stream.bad-name-retained-as-unparseable',
  'w6.stream.cut-incomplete-versus-safe-merge',
  'w6.stream.decoded-voice-split-invariance',
  'w6.stream.tool-frame-replace-and-account',
  'w6.stream.trim-pairing-and-frame-formulas',
  'w6.stream.reported-and-unknown-accounts',
  'w6.stream.refusal-priority-and-historical-state',
  'w6.stream.snapshot-value-and-branching',
  'w6.stream.nested-message-identity-boundary',
  'w6.stream.model-settlement-shapes',
  'w6.stream.lost-failure-delivered-and-in-band',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value))
  return value
}

async function consume(negativeControl: boolean) {
  await mkdir(evidenceRoot, { recursive: true })
  const directory = await mkdtemp(join(evidenceRoot, negativeControl ? 'negative-' : 'normal-'))
  const arguments_ = [
    'dist/w6-stream-consumer.js',
    ...(negativeControl ? ['--negative-control=frame-count'] : []),
  ]
  const result = await new Promise<{
    error: ExecFileException | null
    stdout: string
    stderr: string
  }>(resolve => {
    execFile(
      process.execPath,
      arguments_,
      {
        cwd: member,
        env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
        timeout: 90_000,
        maxBuffer: 2_000_000,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    )
  })
  const execution = {
    executable: process.execPath,
    arguments: arguments_,
    cwd: member,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: member,
      encoding: 'utf8',
    }).trim(),
    nodeVersion: process.version,
    negativeControl,
    code: result.error === null ? 0 : result.error.code,
    signal: result.error?.signal ?? null,
    killed: result.error?.killed ?? false,
  }
  await Promise.all([
    writeFile(join(directory, 'stdout.log'), result.stdout),
    writeFile(join(directory, 'stderr.log'), result.stderr),
    writeFile(join(directory, 'execution.json'), JSON.stringify(execution, null, 2) + '\n'),
  ])
  expect(execution.killed, 'timeout cannot satisfy a negative control').toBe(false)
  expect(execution.signal, 'a signal cannot satisfy a negative control').toBeNull()
  expect(execution.code).toBe(negativeControl ? 1 : 0)
  const parsed: unknown = JSON.parse(result.stdout)
  await writeFile(join(directory, 'report.json'), JSON.stringify(parsed, null, 2) + '\n')
  const report = record(parsed)
  expect(report.specEpoch).toBe(3)
  expect(report.packedConsumer).toBe(false)
  const artifact = record(report.consumerArtifact)
  const consumerFile = join(member, 'dist/w6-stream-consumer.js')
  expect(artifact.file).toBe(consumerFile)
  expect(artifact.sha256).toBe(
    createHash('sha256')
      .update(await readFile(consumerFile))
      .digest('hex'),
  )
  assert.ok(Array.isArray(report.cases))
  const cases = report.cases.map((item: unknown) => record(item))
  expect(cases.map(item => item.id)).toEqual(caseIds)
  expect(report.negativeControl).toBe(negativeControl)
  assert.ok(Array.isArray(report.resolution))
  expect(report.resolution).toHaveLength(6)
  for (const item of report.resolution) {
    const artifact = record(item)
    assert.ok(typeof artifact.file === 'string')
    expect(artifact.sha256).toBe(
      createHash('sha256')
        .update(await readFile(artifact.file))
        .digest('hex'),
    )
  }
  return cases
}

it('w6.consumer.actual-stream-to-messages-and-model-response', async () => {
  const cases = await consume(false)
  expect(cases.map(item => item.status)).toEqual(caseIds.map(() => 'passed'))
}, 100_000)

it('w6.consumer.detects-wrong-stream-frame-count', async () => {
  const cases = await consume(true)
  expect(cases.filter(item => item.status === 'failed').map(item => item.id)).toEqual([
    'w6.stream.tool-frame-replace-and-account',
  ])
  expect(cases.filter(item => item.status === 'passed')).toHaveLength(caseIds.length - 1)
  const failed = cases.find(item => item.id === 'w6.stream.tool-frame-replace-and-account')
  assert.ok(failed)
  expect(record(failed.error).name).toBe('AssertionError')
  expect(record(failed.error).message).toContain(
    'SA3 S-13: accepted eight frames + one merged frame = 9',
  )
  expect(record(failed.error).message).toContain('9')
  expect(record(failed.error).message).toContain('10')
}, 100_000)
