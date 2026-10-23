// @module-tag slow
// The complete finite graph and negative controls run in child processes.
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

const source = fileURLToPath(new URL('./protocol-model/', import.meta.url))
const supervisor = fileURLToPath(new URL('./helpers/protocol-model-runner.mjs', import.meta.url))
const evidenceRoot = fileURLToPath(
  new URL('../../../../tmp/model-contract-protocol/', import.meta.url),
)
function sourceSnapshot() {
  return Object.fromEntries(
    readdirSync(source)
      .sort()
      .map(name => [
        name,
        createHash('sha256')
          .update(readFileSync(join(source, name)))
          .digest('hex'),
      ]),
  )
}
function absent(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return true
    throw error
  }
}

test('checks the complete result delivery protocol model', async () => {
  const before = sourceSnapshot()
  mkdirSync(evidenceRoot, { recursive: true })
  const directory = realpathSync(mkdtempSync(join(evidenceRoot, 'run-')))
  const target = join(directory, 'model')
  const child = fork(supervisor, [source, target], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const output: Buffer[] = []
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk))
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk))
  let timer: ReturnType<typeof setTimeout> | undefined
  let passed = false
  try {
    const result = await new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        timer = setTimeout(() => reject(new Error('supervisor-close-deadline')), 100000)
        child.once('error', reject)
        child.once('close', (code, signal) => resolve({ code, signal }))
      },
    )
    assert.deepEqual(result, { code: 0, signal: null }, Buffer.concat(output).toString())
    const summary: unknown = JSON.parse(readFileSync(`${target}.supervisor.json`, 'utf8'))
    assert.ok(
      summary &&
        typeof summary === 'object' &&
        'status' in summary &&
        'runs' in summary &&
        'pid' in summary,
    )
    assert.equal(summary.status, 'passed')
    assert.equal(summary.runs, 42)
    assert.ok(
      typeof summary.pid === 'number' && Number.isSafeInteger(summary.pid) && summary.pid > 1,
    )
    const deadline = performance.now() + 2000
    while (!absent(-summary.pid)) {
      assert.ok(performance.now() < deadline, 'model process group remained')
      await delay(20)
    }
    assert.ok(absent(summary.pid))
    assert.ok(child.pid && absent(child.pid))
    assert.deepEqual(sourceSnapshot(), before)
    console.log(
      JSON.stringify({
        summary,
        supervisorPid: child.pid,
        groupAbsent: true,
        sourceUnchanged: true,
      }),
    )
    passed = true
  } catch (error) {
    throw new Error(`Protocol evidence retained at ${directory}`, { cause: error })
  } finally {
    clearTimeout(timer)
    if (child.connected) child.disconnect()
    try {
      if (!passed) {
        writeFileSync(join(directory, 'supervisor.log'), Buffer.concat(output))
        const deadline = performance.now() + 4000
        while (child.pid && !absent(child.pid)) {
          assert.ok(
            performance.now() < deadline,
            `Supervisor cleanup failed; evidence at ${directory}`,
          )
          await delay(20)
        }
        if (existsSync(`${target}.supervisor.json`)) {
          const cleanup: unknown = JSON.parse(readFileSync(`${target}.supervisor.json`, 'utf8'))
          if (cleanup && typeof cleanup === 'object' && 'pid' in cleanup) {
            assert.ok(
              typeof cleanup.pid === 'number' &&
                Number.isSafeInteger(cleanup.pid) &&
                cleanup.pid > 1,
            )
            while (!absent(-cleanup.pid)) {
              assert.ok(
                performance.now() < deadline,
                `Model cleanup failed; evidence at ${directory}`,
              )
              await delay(20)
            }
          }
        }
      }
    } finally {
      child.stdout?.destroy()
      child.stderr?.destroy()
    }
    if (passed) rmSync(directory, { recursive: true, force: true })
  }
})
