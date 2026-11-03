import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { launchProcess } from './driver.mjs'

function posixModel(t, { unavailable = false } = {}) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  const rows = new Map([[101, { parent: 1, state: 'S', identity: 'original-root' }]])
  const sent = []
  const reads = []
  let scans = 0
  let capturing = true
  const child = Object.assign(new EventEmitter(), {
    pid: 101,
    exitCode: null,
    signalCode: null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => assert.fail('unverified root fallback'),
  })
  Object.defineProperty(process, 'platform', { value: 'linux' })
  const originalRead = fs.readFileSync
  const originalDirectory = fs.readdirSync
  t.mock.method(fs, 'readFileSync', (path, ...args) => {
    const match = /^\/proc\/(\d+)\/stat$/.exec(String(path))
    if (!match) return originalRead(path, ...args)
    reads.push(Number(match[1]))
    if (unavailable && capturing) throw new Error('root identity unavailable')
    const row = rows.get(Number(match[1]))
    if (!row) throw Object.assign(new Error('gone'), { code: 'ENOENT' })
    const fields = Array(20).fill('0')
    fields[0] = row.state
    fields[1] = String(row.parent)
    fields[19] = row.identity
    return `${match[1]} (fixture) ${fields.join(' ')}`
  })
  t.mock.method(fs, 'readdirSync', (path, ...args) => {
    if (path !== '/proc') return originalDirectory(path, ...args)
    scans++
    return [...rows.keys()].map(String)
  })
  t.mock.method(childProcess, 'spawn', () => child)
  t.mock.method(process, 'kill', (pid, name) => {
    sent.push({ pid, name })
    if (name === 'SIGKILL') rows.delete(pid)
  })
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    Object.defineProperty(process, 'platform', platform)
    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
  })
  return {
    child,
    rows,
    sent,
    reads,
    scans: () => scans,
    finishCapture: () => {
      capturing = false
    },
  }
}

test('driver captures only the root at spawn and does not scan a normally completed process', async t => {
  const model = posixModel(t)
  const { done } = launchProcess('fixture', [], { timeoutMs: 1000 })
  model.child.exitCode = 0
  model.child.emit('close', 0, null)
  const result = await done
  assert.equal(result.exitCode, 0)
  assert.equal(result.cleanup, undefined)
  assert.deepEqual(model.reads, [101])
  assert.equal(model.scans(), 0)
  assert.deepEqual(model.sent, [])
})

for (const unavailable of [false, true]) {
  test(`driver keeps reused PID owners untouched after root exit with open pipes (capture unavailable: ${unavailable})`, async t => {
    const model = posixModel(t, { unavailable })
    const { done } = launchProcess('fixture', [], { timeoutMs: 10 })
    model.finishCapture()
    model.child.exitCode = 0
    model.child.emit('exit', 0, null)
    model.rows.set(101, { parent: 1, state: 'S', identity: 'unrelated-reused-root' })
    model.rows.set(102, { parent: 101, state: 'S', identity: 'unrelated-child' })
    const close = setTimeout(() => model.child.emit('close', 0, null), 50)
    t.after(() => clearTimeout(close))
    const result = await done
    assert.equal(result.timedOut, true)
    assert.equal(result.cleanup.state, 'incomplete')
    assert.equal(result.cleanup.unobservedDescendants, 'unknown')
    assert.ok(result.cleanup.errors.length > 0)
    assert.deepEqual(model.sent, [])
    assert.deepEqual([...model.rows.keys()], [101, 102])
    assert.ok(result.elapsedMs < 1000)
  })
}
