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
  'tmp/w6-core-verification/asset-consumers',
  'asset-consumers',
)
// 固定施工清单，不从被测程序的结果生成预期。
const caseIds = [
  'w6.asset.five-real-ports',
  'w6.asset.body-rejections',
  'w6.asset.layer-lock-and-setting-discontinuity',
  'w6.asset.workspace-normalized-skill-reading',
  'w6.asset.mcp-schema-execution-boundary',
  'w6.asset.reserved-and-duplicate-real-body',
  'w6.asset.nonconnector-record-domain',
  'w6.asset.scope-identity-and-billing',
  'w6.skill.slash-expansion-to-messages',
  'w6.messages.nested-unique-boundary',
  'w6.messages.nested-readability-and-compaction',
  'w6.tool.result-to-content',
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
    'dist/w6-asset-consumer.js',
    ...(negativeControl ? ['--negative-control=workspace-permissions'] : []),
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
  const artifact = record(report.consumerArtifact)
  const consumerFile = join(member, 'dist/w6-asset-consumer.js')
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
  expect(report.resolution).toHaveLength(11)
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

it('w6.consumer.five-real-body-ports-to-evaluation', async () => {
  const cases = await consume(false)
  expect(cases.map(item => item.status)).toEqual(caseIds.map(() => 'passed'))
}, 100_000)

it('w6.consumer.detects-wrong-workspace-permission-expectation', async () => {
  const cases = await consume(true)
  expect(cases.filter(item => item.status === 'failed').map(item => item.id)).toEqual([
    'w6.asset.workspace-normalized-skill-reading',
  ])
  expect(cases.filter(item => item.status === 'passed')).toHaveLength(caseIds.length - 1)
  const failed = cases.find(item => item.id === 'w6.asset.workspace-normalized-skill-reading')
  assert.ok(failed)
  expect(record(failed.error).name).toBe('AssertionError')
  expect(record(failed.error).message).toContain('self')
  expect(record(failed.error).message).toContain('member')
}, 100_000)
