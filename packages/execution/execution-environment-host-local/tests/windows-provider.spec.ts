/** @module-tag slow */
import { expect, it } from 'vitest'
import { fixture, value } from './windows-provider-fixture.ts'
import { outputOf } from './windows-execution/terminal-fixture.ts'

it('runs a native command and ordinary terminal through the provider', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = await fixture()
  try {
    const a = await f.acquire()
    const command = value(
      await a.command.start({
        ...f.identity,
        ...a.call,
        args: ['-e', 'process.stdout.write(process.cwd())'],
      }),
    )
    const output = await outputOf(command)
    expect(output.bytes.toString().toLowerCase()).toBe(f.root.toLowerCase())
    expect(await command.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
    })
    const terminal = value(
      await a.terminal.create({ ...a.call, cwd: f.root, env: f.identity.env }),
    ).terminal
    const handle = value(
      await a.terminal.execute({
        ...a.call,
        terminal,
        script: '[Console]::Write((Get-Location).Path)',
      }),
    )
    const terminalOutput = await outputOf(handle)
    expect(terminalOutput.bytes.toString().toLowerCase()).toContain(f.root.toLowerCase())
    expect(await handle.result).toMatchObject({ kind: 'completed' })
    expect(await a.terminal.close({ ...a.call, terminal })).toMatchObject({
      value: { status: 'confirmed' },
    })
    expect(await a.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await f.cleanup()
  }
}, 60_000)
