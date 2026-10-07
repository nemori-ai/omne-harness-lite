import { expect, test } from 'vitest'
import type { CommandOutput, CommandOutputMode } from '@omne-harness-lite/execution-environments'
import { fixture } from './protocol-fixture.ts'

// Protocol producer doubles test the provider boundary, not OS PTY behavior.
test.each<{ mode: CommandOutputMode; stream: string; accepted: boolean }>([
  { mode: 'terminal', stream: 'terminal', accepted: true },
  { mode: 'terminal', stream: 'stdout', accepted: false },
  { mode: 'terminal', stream: 'stderr', accepted: false },
  { mode: 'separate', stream: 'stdout', accepted: true },
  { mode: 'separate', stream: 'stderr', accepted: true },
  { mode: 'separate', stream: 'terminal', accepted: false },
  { mode: 'separate', stream: 'invalid', accepted: false },
])('declared $mode mode validates $stream frames', async ({ mode, stream, accepted }) => {
  const f = fixture()
  // Deliberately bypass static shape for a malformed JavaScript provider frame.
  const raw = { stream, data: new Uint8Array([1, 2]) } as CommandOutput
  f.start.mockResolvedValueOnce({
    kind: 'started',
    process: {
      ...f.process,
      outputMode: mode,
      output: {
        async *[Symbol.asyncIterator]() {
          yield raw
        },
      },
    },
  })
  try {
    const acquired = await f.registry.operations.acquire(f.request())
    if (acquired.kind !== 'acquired' || !acquired.lease.facilities.command)
      throw new Error('Fixture acquisition failed')
    const started = await acquired.lease.facilities.command.start({
      executable: 'literal',
      args: [],
      cwd: '/tmp',
      env: {},
    })
    if (started.kind !== 'started') throw new Error('Fixture start failed')
    expect(started.process.outputMode).toBe(mode)
    const iterator = started.process.output[Symbol.asyncIterator]()
    if (accepted) expect(await iterator.next()).toEqual({ done: false, value: raw })
    else await expect(iterator.next()).rejects.toThrow('invalid command output')
  } finally {
    await f.dispose()
  }
})
