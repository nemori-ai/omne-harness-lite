import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const scripts = ['model.mjs', 'self-test.mjs', 'knowledge-test.mjs', 'boundary-test.mjs', 'run.mjs']
const [sourceArgument, targetArgument, durationArgument = '90000'] = process.argv.slice(2)
const source = resolve(sourceArgument)
const target = resolve(targetArgument)
const duration = Number(durationArgument)
let child
let failure
let finished = false
let groupStopped = false
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const sourceHashes = () => Object.fromEntries(scripts.map(name => [name, hash(join(source, name))]))
const report = { status: 'running', source, target, runs: 0, cleanup: [] }
let original

function killGroup() {
  if (!child?.pid || groupStopped) return
  try {
    process.kill(-child.pid, 'SIGKILL')
    groupStopped = true
    report.cleanup.push({ pid: child.pid, group: true, signal: 'SIGKILL', result: 'sent' })
  } catch (error) {
    report.cleanup.push({ pid: child.pid, group: true, signal: 'SIGKILL', result: error.code })
    if (error.code === 'ESRCH') groupStopped = true
    else {
      report.cleanupError = `group-cleanup-failed: ${error.code}`
      failure ??= report.cleanupError
    }
  }
}
function stop(reason) {
  failure ??= reason
  killGroup()
}
process.once('disconnect', () => stop('parent-disconnected'))
process.once('SIGTERM', () => stop('supervisor-SIGTERM'))
process.once('SIGINT', () => stop('supervisor-SIGINT'))
process.once('exit', () => {
  if (!finished) killGroup()
})

try {
  assert.notEqual(process.platform, 'win32', 'POSIX process groups are required')
  assert.ok(Number.isSafeInteger(duration) && duration > 0 && duration <= 90000)
  assert.notEqual(source, target)
  mkdirSync(target, { recursive: false })
  original = sourceHashes()
  for (const name of scripts) copyFileSync(join(source, name), join(target, name))
  const copied = Object.fromEntries(scripts.map(name => [name, hash(join(target, name))]))
  assert.deepEqual(copied, original)
  const output = { stdout: [], stderr: [] }
  let bytes = 0
  if (process.connected === false) stop('parent-disconnected')
  if (failure) throw new Error(failure)
  child = spawn(process.execPath, [join(target, 'run.mjs')], {
    cwd: target,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  report.pid = child.pid
  const timer = setTimeout(() => stop('deadline'), duration)
  let exit
  try {
    exit = await new Promise((resolveExit, rejectExit) => {
      child.once('error', rejectExit)
      child.once('exit', (code, signal) => {
        try {
          killGroup()
        } catch (error) {
          rejectExit(error)
        }
        resolveExit({ code, signal })
      })
      for (const stream of ['stdout', 'stderr']) {
        child[stream].on('data', chunk => {
          bytes += chunk.length
          if (bytes > 1024 * 1024) stop('output-limit')
          else output[stream].push(chunk)
        })
        child[stream].on('error', error => stop(`output-error: ${error.message}`))
      }
    })
    await new Promise((resolveClose, rejectClose) => {
      if (child.stdout.destroyed && child.stderr.destroyed) return resolveClose()
      const closeTimer = setTimeout(() => rejectClose(new Error('pipe-close-deadline')), 2000)
      child.once('close', () => {
        clearTimeout(closeTimer)
        resolveClose()
      })
    })
  } finally {
    clearTimeout(timer)
    killGroup()
    for (const stream of ['stdout', 'stderr']) {
      writeFileSync(join(target, `aggregate.${stream}.txt`), Buffer.concat(output[stream]))
    }
  }
  report.exit = exit
  if (failure) throw new Error(failure)
  assert.deepEqual(exit, { code: 0, signal: null }, 'aggregate must exit normally')
  const { mutations } = await import(pathToFileURL(join(target, 'model.mjs')).href)
  assert.equal(Object.keys(mutations).length, 37)
  const manifest = JSON.parse(readFileSync(join(target, 'evidence/manifest.json'), 'utf8'))
  assert.deepEqual(manifest.hashes, copied, 'manifest belongs to copied sources')
  const expected = [
    ['normal-one-key', 0, 'closed-graph-pass'],
    ['normal-two-key', 0, 'closed-graph-pass'],
    ['directed-scenarios', 0, 'passed'],
    ['knowledge-regressions', 0, 'passed'],
    ...Object.keys(mutations).map(name => [name, 1, 'counterexample']),
    ['incomplete-entry-rejection', 0, 'passed'],
  ]
  assert.equal(manifest.runs.length, 42)
  assert.deepEqual(
    manifest.runs.map(row => row.name),
    expected.map(row => row[0]),
  )
  for (const [index, [name, code, status]] of expected.entries()) {
    const row = manifest.runs[index]
    assert.equal(row.exitCode, code, name)
    assert.equal(row.signal, null, name)
    assert.equal(row.status, status, name)
    const result = JSON.parse(readFileSync(join(target, 'evidence', `${name}.stdout.json`), 'utf8'))
    assert.equal(result.status, status, name)
    for (const field of ['states', 'transitions', 'failed', 'scenarios', 'cases']) {
      assert.deepEqual(row[field], result[field], `${name}: manifest ${field}`)
    }
    if (name === 'normal-one-key' || name === 'normal-two-key') {
      const counts = name === 'normal-one-key' ? [348, 4031] : [40368, 908280]
      assert.deepEqual([result.states, result.transitions], counts)
      assert.equal(result.frontier, 0)
    } else if (Object.hasOwn(mutations, name)) {
      assert.ok(Array.isArray(result.failed), name)
      assert.ok(result.failed.includes(mutations[name]), name)
      assert.ok(Array.isArray(result.trace), name)
      assert.ok(result.trace.length > 1, name)
    } else if (name === 'directed-scenarios') assert.equal(result.scenarios, 7)
    else assert.equal(result.cases, name === 'knowledge-regressions' ? 78 : 6)
  }
  assert.deepEqual(sourceHashes(), original, 'formal source remained unchanged')
  if (failure) throw new Error(failure)
  report.status = 'passed'
  report.runs = manifest.runs.length
} catch (error) {
  report.status = 'failed'
  report.reason = failure ?? String(error.stack ?? error)
  process.exitCode = 1
} finally {
  killGroup()
  try {
    if (original) assert.deepEqual(sourceHashes(), original, 'formal source remained unchanged')
  } catch (error) {
    failure ??= String(error)
  }
  if (failure || report.cleanupError) {
    report.status = 'failed'
    report.reason ??= failure ?? report.cleanupError
    process.exitCode = 1
  }
  finished = true
  writeFileSync(`${target}.supervisor.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (process.connected) process.disconnect()
}
