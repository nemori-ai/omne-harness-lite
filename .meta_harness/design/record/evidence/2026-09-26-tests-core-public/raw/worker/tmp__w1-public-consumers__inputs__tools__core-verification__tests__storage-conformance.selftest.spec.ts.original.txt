import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ForeignKeyMode } from '../src/storage-fixture.ts'

const memberDirectory = fileURLToPath(new URL('../', import.meta.url))
const evidenceDirectory = fileURLToPath(new URL('../../../tmp/core-verification/', import.meta.url))
const vitestCli = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
)

interface AssertionResult {
  readonly fullName: string
  readonly status: string
  readonly failureMessages: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('invalid machine report: expected an object')
  return value
}

function assertions(value: unknown): AssertionResult[] {
  const report = record(value)
  if (!Array.isArray(report.testResults))
    throw new Error('invalid machine report: no testResults array')
  return report.testResults.flatMap((result: unknown) => {
    const suite = record(result)
    if (!Array.isArray(suite.assertionResults))
      throw new Error('invalid machine report: no assertionResults array')
    return suite.assertionResults.map((assertion: unknown) => {
      const item = record(assertion)
      if (
        typeof item.fullName !== 'string' ||
        typeof item.status !== 'string' ||
        !Array.isArray(item.failureMessages) ||
        !item.failureMessages.every((message: unknown) => typeof message === 'string')
      )
        throw new Error('invalid machine report: malformed assertion')
      return {
        fullName: item.fullName,
        status: item.status,
        failureMessages: item.failureMessages,
      }
    })
  })
}

async function runConformance(mode: ForeignKeyMode) {
  await mkdir(evidenceDirectory, { recursive: true })
  const directory = await mkdtemp(join(evidenceDirectory, mode + '-'))
  const databaseDirectory = join(directory, 'database')
  await mkdir(databaseDirectory, { mode: 0o700 })
  const reportFile = join(directory, 'report.json')
  const arguments_ = [
    vitestCli,
    'run',
    '--config',
    'fixtures/vitest.storage-conformance.config.ts',
    '--no-color',
  ]
  const child = spawn(process.execPath, arguments_, {
    cwd: memberDirectory,
    detached: process.platform !== 'win32',
    env: {
      PATH: process.env.PATH ?? '',
      NO_COLOR: '1',
      OMNE_CONFORMANCE_DIRECTORY: databaseDirectory,
      OMNE_CONFORMANCE_FOREIGN_KEYS: mode,
      OMNE_CONFORMANCE_REPORT: reportFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk
  })
  const timer = setTimeout(() => {
    timedOut = true
    try {
      if (process.platform !== 'win32' && child.pid !== undefined)
        process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch (error) {
      stderr += '\nOwned process group termination failed: ' + String(error)
    }
  }, 25_000)

  try {
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => resolve({ code, signal }))
      },
    )
    clearTimeout(timer)
    await Promise.all([
      writeFile(join(directory, 'stdout.log'), stdout),
      writeFile(join(directory, 'stderr.log'), stderr),
      writeFile(
        join(directory, 'execution.json'),
        JSON.stringify(
          {
            executable: process.execPath,
            arguments: arguments_,
            cwd: memberDirectory,
            sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
              cwd: memberDirectory,
              encoding: 'utf8',
            }).trim(),
            nodeVersion: process.version,
            sqliteVersion: process.versions.sqlite,
            mode,
            ...exit,
            timedOut,
          },
          null,
          2,
        ),
      ),
    ])
    expect(timedOut, 'child timeout is not a conformance failure').toBe(false)
    expect(exit.signal, 'child signal is not a conformance failure').toBeNull()
    const report: unknown = JSON.parse(await readFile(reportFile, 'utf8'))
    const machineReport = record(report)
    if (!Array.isArray(machineReport.testResults))
      throw new Error('invalid machine report: no testResults array')
    expect(machineReport.testResults).toHaveLength(1)
    expect(record(machineReport.testResults[0]).message).toBe('')
    expect(machineReport.numPendingTestSuites).toBe(0)
    expect(machineReport.numTodoTests).toBe(0)
    const observation: unknown = JSON.parse(
      await readFile(join(databaseDirectory, 'fixture.json'), 'utf8'),
    )
    await writeFile(join(directory, 'fixture.json'), JSON.stringify(observation, null, 2))
    return {
      exit,
      report: machineReport,
      assertions: assertions(report),
      observation: record(observation),
    }
  } finally {
    clearTimeout(timer)
    // Only this invocation's private database directory is disposable; evidence survives.
    await rm(databaseDirectory, { recursive: true, force: true })
  }
}

describe('storage conformance suite effectiveness (real SQLite)', () => {
  it('storage.conformance.real-sqlite: the unmodified public provider passes every case', async () => {
    const result = await runConformance('enabled')
    expect(result.exit.code).toBe(0)
    expect(result.report.success).toBe(true)
    expect(result.report.numTotalTests).toBe(19)
    expect(result.report.numPassedTests).toBe(19)
    expect(result.report.numFailedTests).toBe(0)
    expect(result.report.numPendingTests).toBe(0)
    expect(result.assertions).toHaveLength(19)
    expect(result.assertions.every(assertion => assertion.status === 'passed')).toBe(true)
    expect(result.observation.mode).toBe('enabled')
    expect(result.observation.foreignKeysDisabledObservations).toBe(0)
  })

  it('storage.conformance.detects-disabled-foreign-keys: C-11/C-12 fail their real assertions', async () => {
    const result = await runConformance('disabled')
    expect(result.exit.code).toBe(1)
    expect(result.report.success).toBe(false)
    expect(result.report.numTotalTests).toBe(19)
    expect(result.report.numPassedTests).toBe(17)
    expect(result.report.numFailedTests).toBe(2)
    expect(result.report.numPendingTests).toBe(0)
    expect(result.assertions).toHaveLength(19)
    const failures = result.assertions.filter(assertion => assertion.status === 'failed')
    expect(failures.map(assertion => assertion.fullName)).toEqual([
      expect.stringContaining('C-11 删除被引用的父行'),
      expect.stringContaining('C-12 插入指向不存在目标'),
    ])
    for (const failure of failures) {
      expect(failure.failureMessages.join('\n')).toMatch(
        /expected undefined to be an instance of ReferenceViolation/,
      )
    }
    expect(result.assertions.filter(assertion => assertion.status === 'passed')).toHaveLength(17)
    expect(result.observation.mode).toBe('disabled')
    expect(result.observation.foreignKeysDisabledObservations).toBeTypeOf('number')
    expect(result.observation.foreignKeysDisabledObservations).toBeGreaterThan(0)
  })
})
