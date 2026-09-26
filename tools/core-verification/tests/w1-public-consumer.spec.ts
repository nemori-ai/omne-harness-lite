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
  'tmp/w1-public-consumers',
  'w1-public-consumers',
)
// 固定施工清单，不从被测程序的结果生成预期。
const caseIds = [
  'w1.kernel.outcome-public',
  'w1.kernel.public-lifecycle',
  'w1.kernel.public-assembly-cleanup',
  'w1.identity.public-values',
  'w1.identity.in-band-closed-input',
  'w1.identity.public-parent-snapshot',
  'w1.identity.public-warrant',
  'w1.offer.public-time-shape',
  'w1.offer.public-evaluation-order',
  'w1.storage.exception-dependencies',
  'w1.storage.public-migrations',
  'w1.content.public-lossless-json',
  'w1.content.public-block-judgment',
  'w1.content.public-metadata-meaning',
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
    'dist/w1-public-consumer.js',
    ...(negativeControl ? ['--negative-control=outcome'] : []),
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
        timeout: 20_000,
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
  const artifact = record(report.consumerArtifact)
  const consumerFile = join(member, 'dist/w1-public-consumer.js')
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
  expect(report.resolution).toHaveLength(5)
  assert.ok(Array.isArray(report.schemas))
  expect(report.schemas).toHaveLength(3)
  const frozen: unknown = JSON.parse(
    await readFile(join(member, '../../.meta_harness/design/registry/frozen.json'), 'utf8'),
  )
  const frozenFiles = record(record(frozen).files)
  for (const [index, name] of ['identity-values', 'offer-expiry', 'content-blocks'].entries()) {
    const schema = record(report.schemas[index])
    const version = name === 'identity-values' ? 'v1' : 'v2'
    const specPath = `spec/data/${name}/${version}/${name}.schema.json`
    const bytes = await readFile(join(member, '../../.meta_harness/design', specPath))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    expect(schema.specifier).toBe(`@omne-harness-lite/${name}/schema`)
    expect(schema.sha256).toBe(sha256)
    expect(sha256).toBe(frozenFiles[specPath])
  }
  return cases
}

it('w1.consumer.built-public-packages', async () => {
  const cases = await consume(false)
  expect(cases.map(item => item.status)).toEqual(caseIds.map(() => 'passed'))
})

it('w1.consumer.detects-wrong-outcome-expectation', async () => {
  const cases = await consume(true)
  expect(cases.filter(item => item.status === 'failed').map(item => item.id)).toEqual([
    'w1.kernel.outcome-public',
  ])
  expect(cases.filter(item => item.status === 'passed')).toHaveLength(caseIds.length - 1)
  const failed = cases.find(item => item.id === 'w1.kernel.outcome-public')
  assert.ok(failed)
  expect(record(failed.error).name).toBe('AssertionError')
  expect(record(failed.error).message).toContain('42')
  expect(record(failed.error).message).toContain('0')
})
