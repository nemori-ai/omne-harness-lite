/** @module-tag slow */
// Slow: every test runs a real Windows PowerShell 5.1 Runspace in a ConPTY child and its Job.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { ProcessHandle, TerminalRef } from '@omne-harness/execution-environment-contract'
import { askBridge } from '../../src/windows-execution/bridge.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

const system = process.env['SystemRoot'] ?? 'C:\\Windows'
/** A path that does not exist; each row names its own, so its reason is told apart. */
const missing = (row: string) => `C:\\omne-missing-${row}`

/**
 * The rows of the F3 table as measured in Windows PowerShell 5.1, in one persistent shell, so each
 * row also starts from the state the previous one left. `text` is the reason a failed row must show.
 */
const rows: ReadonlyArray<Readonly<{ name: string; script: string; code: number; text?: string }>> =
  [
    {
      name: 'native success, standard error merged',
      script: 'cmd /c "echo omne-warn 1>&2 & exit 0" 2>&1',
      code: 0,
    },
    {
      name: 'native success, standard error not merged',
      script: 'cmd /c "echo omne-warn 1>&2 & exit 0"',
      code: 0,
    },
    { name: 'native failure 3', script: 'cmd /c exit 3', code: 3 },
    {
      name: 'native failure 5, standard error merged',
      script: 'cmd /c "echo omne-native-five 1>&2 & exit 5" 2>&1',
      code: 5,
      text: 'omne-native-five',
    },
    {
      name: 'cmdlet failure',
      script: `Get-Item ${missing('cmdlet')}`,
      code: 1,
      text: missing('cmdlet'),
    },
    {
      name: 'native success, then cmdlet failure',
      script: `cmd /c exit 0; Get-Item ${missing('after-success')}`,
      code: 1,
      text: missing('after-success'),
    },
    {
      name: 'native failure, then cmdlet success',
      script: 'cmd /c exit 3; Get-Date | Out-Null',
      code: 0,
    },
    {
      name: 'native failure, then cmdlet failure',
      script: `cmd /c exit 3; Get-Item ${missing('after-failure')}`,
      code: 3,
      text: missing('after-failure'),
    },
    // The previous row left $LASTEXITCODE at 3: the reset makes this row 1.
    {
      name: 'Write-Error',
      script: 'Write-Error "omne-write-error"',
      code: 1,
      text: 'omne-write-error',
    },
    { name: 'throw', script: 'throw "omne-thrown"', code: 1, text: 'omne-thrown' },
    { name: 'an empty script after a terminating error', script: '', code: 0 },
    {
      name: 'ErrorAction Stop',
      script: `Get-Item ${missing('stop')} -ErrorAction Stop`,
      code: 1,
      text: missing('stop'),
    },
    {
      name: 'a native failure, then a terminating error',
      script: 'cmd /c exit 4; throw "omne-after-native"',
      code: 4,
      text: 'omne-after-native',
    },
    { name: 'success', script: '"hello"', code: 0 },
    {
      name: 'no private trailer state left for the script',
      script: "if (Test-Path variable:global:__omne_succeeded) { throw 'omne-trailer-leaked' }",
      code: 0,
    },
    {
      name: 'filling $Error to its maximum',
      script:
        '1..300 | ForEach-Object { Write-Error "omne-fill-$_" -ErrorAction SilentlyContinue }; "filled"',
      code: 0,
    },
    {
      name: 'native success, standard error merged, with a full $Error',
      script: 'cmd /c "echo omne-warn 1>&2 & exit 0" 2>&1',
      code: 0,
    },
  ]

/** Terminal bytes without the control sequences ConPTY renders around the text. */
const visible = (bytes: Buffer) =>
  bytes
    .toString('utf8')
    // oxlint-disable-next-line no-control-regex -- ConPTY output is matched without its escapes.
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu, '')

it('answers every row of the F3 table with its exit code and shows the reason of a failure', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-exit-')))
  const f = terminalFixture(root)
  try {
    const created = await f.manager.facility.create({
      ...f.request,
      env: { ...f.request.env, PATH: join(system, 'System32'), PATHEXT: '.COM;.EXE' },
      geometry: { columns: 400, rows: 50 },
    })
    expect(created.kind).toBe('done')
    if (created.kind !== 'done') return
    const run = async (script: string) => {
      const handle = await f.manager.facility.execute({
        ...f.call,
        requestId: randomUUID(),
        terminal: created.value.terminal,
        script,
      })
      expect(handle.kind).toBe('done')
      if (handle.kind !== 'done') throw new Error('execute')
      const result = await handle.value.result
      return { result, text: visible((await outputOf(handle.value)).bytes) }
    }
    for (const row of rows) {
      const { result, text } = await run(row.script)
      expect({ row: row.name, result }).toMatchObject({
        row: row.name,
        result: { kind: 'completed', exit: { kind: 'code', code: row.code } },
      })
      // ConPTY windows are observations: the rendered reason can reach the windows after this
      // one, so empty invocations read on until it shows, before the next row starts.
      let shown = text
      for (
        let drain = 0;
        row.text !== undefined && !shown.includes(row.text) && drain < 50;
        drain++
      )
        shown += (await run('')).text
      if (row.text !== undefined)
        expect({ row: row.name, shown }).toMatchObject({
          row: row.name,
          shown: expect.stringContaining(row.text),
        })
    }
    expect(await f.manager.facility.list(f.call)).toMatchObject({
      kind: 'done',
      value: [expect.objectContaining({ state: 'idle' })],
    })
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** The members of a named Job, read from outside it; `gone` when no Job has that name. */
const members = (name: string) =>
  askBridge(
    { mode: 'members', name },
    frame => (frame.t === 'members' ? frame.reading : undefined),
    10_000,
  )

/** Writes the shell's process, its broker's and a background member of the Job into `file`. */
const processes = (file: string) =>
  `$broker = (Get-WmiObject Win32_Process -Filter "ProcessId=$PID").ParentProcessId; $member = Start-Process -FilePath ping.exe -ArgumentList '-n','300','127.0.0.1' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath ${psString(file)} -Value "$PID $broker $($member.Id)"`

async function started(file: string) {
  const [shell, broker, member] = (await readFile(file, 'utf8')).trim().split(' ').map(Number)
  if (shell === undefined || broker === undefined || member === undefined)
    throw new Error('process identities')
  expect([alive(shell), alive(broker), alive(member)]).toEqual([true, true, true])
  return { shell, broker, member }
}

it('completes exit 7 with code 7, then answers unavailable after its broker and Job are gone', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-exit-n-')))
  const file = join(root, 'processes')
  const f = terminalFixture(root)
  try {
    const created = await f.manager.facility.create({
      ...f.request,
      env: { ...f.request.env, PATH: join(system, 'System32'), PATHEXT: '.COM;.EXE' },
    })
    expect(created.kind).toBe('done')
    if (created.kind !== 'done') return
    const terminal: TerminalRef = created.value.terminal
    const execute = (script: string) =>
      f.manager.facility.execute({ ...f.call, requestId: randomUUID(), terminal, script })
    const finish = async (handle: Awaited<ReturnType<typeof execute>>) => {
      expect(handle.kind).toBe('done')
      if (handle.kind !== 'done') throw new Error('execute')
      const value: ProcessHandle = handle.value
      await outputOf(value)
      return value.result
    }
    expect(await finish(await execute(processes(file)))).toMatchObject({
      exit: { kind: 'code', code: 0 },
    })
    const { shell, broker, member } = await started(file)
    const name = `Local\\omne-terminal-${terminal.id}`
    expect(await members(name)).not.toBe('gone')
    expect(await finish(await execute('exit 7'))).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 7 },
    })
    expect(await execute('"after"')).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    await expect
      .poll(() => [alive(shell), alive(broker), alive(member)], { timeout: 10_000 })
      .toEqual([false, false, false])
    expect(await members(name)).toBe('gone')
    expect(await f.manager.facility.list(f.call)).toMatchObject({
      kind: 'done',
      value: [expect.objectContaining({ state: 'invalid' })],
    })
    expect(await f.manager.facility.close({ ...f.call, terminal })).toMatchObject({
      kind: 'done',
      value: { status: 'confirmed' },
    })
    expect(f.manager.unconfirmed()).toEqual([])
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
