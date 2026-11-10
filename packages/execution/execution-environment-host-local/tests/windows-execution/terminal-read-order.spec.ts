/** @module-tag slow */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as compiler from '../../src/windows-execution/compile.ts'
import { nativeSource } from '../../src/windows-execution/native-source.ts'
import { terminalNativeSource } from '../../src/windows-execution/terminal-native-source.ts'
import { createWindowsRetainedTerminalFactory } from '../../src/windows-execution/terminal.ts'
import { compileTerminalSource } from './native-fixture.ts'
import { outputOf, psString, terminalFixture, visible } from './terminal-fixture.ts'

it('answers an invocation only after the broker read its end sentinel, so bytes still in the OS pipe stay its own', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-read-order-')))
  const release = join(directory, 'release-read')
  const witness = join(directory, 'pipe-witness')
  const moved = join(directory, 'moved')
  await mkdir(moved)
  const literal = (value: string) => `@"${value.replaceAll('"', '""')}"`
  const marker = 'OMNE_PIPE_PENDING'
  const declaration =
    '[DllImport("kernel32.dll",SetLastError=true)] static extern bool PeekNamedPipe(IntPtr h,byte[] data,uint count,out uint read,out uint available,out uint left);\n'
  // The broker stops reading the ConPTY output while the marker waits in the pipe, until released.
  const gate = `if(stream=="terminal"&&!File.Exists(${literal(release)})){byte[] preview=new byte[65536];uint read,available,left;if(PeekNamedPipe(pipe,preview,(uint)preview.Length,out read,out available,out left)&&Encoding.UTF8.GetString(preview,0,(int)read).Contains("${marker}"))File.WriteAllText(${literal(witness)},"queued");Thread.Sleep(5);continue;}`
  expect(nativeSource.split('for(;;) {')).toHaveLength(2)
  const injected = nativeSource
    .replace('static readonly object OutputLock', declaration + 'static readonly object OutputLock')
    .replace('for(;;) {', `for(;;) {${gate}`)
  const f = terminalFixture(directory)
  const backend = createWindowsRetainedTerminalFactory(f.input)({
    request: f.request,
    ledger: f.input.ledger,
    scope: f.input.scope,
    closed: () => false,
  })
  if (backend === undefined) throw new Error('terminal reservation')
  context.onTestFinished(async () => {
    await writeFile(release, '').catch(() => undefined)
    await backend.stop()
  })
  try {
    const executable = await compileTerminalSource(directory, terminalNativeSource, injected)
    const mock = vi.spyOn(compiler, 'windowsTerminalExecutable').mockResolvedValue(executable)
    try {
      expect((await backend.start()).kind).toBe('done')
      const request = { ...f.call, terminal: backend.terminal }
      const first = await backend.execute({
        ...request,
        script: `[Console]::Write('${marker}'); Set-Location -LiteralPath ${psString(moved)}; while (-not [IO.File]::Exists(${psString(witness)})) { Start-Sleep -Milliseconds 10 }`,
      })
      expect(first.kind).toBe('done')
      if (first.kind !== 'done') return
      let answered = false
      void first.value.result.then(() => {
        answered = true
      })
      // The finished frame came over the control pipe: it carries the cwd the script moved to.
      await expect.poll(() => backend.information().observedCwd, { timeout: 10_000 }).toBe(moved)
      expect(await readFile(witness, 'utf8')).toBe('queued')
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(answered).toBe(false)
      expect(backend.information().state).toBe('running')
      await writeFile(release, '')
      expect(await first.value.result).toMatchObject({
        kind: 'completed',
        exit: { kind: 'code', code: 0 },
      })
      expect(visible((await outputOf(first.value)).bytes)).toContain(marker)
      expect(backend.information().state).toBe('idle')
    } finally {
      await writeFile(release, '')
      await backend.stop()
      mock.mockRestore()
    }
  } finally {
    await backend.stop()
    await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}, 60_000)
