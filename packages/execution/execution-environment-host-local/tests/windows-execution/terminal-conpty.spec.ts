import { copyFile, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  bundledConpty,
  createWindowsHostTerminals,
  missingConptyFiles,
} from '../../src/windows-execution/terminal.ts'
import { terminalFixture } from './terminal-fixture.ts'

it("finds node-pty's bundled conpty.dll with its OpenConsole.exe", async context => {
  if (process.platform !== 'win32') return context.skip()
  expect(bundledConpty()).toMatch(
    /node-pty[\\/]prebuilds[\\/]win32-x64[\\/]conpty[\\/]conpty\.dll$/u,
  )
  expect(await missingConptyFiles(bundledConpty())).toEqual([])
})

it('answers create unavailable before any plan and names each ConPTY file it cannot read', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-conpty-')))
  try {
    const bundled = bundledConpty()
    if (bundled === undefined) throw new Error('node-pty is not installed')
    await copyFile(bundled, join(root, 'conpty.dll'))
    const cases = [
      { conpty: join(root, 'absent', 'conpty.dll'), missing: ['conpty.dll', 'OpenConsole.exe'] },
      { conpty: join(root, 'conpty.dll'), missing: ['OpenConsole.exe'] },
    ]
    for (const { conpty, missing } of cases) {
      expect(await missingConptyFiles(conpty)).toEqual(missing)
      const f = terminalFixture(root)
      const reported: (readonly string[])[] = []
      const manager = createWindowsHostTerminals({
        ...f.input,
        conpty,
        unavailable: names => reported.push(names),
      })
      expect(await manager.facility.create(f.request)).toEqual({
        kind: 'rejected',
        requestId: f.request.requestId,
        reason: 'unavailable',
      })
      expect(reported).toEqual([missing])
      expect(f.plans).toEqual([])
      expect(manager.unconfirmed()).toEqual([])
      expect(f.capacity.reading()).toEqual({
        terminals: 0,
        windows: 0,
        reservedBytes: 0,
        chunks: 0,
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
