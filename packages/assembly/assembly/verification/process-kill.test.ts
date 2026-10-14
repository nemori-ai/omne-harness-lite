import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

test('killing the process during close writes no report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'close-kill-'))
  const reportPath = join(dir, 'report.json')
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', join(here, 'hold-close.ts'), reportPath],
    { cwd: here, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let exitedEarly = false
  const started = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not start')), 5000)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!String(chunk).includes('started')) return
      clearTimeout(timer)
      resolve()
    })
    child.once('exit', () => {
      exitedEarly = true
      clearTimeout(timer)
      reject(new Error('child exited before start'))
    })
  })
  await started
  assert.equal(exitedEarly, false)
  child.kill('SIGKILL')
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }))
    },
  )
  assert.equal(outcome.signal, 'SIGKILL')
  assert.equal(existsSync(reportPath), false)
})
