import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { driveRounds, runProcess } from './driver.mjs'
import { syntheticRounds } from './metrics.mjs'

test('driver stops at 200 completed rounds or 10000 actual entries', async () => {
  const fixtures = syntheticRounds('steady')
  let calls = 0
  const next = async round => {
    calls++
    return fixtures[round - 1]
  }
  assert.equal((await driveRounds(next)).length, 200)
  assert.equal(calls, 200)
  calls = 0
  fixtures[4].logEntries = 10000
  assert.equal((await driveRounds(next)).length, 5)
  assert.equal(calls, 5)
})

test('subprocess failure and timeout preserve their distinct facts', async () => {
  const failed = await runProcess(process.execPath, [
    '-e',
    'process.stderr.write("bad");process.exit(7)',
  ])
  assert.equal(failed.exitCode, 7)
  assert.equal(failed.stderr, 'bad')
  assert.equal(failed.cleanup, undefined)
  const timed = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    timeoutMs: 100,
  })
  assert.equal(timed.timedOut, true)
  assert.notEqual(timed.exitCode, 0)
})

test('timeout removes the spawned descendant process', async () => {
  const script = `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'ignore', detached:true, windowsHide:true}); process.stdout.write(String(child.pid)); setInterval(()=>{},1000)`
  const timed = await runProcess(process.execPath, ['-e', script], { timeoutMs: 500 })
  const pid = Number(timed.stdout)
  assert.ok(Number.isSafeInteger(pid) && pid > 0, timed.stderr)
  let cleanupError
  try {
    assert.equal(timed.timedOut, true)
    if (process.platform === 'linux') {
      // A zombie has stopped executing but can await its external reaper.
      try {
        assert.match(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1], /^[ZX] /)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      assert.equal(timed.cleanup.state, 'observed-stopped')
      assert.ok(
        timed.cleanup.processes.some(
          row => row.pid === pid && ['exited', 'zombie'].includes(row.state),
        ),
      )
    } else assert.throws(() => process.kill(pid, 0), /ESRCH/)
  } finally {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') cleanupError = error
    }
  }
  assert.equal(cleanupError, undefined)
})
