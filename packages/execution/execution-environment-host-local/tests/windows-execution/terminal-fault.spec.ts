/** @module-tag slow */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it, vi } from 'vitest'
import * as compiler from '../../src/windows-execution/compile.ts'
import { nativeSource } from '../../src/windows-execution/native-source.ts'
import { terminalNativeSource } from '../../src/windows-execution/terminal-native-source.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

it('retains the original Job after real shell control loss without reexecuting the foreground script', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-control-fault-')))
  const source = join(directory, 'bridge.cs')
  const terminal = join(directory, 'terminal.cs')
  const executable = join(directory, 'bridge.exe')
  const anchor = 'writer.WriteLine(json.Serialize(new {t="started",id=request.id}));'
  expect(terminalNativeSource.split(anchor)).toHaveLength(2)
  const f = terminalFixture(directory)
  try {
    await writeFile(source, nativeSource)
    await writeFile(
      terminal,
      terminalNativeSource.replace(anchor, `${anchor} control.Dispose();Thread.Sleep(30000);`),
    )
    const system = process.env['SystemRoot'] ?? 'C:\\Windows'
    const framework = join(system, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
    await promisify(execFile)(
      join(framework, 'csc.exe'),
      [
        '/nologo',
        '/target:exe',
        '/main:OmneTerminalEntry',
        `/out:${executable}`,
        `/reference:${join(framework, 'System.Web.Extensions.dll')}`,
        `/reference:${join(system, 'Microsoft.NET', 'assembly', 'GAC_MSIL', 'System.Management.Automation', 'v4.0_3.0.0.0__31bf3856ad364e35', 'System.Management.Automation.dll')}`,
        source,
        terminal,
      ],
      { windowsHide: true },
    )
    const mock = vi.spyOn(compiler, 'windowsTerminalExecutable').mockResolvedValue(executable)
    try {
      const created = await f.manager.facility.create(f.request)
      expect(created.kind).toBe('done')
      if (created.kind !== 'done') return
      const request = { ...f.call, terminal: created.value.terminal }
      const running = await f.manager.facility.execute({
        ...request,
        script: 'Start-Sleep -Seconds 30',
      })
      expect(running.kind).toBe('done')
      if (running.kind !== 'done') return
      expect(await running.value.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
      await outputOf(running.value)
      expect(await f.manager.facility.list(f.request)).toMatchObject({
        kind: 'done',
        value: [expect.objectContaining({ state: 'invalid' })],
      })
      expect(await f.manager.facility.execute({ ...request, script: '' })).toMatchObject({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(f.manager.unconfirmed()).toEqual(f.plans)
      expect(await f.manager.facility.close(request)).toMatchObject({
        kind: 'done',
        value: { status: 'confirmed' },
      })
    } finally {
      await f.manager.stopAll()
      mock.mockRestore()
    }
  } finally {
    await f.manager.stopAll()
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)

it('keeps completed foreground facts but rejects reuse when a temporary cwd cannot be restored', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-restore-')))
  const saved = join(directory, 'saved')
  await mkdir(saved)
  const f = terminalFixture(directory)
  try {
    const created = await f.manager.facility.create(f.request)
    expect(created.kind).toBe('done')
    if (created.kind !== 'done') return
    const request = { ...f.call, terminal: created.value.terminal }
    const setup = await f.manager.facility.execute({
      ...request,
      script: `Set-Location -LiteralPath ${psString(saved)}`,
    })
    expect(setup.kind).toBe('done')
    if (setup.kind !== 'done') return
    await setup.value.result
    await outputOf(setup.value)
    expect(await f.manager.facility.list(f.call)).toMatchObject({
      kind: 'done',
      value: [expect.objectContaining({ observedCwd: saved })],
    })
    const running = await f.manager.facility.execute({
      ...request,
      cwd: directory,
      script: `[IO.Directory]::Delete(${psString(saved)})`,
    })
    expect(running.kind).toBe('done')
    if (running.kind !== 'done') return
    expect(await running.value.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'unknown' },
    })
    await outputOf(running.value)
    expect(await f.manager.facility.list(f.request)).toMatchObject({
      kind: 'done',
      value: [expect.objectContaining({ state: 'invalid' })],
    })
    expect(await f.manager.facility.execute({ ...request, script: '' })).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
  } finally {
    await f.manager.stopAll()
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)
