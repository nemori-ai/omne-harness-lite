import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { slotDeadline } from './deadlines.mjs'
import { execute } from './process.mjs'

function directory(t) {
  const work = resolve(
    process.env.PLATFORM_CONFORMANCE_TEST_TMP ?? 'tmp/line-m2-toolchain/w2/platform',
  )
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'deadlines-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('stalled slot wrapper has a finite queue deadline independent of child timeout', async t => {
  const dir = directory(t)
  const deadline = slotDeadline({ out: join(dir, 'out'), timeoutMs: 50 }, 300, {
    OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '0',
    OMNE_TEST_SLOT_POLL_SECONDS: '1',
  })
  try {
    const result = await execute([process.execPath, '-e', 'setInterval(()=>{},1000)'], {
      deadline: deadline.read,
      env: deadline.env,
    })
    assert.equal(result.interrupted, 'timeout')
    assert.equal(result.deadline.phase, 'slot-wait')
    assert.equal(result.deadline.timeoutMs, 1000)
    assert.ok(result.deadline.remainingMs <= 0)
  } finally {
    deadline.close()
  }
  assert.deepEqual(readdirSync(dir), [])
})

test('unreadable deadline evidence stops the owned process and retains its error', async t => {
  const dir = directory(t)
  const deadline = slotDeadline({ out: join(dir, 'out') }, 300)
  const path = deadline.env.OMNE_PLATFORM_DEADLINE_FILE
  writeFileSync(path, '{malformed}\n')
  try {
    const result = await execute([process.execPath, '-e', 'setInterval(()=>{},1000)'], {
      deadline: deadline.read,
    })
    assert.equal(result.interrupted, 'deadline-unavailable')
    assert.ok(result.deadlineError)
    assert.ok('code' in result)
  } finally {
    deadline.close()
  }
})

test('complete JSON with invalid stage fields cannot disable the deadline', async t => {
  for (const record of [
    {},
    { phase: 'unknown', startedAt: 1, timeoutMs: 1 },
    { phase: 'runner', startedAt: -1, timeoutMs: 1 },
    { phase: 'runner', startedAt: 1, timeoutMs: -1 },
    { phase: 'runner', startedAt: '1', timeoutMs: 1 },
  ]) {
    const dir = directory(t)
    const deadline = slotDeadline({ out: join(dir, 'out') }, 100)
    writeFileSync(deadline.env.OMNE_PLATFORM_DEADLINE_FILE, JSON.stringify(record) + '\n')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
      const result = await execute([process.execPath, '-e', 'setInterval(()=>{},1000)'], {
        deadline: deadline.read,
        signal: controller.signal,
      })
      assert.equal(result.interrupted, 'deadline-unavailable')
      assert.match(result.deadlineError, /stage/i)
    } finally {
      clearTimeout(timer)
      deadline.close()
    }
  }
})
