// @module-tag slow
// Starts real process groups and waits for bounded failure and cleanup.
import assert from 'node:assert/strict'
import { fork, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'

const sourceDirectory = fileURLToPath(new URL('./protocol-model/', import.meta.url))
const supervisorPath = fileURLToPath(
  new URL('./helpers/protocol-model-runner.mjs', import.meta.url),
)
const evidenceRoot = fileURLToPath(
  new URL('../../../../tmp/model-contract-protocol/', import.meta.url),
)
const scripts = ['model.mjs', 'self-test.mjs', 'knowledge-test.mjs', 'boundary-test.mjs', 'run.mjs']
const limits = { pollMs: 20, closeMs: 6500, settleMs: 3500, cleanupMs: 2000, hardMs: 18000 }
type ProcessExit = { code: number | null; signal: string | null }
type CleanupAction = { pid: number; group: boolean; signal: string; result: string }
type Scenario = 'success' | 'supervisor-early-exit' | 'missing-fixture' | 'no-pid'
type Pids = {
  controller: number | undefined
  supervisor: number | undefined
  root: number | undefined
  grandchild: number | undefined
}
type SupervisorReport = {
  status: string
  reason: string | undefined
  pid: number | undefined
  exit: ProcessExit | undefined
  cleanupError: unknown
}
type ControllerReport = {
  status: string
  reason: string | undefined
  supervisorPid: number | undefined
  cleanupError: unknown
}
type ProbeResult = {
  scenario: Scenario
  status: 'passed' | 'failed'
  reason?: string
  error?: string
  cleanupError?: string
  controllerExit?: ProcessExit
  controllerReport?: ControllerReport
  supervisorReport?: SupervisorReport
  pids: Pids
  cleanup: CleanupAction[]
  absenceBeforeOuterCleanup?: boolean
  absentPids?: number[]
  groupsAbsent?: { controller: boolean; root: boolean }
  negativeAssertionsPassed?: boolean
  controllerFixtureHash?: string
  controllerStdout?: string
  controllerStderr?: string
  raw?: { controller: unknown; supervisor: unknown }
  inputHashesBefore?: Record<string, string>
  inputHashesAfter?: Record<string, string>
}

function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : String(error)
}
function readRecord(path: string): Record<string, unknown> | undefined {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), path)
  return Object.fromEntries(Object.entries(value))
}
function optionalPid(value: unknown): number | undefined {
  if (value === undefined) return undefined
  assert.ok(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 1,
    'valid process PID',
  )
  return value
}
function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  assert.equal(typeof value, 'string')
  assert.ok(typeof value === 'string')
  return value
}
function readExit(value: unknown): ProcessExit | undefined {
  if (value === undefined) return undefined
  assert.ok(value !== null && typeof value === 'object' && 'code' in value && 'signal' in value)
  assert.ok(value.code === null || (typeof value.code === 'number' && Number.isInteger(value.code)))
  assert.ok(value.signal === null || typeof value.signal === 'string')
  return { code: value.code, signal: value.signal }
}
function readSupervisor(target: string): SupervisorReport | undefined {
  const value = readRecord(`${target}.supervisor.json`)
  if (!value) return undefined
  assert.ok(typeof value.status === 'string')
  return {
    status: value.status,
    reason: optionalText(value.reason),
    pid: optionalPid(value.pid),
    exit: readExit(value.exit),
    cleanupError: value.cleanupError,
  }
}
function readController(target: string): ControllerReport | undefined {
  const value = readRecord(`${target}.controller.json`)
  if (!value) return undefined
  assert.ok(typeof value.status === 'string')
  return {
    status: value.status,
    reason: optionalText(value.reason),
    supervisorPid: optionalPid(value.supervisorPid),
    cleanupError: value.cleanupError,
  }
}
function readPid(path: string): number | undefined {
  let value: string
  try {
    value = readFileSync(path, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
  assert.match(value, /^[1-9][0-9]*$/)
  return optionalPid(Number(value))
}
function alive(pid: number | undefined, group = false): boolean {
  if (pid === undefined) return false
  try {
    process.kill(group ? -pid : pid, 0)
    return true
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return false
    throw error
  }
}
function signal(pid: number | undefined, actions: CleanupAction[], group = false): void {
  if (pid === undefined) return
  try {
    process.kill(group ? -pid : pid, 'SIGKILL')
    actions.push({ pid, group, signal: 'SIGKILL', result: 'sent' })
  } catch (error) {
    const result = errorCode(error)
    actions.push({ pid, group, signal: 'SIGKILL', result })
    if (result !== 'ESRCH') throw error
  }
}
async function until<T>(
  predicate: () => T | undefined | false,
  duration: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  const deadline = performance.now() + duration
  while (true) {
    signal?.throwIfAborted()
    const value = predicate()
    if (value !== undefined && value !== false) return value
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw new Error(label)
    await delay(Math.min(limits.pollMs, remaining), undefined, { signal })
  }
}
function observe(child: ChildProcess) {
  const started = performance.now()
  const state: {
    exit?: ProcessExit
    close?: ProcessExit
    error?: Error
    events: { name: string; atMs: number }[]
  } = { events: [] }
  const record = (name: string) => state.events.push({ name, atMs: performance.now() - started })
  child.once('error', error => {
    state.error = error
    record('error')
  })
  child.once('disconnect', () => record('disconnect'))
  child.once('exit', (code, signal) => {
    state.exit = { code, signal }
    record('exit')
  })
  child.once('close', (code, signal) => {
    state.close = { code, signal }
    record('close')
  })
  child.stdout?.once('end', () => record('stdout-end'))
  child.stdout?.once('close', () => record('stdout-close'))
  child.stderr?.once('end', () => record('stderr-end'))
  child.stderr?.once('close', () => record('stderr-close'))
  return state
}

function allAbsent(pids: Pids): boolean {
  return (
    Object.values(pids).every(pid => !alive(pid)) &&
    !alive(pids.controller, true) &&
    !alive(pids.root, true)
  )
}
function inventory(target: string, controller?: ChildProcess): Pids {
  return {
    controller: controller?.pid,
    supervisor: readController(target)?.supervisorPid,
    root: readPid(join(target, 'root.pid')) ?? readSupervisor(target)?.pid,
    grandchild: readPid(join(target, 'grandchild.pid')) ?? readPid(join(target, 'descendant.pid')),
  }
}
function hashes() {
  return Object.fromEntries(
    [...scripts.map(name => join(sourceDirectory, name)), supervisorPath].map(path => [
      path,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  )
}
function createSource(source: string, program: string): void {
  mkdirSync(source)
  for (const file of scripts) copyFileSync(join(sourceDirectory, file), join(source, file))
  writeFileSync(join(source, 'run.mjs'), program)
}
function hanging(pidFile = 'grandchild.pid'): string {
  return `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
writeFileSync('root.pid', String(process.pid));
spawn(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').writeFileSync('${pidFile}',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`)}], {stdio:'ignore'});
process.on('SIGTERM',()=>{});
setInterval(()=>{},1000);
`
}

const controllerProgram =
  [
    "import { readFileSync } from 'node:fs'",
    "import { setTimeout as delay } from 'node:timers/promises'",
    '',
    'const limits = Object.freeze({',
    '  pollMs: 20,',
    '  readyMs: 2000,',
    '  supervisorMs: 8000,',
    '  gracefulCleanupMs: 1000,',
    '  forcedCleanupMs: 1000,',
    '  controllerHardMs: 5000,',
    '  controllerCloseMs: 6500,',
    '  settleMs: 3500,',
    '  outerCleanupMs: 2000,',
    '  outerHardMs: 18000,',
    '  caseHardMs: 21000,',
    '})',
    '',
    'function readJson(path) {',
    "  try { return JSON.parse(readFileSync(path, 'utf8')) }",
    '  catch (error) {',
    "    if (error.code === 'ENOENT') return undefined",
    '    throw error',
    '  }',
    '}',
    '',
    'function readPid(path) {',
    '  let value',
    "  try { value = readFileSync(path, 'utf8') }",
    '  catch (error) {',
    "    if (error.code === 'ENOENT') return undefined",
    '    throw error',
    '  }',
    '  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`invalid-pid: ${path}`)',
    '  const pid = Number(value)',
    '  if (!Number.isSafeInteger(pid) || pid < 2) throw new Error(`invalid-pid: ${path}`)',
    '  return pid',
    '}',
    '',
    'function alive(pid, group = false) {',
    '  if (pid === undefined) return false',
    '  try { process.kill(group ? -pid : pid, 0); return true }',
    '  catch (error) {',
    "    if (error.code === 'ESRCH') return false",
    '    throw error',
    '  }',
    '}',
    '',
    'function signal(pid, name, actions, group = false) {',
    '  if (pid === undefined) return',
    '  try {',
    '    process.kill(group ? -pid : pid, name)',
    "    actions.push({ pid, group, signal: name, result: 'sent' })",
    '  } catch (error) {',
    '    actions.push({ pid, group, signal: name, result: error.code })',
    "    if (error.code !== 'ESRCH') throw error",
    '  }',
    '}',
    '',
    'async function until(predicate, duration, label) {',
    '  const deadline = performance.now() + duration',
    '  while (true) {',
    '    const value = predicate()',
    '    if (value) return value',
    '    const remaining = deadline - performance.now()',
    '    if (remaining <= 0) throw new Error(label)',
    '    await delay(Math.min(limits.pollMs, remaining))',
    '  }',
    '}',
    '',
    'function observe(child) {',
    '  const state = { exit: undefined, close: undefined, error: undefined }',
    "  child.once('error', error => { state.error = String(error.stack ?? error) })",
    "  child.once('exit', (code, signal) => { state.exit = { code, signal } })",
    "  child.once('close', (code, signal) => { state.close = { code, signal } })",
    '  return state',
    '}',
    '',
    "import { fork } from 'node:child_process'",
    "import { writeFileSync } from 'node:fs'",
    "import { join, resolve } from 'node:path'",
    '',
    'const [supervisorArgument, sourceArgument, targetArgument] = process.argv.slice(2)',
    'const target = resolve(targetArgument)',
    "const report = { status: 'starting', controllerPid: process.pid, target, cleanup: [] }",
    'let supervisor',
    'let state',
    'let watchdog',
    'let cleanupError',
    'const output = () => writeFileSync(`${target}.controller.json`, JSON.stringify(report, null, 2))',
    'const event = value => process.stdout.write(`${JSON.stringify(value)}\\n`)',
    'function knownRoot() {',
    "  return readPid(join(target, 'root.pid')) ?? readJson(`${target}.supervisor.json`)?.pid",
    '}',
    'function forceCleanup() {',
    "  signal(knownRoot(), 'SIGKILL', report.cleanup, true)",
    "  signal(supervisor?.pid, 'SIGKILL', report.cleanup)",
    '}',
    '',
    'try {',
    "  if (process.platform === 'win32') throw new Error('POSIX process groups are required')",
    '  watchdog = setTimeout(() => {',
    "    report.status = 'failed'",
    "    report.reason ??= 'controller-hard-deadline'",
    '    try { forceCleanup() } catch (error) { report.cleanupError = String(error) }',
    '    output()',
    '    process.exit(1)',
    '  }, limits.controllerHardMs)',
    '  supervisor = fork(resolve(supervisorArgument), [resolve(sourceArgument), target, String(limits.supervisorMs)], {',
    "    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],",
    '  })',
    '  state = observe(supervisor)',
    '  report.supervisorPid = supervisor.pid',
    '  output()',
    "  event({ event: 'supervisor-started', pid: supervisor.pid })",
    '  const ready = await until(() => {',
    '    const supervisorReport = readJson(`${target}.supervisor.json`)',
    '    if (state.error) throw new Error(`supervisor-spawn-error: ${state.error}`)',
    '    if (state.exit || state.close || supervisorReport) {',
    '      report.supervisorExit = state.exit ?? state.close',
    '      report.supervisorReport = supervisorReport',
    "      throw new Error('supervisor-exited-before-ready')",
    '    }',
    "    const rootPid = readPid(join(target, 'root.pid'))",
    "    const grandchildPid = readPid(join(target, 'grandchild.pid'))",
    '    if (!rootPid || !grandchildPid) return false',
    '    if (!alive(supervisor.pid) || !alive(rootPid) || !alive(grandchildPid)) {',
    "      throw new Error('fixture-exited-before-ready')",
    '    }',
    '    return { rootPid, grandchildPid }',
    "  }, limits.readyMs, 'fixture-ready-deadline')",
    "  Object.assign(report, ready, { status: 'ready-to-kill' })",
    '  output()',
    "  event({ event: 'controller-self-SIGKILL', controllerPid: process.pid, ...ready })",
    "  process.kill(process.pid, 'SIGKILL')",
    '} catch (error) {',
    "  report.status = 'failed'",
    '  report.reason = error.message',
    '  process.exitCode = 1',
    '} finally {',
    '  // Successful SIGKILL never executes this block. Failure owns bounded cleanup.',
    '  try {',
    "    signal(supervisor?.pid, 'SIGTERM', report.cleanup)",
    '    if (state) {',
    "      try { await until(() => state.close, limits.gracefulCleanupMs, 'supervisor-cleanup-deadline') }",
    '      catch { forceCleanup() }',
    "      signal(knownRoot(), 'SIGKILL', report.cleanup, true)",
    "      await until(() => !alive(supervisor.pid) && !alive(knownRoot(), true), limits.forcedCleanupMs, 'controller-cleanup-deadline')",
    '    }',
    '  } catch (error) { cleanupError = String(error.stack ?? error) }',
    '  clearTimeout(watchdog)',
    '  report.supervisorExit = state?.exit ?? state?.close',
    '  report.supervisorReport = readJson(`${target}.supervisor.json`)',
    '  if (cleanupError) report.cleanupError = cleanupError',
    '  output()',
    '  event(report)',
    '  if (supervisor?.connected) supervisor.disconnect()',
    '}',
  ].join('\n') + '\n'

async function runParentDeathCase(input: {
  scenario: Scenario
  caseDirectory: string
  supervisorPath: string
}): Promise<ProbeResult> {
  const { scenario, caseDirectory } = input
  const source = join(caseDirectory, 'source')
  const target = join(caseDirectory, 'target')
  const report: ProbeResult = {
    scenario,
    status: 'failed',
    pids: { controller: undefined, supervisor: undefined, root: undefined, grandchild: undefined },
    cleanup: [],
  }
  let controller: ChildProcess | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let stdout = ''
  let stderr = ''
  const before = hashes()
  report.inputHashesBefore = before
  const abort = new AbortController()
  const wait = <T>(predicate: () => T | undefined | false, duration: number, label: string) =>
    until(predicate, duration, label, abort.signal)
  const cleanup = () => {
    const pids = inventory(target, controller)
    signal(pids.root, report.cleanup, true)
    signal(pids.controller, report.cleanup, true)
    return pids
  }
  async function run() {
    assert.notEqual(process.platform, 'win32', 'POSIX process groups are required')
    if (scenario !== 'missing-fixture') {
      const program =
        scenario === 'supervisor-early-exit'
          ? "import {writeFileSync} from 'node:fs';writeFileSync('root.pid',String(process.pid));process.exit(42)"
          : hanging(scenario === 'no-pid' ? 'descendant.pid' : 'grandchild.pid')
      createSource(source, program)
    }
    const fixture = join(caseDirectory, 'controller.mjs')
    writeFileSync(fixture, controllerProgram)
    report.controllerFixtureHash = createHash('sha256').update(controllerProgram).digest('hex')
    controller = spawn(process.execPath, [fixture, input.supervisorPath, source, target], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const state = observe(controller)
    controller.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk
      if (stdout.length + stderr.length > 65536) {
        report.reason ??= 'controller-output-limit'
        cleanup()
      }
    })
    controller.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk
      if (stdout.length + stderr.length > 65536) {
        report.reason ??= 'controller-output-limit'
        cleanup()
      }
    })
    for (const stream of [controller.stdout, controller.stderr])
      stream?.on('error', error => {
        report.reason ??= `controller-output-error: ${error.message}`
      })
    report.controllerExit = await wait(
      () => {
        if (state.error) throw state.error
        return state.close
      },
      limits.closeMs,
      'controller-close-deadline',
    )
    const controllerReport = readController(target)
    assert.ok(controllerReport)
    report.controllerReport = controllerReport
    if (report.reason) throw new Error(report.reason)
    if (scenario === 'success') {
      assert.deepEqual(report.controllerExit, { code: null, signal: 'SIGKILL' })
      assert.equal(report.controllerReport?.status, 'ready-to-kill')
      report.supervisorReport = await wait(
        () => readSupervisor(target),
        limits.settleMs,
        'supervisor-report-deadline',
      )
      assert.equal(report.supervisorReport.status, 'failed')
      assert.equal(report.supervisorReport.reason, 'parent-disconnected')
      report.pids = inventory(target, controller)
      assert.ok(Object.values(report.pids).every(pid => typeof pid === 'number' && pid > 1))
      assert.equal(new Set(Object.values(report.pids)).size, 4)
      await wait(
        () => allAbsent(report.pids),
        limits.settleMs,
        'successful-parent-death-cleanup-deadline',
      )
      report.absenceBeforeOuterCleanup = true
      report.status = 'passed'
    } else {
      assert.deepEqual(report.controllerExit, { code: 1, signal: null })
      assert.equal(report.controllerReport?.status, 'failed')
      assert.equal(report.controllerReport?.cleanupError, undefined)
      assert.ok(report.controllerReport.reason)
      report.reason = report.controllerReport.reason
      assert.equal(
        report.reason,
        scenario === 'no-pid' ? 'fixture-ready-deadline' : 'supervisor-exited-before-ready',
      )
      const supervisorReport = readSupervisor(target)
      assert.ok(supervisorReport)
      report.supervisorReport = supervisorReport
      assert.equal(report.supervisorReport?.status, 'failed')
      if (scenario === 'supervisor-early-exit')
        assert.deepEqual(report.supervisorReport?.exit, { code: 42, signal: null })
      if (scenario === 'missing-fixture') {
        assert.match(report.supervisorReport?.reason ?? '', /ENOENT/)
        assert.equal(readSupervisor(target)?.pid, undefined)
        assert.equal(readPid(join(target, 'root.pid')), undefined)
        assert.equal(readPid(join(target, 'grandchild.pid')), undefined)
      }
      if (scenario === 'no-pid') {
        assert.equal(report.supervisorReport?.reason, 'supervisor-SIGTERM')
        assert.equal(readPid(join(target, 'grandchild.pid')), undefined)
        assert.ok(readPid(join(target, 'descendant.pid')))
      }
      report.pids = inventory(target, controller)
      await wait(
        () => allAbsent(report.pids),
        limits.settleMs,
        'failed-parent-death-cleanup-deadline',
      )
      report.absenceBeforeOuterCleanup = true
      report.negativeAssertionsPassed = true
    }
  }
  try {
    await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => {
          const error = new Error('outer-hard-deadline')
          abort.abort(error)
          reject(error)
        }, limits.hardMs)
      }),
    ])
  } catch (error) {
    report.status = 'failed'
    report.reason ??= error instanceof Error ? error.message : String(error)
    report.error = String(error instanceof Error ? error.stack : error)
  } finally {
    clearTimeout(watchdog)
    abort.abort()
    try {
      const pids = inventory(target, controller)
      if (report.status !== 'passed' || !allAbsent(pids)) cleanup()
      await until(() => allAbsent(pids), limits.cleanupMs, 'outer-cleanup-deadline')
      report.pids = pids
      report.absentPids = Object.values(pids).filter((pid): pid is number => pid !== undefined)
      report.groupsAbsent = {
        controller: !alive(pids.controller, true),
        root: !alive(pids.root, true),
      }
      report.inputHashesAfter = hashes()
      assert.deepEqual(report.inputHashesAfter, before)
    } catch (error) {
      report.status = 'failed'
      report.cleanupError = String(error)
    }
    controller?.stdout?.destroy()
    controller?.stderr?.destroy()
    report.raw = {
      controller: readRecord(`${target}.controller.json`),
      supervisor: readRecord(`${target}.supervisor.json`),
    }
    report.controllerStdout = stdout
    report.controllerStderr = stderr
    writeFileSync(join(caseDirectory, 'probe.json'), JSON.stringify(report, null, 2))
  }
  return report
}

async function inCase(name: string, run: (directory: string) => Promise<unknown>): Promise<void> {
  mkdirSync(evidenceRoot, { recursive: true })
  const directory = realpathSync(mkdtempSync(join(evidenceRoot, `${name}-`)))
  const before = hashes()
  try {
    const report = await run(directory)
    assert.deepEqual(hashes(), before)
    console.log(JSON.stringify({ name, directory, report }))
    rmSync(directory, { recursive: true, force: true })
  } catch (error) {
    throw new Error(`Protocol lifecycle evidence retained at ${directory}`, { cause: error })
  }
}

const failureCases = [
  { name: 'false-success', program: 'process.exitCode = 0', duration: 2000, reason: /ENOENT/ },
  {
    name: 'partial-manifest',
    program: `import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';mkdirSync('evidence');const hashes=Object.fromEntries(${JSON.stringify(scripts)}.map(name=>[name,createHash('sha256').update(readFileSync(name)).digest('hex')]));writeFileSync('evidence/manifest.json',JSON.stringify({hashes,runs:[]}))`,
    duration: 2000,
    reason: /0 !== 42/,
  },
  {
    name: 'truncated-manifest',
    program:
      "import {mkdirSync,writeFileSync} from 'node:fs';mkdirSync('evidence');writeFileSync('evidence/manifest.json','{')",
    duration: 2000,
    reason: /SyntaxError/,
  },
  {
    name: 'signal',
    program: "process.kill(process.pid,'SIGKILL')",
    duration: 2000,
    reason: /aggregate must exit normally/,
  },
  {
    name: 'throw',
    program: "throw new Error('injected-error')",
    duration: 2000,
    reason: /aggregate must exit normally/,
  },
  { name: 'deadline', program: hanging(), duration: 600, reason: /^deadline$/ },
  {
    name: 'output-limit',
    program: "process.stdout.write('x'.repeat(2*1024*1024));setInterval(()=>{},1000)",
    duration: 2000,
    reason: /^output-limit$/,
  },
  {
    name: 'exit-leaves-grandchild',
    program: hanging() + 'setTimeout(()=>process.exit(0),250)',
    duration: 2000,
    reason: /ENOENT/,
  },
  {
    name: 'parent-disconnected',
    program: hanging(),
    duration: 4000,
    reason: /^parent-disconnected$/,
  },
  {
    name: 'supervisor-SIGTERM',
    program: hanging(),
    duration: 4000,
    reason: /^supervisor-SIGTERM$/,
  },
]

test.each(failureCases)(
  'rejects $name and reaps its process group',
  async ({ name, program, duration, reason }) => {
    await inCase(name, async directory => {
      const source = join(directory, 'source')
      const target = join(directory, 'target')
      createSource(source, program)
      const child = fork(supervisorPath, [source, target, String(duration)], {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      })
      const state = observe(child)
      let output = ''
      child.stdout?.on('data', chunk => {
        output += chunk
      })
      child.stderr?.on('data', chunk => {
        output += chunk
      })
      const cleanup: CleanupAction[] = []
      let report: unknown
      try {
        if (name === 'parent-disconnected' || name === 'supervisor-SIGTERM') {
          await until(
            () => existsSync(join(target, 'grandchild.pid')),
            2000,
            'fixture-ready-deadline',
          )
          if (name === 'parent-disconnected') child.disconnect()
          else child.kill('SIGTERM')
        }
        const exit = await until(
          () => {
            if (state.error) throw state.error
            return state.exit
          },
          limits.closeMs,
          'supervisor-exit-deadline',
        )
        assert.deepEqual(exit, { code: 1, signal: null })
        await until(
          () => child.stdout?.destroyed === true && child.stderr?.destroyed === true,
          2000,
          'supervisor-pipes-deadline',
        )
        const supervisor = readSupervisor(target)
        assert.equal(supervisor?.status, 'failed')
        assert.equal(supervisor?.cleanupError, undefined)
        assert.match(supervisor?.reason ?? '', reason)
        const pids = { ...inventory(target), supervisor: child.pid }
        if (
          [
            'deadline',
            'exit-leaves-grandchild',
            'parent-disconnected',
            'supervisor-SIGTERM',
          ].includes(name)
        ) {
          assert.ok(pids.root && pids.grandchild)
        }
        await until(() => allAbsent(pids), limits.settleMs, 'process-cleanup-deadline')
        report = {
          name,
          exit,
          supervisor: readRecord(`${target}.supervisor.json`),
          pids,
          absenceBeforeOuterCleanup: true,
          events: state.events,
          closeObserved: state.close ?? null,
          pipes: {
            stdoutDestroyed: child.stdout?.destroyed,
            stderrDestroyed: child.stderr?.destroyed,
          },
          groupsAbsent: { root: !alive(pids.root, true) },
          cleanup,
        }
        writeFileSync(join(directory, 'probe.json'), JSON.stringify(report, null, 2))
      } finally {
        if (child.connected) child.disconnect()
        const pids = { ...inventory(target), supervisor: child.pid }
        if (!allAbsent(pids)) {
          signal(pids.root, cleanup, true)
          signal(pids.supervisor, cleanup)
        }
        try {
          await until(() => allAbsent(pids), limits.cleanupMs, 'fallback-cleanup-deadline')
        } finally {
          writeFileSync(join(directory, 'supervisor.log'), output)
          writeFileSync(
            join(directory, 'cleanup.json'),
            JSON.stringify({ pids, cleanup, state }, null, 2),
          )
          child.stdout?.destroy()
          child.stderr?.destroy()
        }
      }
      return report
    })
  },
  25000,
)

const parentScenarios: Scenario[] = [
  'success',
  'supervisor-early-exit',
  'missing-fixture',
  'no-pid',
]
test.each(parentScenarios)(
  'bounds parent death scenario %s',
  async scenario => {
    await inCase(`parent-${scenario}`, async caseDirectory => {
      const result = await runParentDeathCase({ scenario, caseDirectory, supervisorPath })
      assert.equal(result.error, undefined)
      assert.equal(result.cleanupError, undefined)
      assert.equal(result.absenceBeforeOuterCleanup, true)
      assert.deepEqual(result.groupsAbsent, { controller: true, root: true })
      if (scenario === 'success') {
        assert.equal(result.status, 'passed')
        assert.deepEqual(result.cleanup, [])
      } else {
        assert.equal(result.status, 'failed')
        assert.equal(result.negativeAssertionsPassed, true)
      }
      return result
    })
  },
  25000,
)
