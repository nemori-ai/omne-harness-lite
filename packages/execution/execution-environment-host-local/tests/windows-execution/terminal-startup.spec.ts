/** @module-tag slow */
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import * as compiler from '../../src/windows-execution/compile.ts'
import { terminalNativeSource } from '../../src/windows-execution/terminal-native-source.ts'
import { compileTerminalSource } from './native-fixture.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

it('reports a confirmed pre-GO platform failure as unavailable and releases its empty Job', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-unavailable-')))
  const f = terminalFixture(directory)
  const anchor = 'int hr=CreatePseudoConsole(geometry,ir,ow,0,out terminalConsole);'
  try {
    expect(terminalNativeSource.split(anchor)).toHaveLength(2)
    const executable = await compileTerminalSource(
      directory,
      terminalNativeSource.replace(anchor, 'int hr=unchecked((int)0x8007007E);'),
    )
    const mock = vi.spyOn(compiler, 'windowsTerminalExecutable').mockResolvedValue(executable)
    try {
      expect(await f.manager.facility.create(f.request)).toMatchObject({
        kind: 'rejected',
        reason: 'unavailable',
      })
      expect(f.manager.unconfirmed()).toEqual([])
      expect(await f.manager.facility.list(f.call)).toMatchObject({ kind: 'done', value: [] })
      expect(f.capacity.reading()).toEqual({
        terminals: 0,
        windows: 0,
        reservedBytes: 0,
        chunks: 0,
      })
    } finally {
      await f.manager.stopAll()
      mock.mockRestore()
    }
  } finally {
    await f.manager.stopAll()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)

it('recognizes repeated foreground control facts without rerunning or invalidating the terminal', async context => {
  if (process.platform !== 'win32') return context.skip()
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-repeat-')))
  const f = terminalFixture(directory)
  const marker = join(directory, 'executions')
  const anchor =
    'writer.WriteLine(json.Serialize(new {t="finished",v=2,id=request.id,cwd=cwd,restored=restored,completed=completed,elapsedMs=elapsedMs}));'
  try {
    expect(terminalNativeSource.split(anchor)).toHaveLength(2)
    const executable = await compileTerminalSource(
      directory,
      terminalNativeSource.replace(anchor, `${anchor}${anchor}`),
    )
    const mock = vi.spyOn(compiler, 'windowsTerminalExecutable').mockResolvedValue(executable)
    try {
      const created = await f.manager.facility.create(f.request)
      expect(created.kind).toBe('done')
      if (created.kind !== 'done') return
      for (let count = 0; count < 2; count++) {
        const running = await f.manager.facility.execute({
          ...f.call,
          terminal: created.value.terminal,
          script: `[IO.File]::AppendAllText(${psString(marker)},'x')`,
        })
        expect(running.kind).toBe('done')
        if (running.kind !== 'done') return
        expect((await running.value.result).kind).toBe('completed')
        await outputOf(running.value)
      }
      expect(await readFile(marker, 'utf8')).toBe('xx')
      expect(await f.manager.facility.list(f.request)).toMatchObject({
        kind: 'done',
        value: [expect.objectContaining({ state: 'idle' })],
      })
    } finally {
      await f.manager.stopAll()
      mock.mockRestore()
    }
  } finally {
    await f.manager.stopAll()
    await rm(directory, { recursive: true, force: true })
  }
}, 45_000)
