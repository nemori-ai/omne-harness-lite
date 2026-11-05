/** @module-tag slow */
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as compiler from '../../src/windows-execution/compile.ts'
import { terminalNativeSource } from '../../src/windows-execution/terminal-native-source.ts'
import { createWindowsRetainedTerminalFactory } from '../../src/windows-execution/terminal.ts'
import { compileTerminalSource } from './native-fixture.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

function blockNodeUntil(path: string) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4))
  const deadline = performance.now() + 15_000
  while (!existsSync(path)) {
    if (performance.now() >= deadline)
      throw new Error('Native completion witness did not arrive while Node was blocked')
    Atomics.wait(sleeper, 0, 0, 2)
  }
}

it('uses native foreground elapsed time when Node cannot dispatch either control event until after completion', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-duration-')))
  const flushed = join(directory, 'finished-flushed')
  const measured = join(directory, 'script-elapsed')
  const f = terminalFixture(directory)
  const backend = createWindowsRetainedTerminalFactory(f.input)({
    request: f.request,
    ledger: f.input.ledger,
    scope: f.input.scope,
    closed: () => false,
  })
  if (backend === undefined) throw new Error('terminal reservation')
  context.onTestFinished(async () => {
    await backend.stop()
  })
  const anchor =
    'while((frame=OmneTerminalShell.ReadBounded(reader,r.maxControlBytes))!=null)Emit(Json.DeserializeObject(frame));'
  const literal = `@"${flushed.replaceAll('"', '""')}"`
  try {
    expect(terminalNativeSource.split(anchor)).toHaveLength(2)
    const executable = await compileTerminalSource(
      directory,
      terminalNativeSource.replace(
        anchor,
        `while((frame=OmneTerminalShell.ReadBounded(reader,r.maxControlBytes))!=null){Emit(Json.DeserializeObject(frame));if(frame.Contains("\\"t\\":\\"finished\\""))File.WriteAllText(${literal},"flushed");}`,
      ),
    )
    const mock = vi.spyOn(compiler, 'windowsTerminalExecutable').mockResolvedValue(executable)
    try {
      expect((await backend.start()).kind).toBe('done')
      const running = backend.execute({
        ...f.call,
        terminal: backend.terminal,
        script: `$work=[Diagnostics.Stopwatch]::StartNew(); while($work.ElapsedMilliseconds -lt 150) { [Threading.Thread]::SpinWait(10000) }; [IO.File]::WriteAllText(${psString(measured)},$work.ElapsedMilliseconds.ToString([Globalization.CultureInfo]::InvariantCulture))`,
      })
      blockNodeUntil(flushed)
      const nativeWorkMs = Number(readFileSync(measured, 'utf8'))
      expect(nativeWorkMs).toBeGreaterThanOrEqual(150)
      const result = await running
      expect(result.kind).toBe('done')
      if (result.kind !== 'done') return
      const outcome = await result.value.result
      expect(outcome.kind).toBe('completed')
      if (outcome.kind !== 'completed') return
      expect(Number.isSafeInteger(outcome.durationMs)).toBe(true)
      expect(outcome.durationMs).toBeGreaterThanOrEqual(nativeWorkMs)
      await outputOf(result.value)
    } finally {
      await backend.stop()
      mock.mockRestore()
    }
  } finally {
    await backend.stop()
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)
