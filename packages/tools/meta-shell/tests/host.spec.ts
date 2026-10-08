// @module-tag slow — Real systemd scopes and PTY processes use the public host provider.
import { mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createShellTool } from '../src/index.ts'
import type { ToolReturn } from '@omne-harness-lite/tool-definition'
import { hostFixture } from './host-fixture.ts'

const options = {
  shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
  maxOutputBytes: 65536,
}
function body(result: ToolReturn) {
  if (typeof result === 'string' || result.content[0]?.kind !== 'text')
    throw new Error('Structured tool result required')
  return JSON.parse(result.content[0].text)
}
it('executes once in Runtime Context directory and returns the real nonzero PTY result', async () => {
  const h = await hostFixture()
  try {
    const call = await h.acquire(),
      tool = createShellTool(options)
    const result = await tool.executor(
      {
        command: 'execute',
        args: { command: 'printf "%s\\n" "$PWD"; printf "ERR\\n" >&2; exit 7' },
      },
      call.deps,
    )
    const value = body(result)
    expect(value.outcome).toMatchObject({
      kind: 'completed',
      exit: { code: 7 },
      output: { mode: 'terminal' },
    })
    expect(value.output.streams[0].text).toContain(h.directory)
    expect(value.output.streams[0].text).toContain('ERR')
    expect(result).toMatchObject({ isError: true })
    expect(await call.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await h.close()
  }
})
it('preserves two independent terminals across call release and confines temporary overrides', async () => {
  const h = await hostFixture(),
    tool = createShellTool(options)
  try {
    const first = await h.acquire()
    const one = body(await tool.executor({ command: 'create_session' }, first.deps)).terminal_id
    expect(await first.lease.release()).toEqual({ kind: 'released' })
    const second = await h.acquire()
    const two = body(await tool.executor({ command: 'create_session' }, second.deps)).terminal_id
    expect(one).not.toBe(two)
    expect(await second.lease.release()).toEqual({ kind: 'released' })
    const call = await h.acquire(),
      subdir = join(h.directory, 'changed')
    await mkdir(subdir)
    expect(
      body(
        await tool.executor(
          {
            command: 'execute',
            args: {
              session_id: one,
              command: 'export KEEP=yes; function retained_fn() { printf kept; }; cd changed',
            },
          },
          call.deps,
        ),
      ).outcome.exit.code,
    ).toBe(0)
    const saved = body(
      await tool.executor(
        {
          command: 'execute',
          args: { session_id: one, command: 'printf "%s:%s:" "$PWD" "$KEEP"; retained_fn' },
        },
        call.deps,
      ),
    )
    expect(saved.output.streams[0].text).toContain(`${subdir}:yes:kept`)
    const isolated = body(
      await tool.executor(
        {
          command: 'execute',
          args: { session_id: two, command: 'printf "%s:%s" "$PWD" "${KEEP:-absent}"' },
        },
        call.deps,
      ),
    )
    expect(isolated.output.streams[0].text).toContain(`${h.directory}:absent`)
    const temporary = body(
      await tool.executor(
        {
          command: 'execute',
          args: {
            session_id: one,
            command: 'printf "%s:%s" "$PWD" "$KEEP"',
            cwd: h.directory,
            envs: { KEEP: 'temporary' },
          },
        },
        call.deps,
      ),
    )
    expect(temporary.output.streams[0].text).toContain(`${h.directory}:temporary`)
    const unchanged = body(
      await tool.executor(
        { command: 'execute', args: { session_id: one, command: 'printf "%s:%s" "$PWD" "$KEEP"' } },
        call.deps,
      ),
    )
    expect(unchanged.output.streams[0].text).toContain(`${subdir}:yes`)
    expect(
      body(await tool.executor({ command: 'close_session', args: { session_id: one } }, call.deps))
        .status,
    ).toBe('confirmed')
    const closed = await tool.executor(
      {
        command: 'execute',
        args: { session_id: one, command: 'printf should-not-run > forbidden-after-close' },
      },
      call.deps,
    )
    expect(closed).toMatchObject({ isError: true })
    expect(body(closed).reason).toBe('facility:closed')
    await expect(access(join(subdir, 'forbidden-after-close'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      body(await tool.executor({ command: 'close_session', args: { session_id: two } }, call.deps))
        .status,
    ).toBe('confirmed')
    expect(await call.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await h.close()
  }
})
it('observes actual system information through the selected command facility', async () => {
  const h = await hostFixture()
  try {
    const call = await h.acquire()
    const result = body(await createShellTool(options).executor({ command: 'info' }, call.deps))
    expect(result.outcome.exit.code).toBe(0)
    expect(result.output.streams[0].text).toContain('system=Linux')
    expect(result.output.streams[0].text).toContain('shell_version=5.')
    expect(result.output.streams[0].text).toContain(`cwd=${h.directory}`)
    expect(await call.lease.release()).toEqual({ kind: 'released' })
  } finally {
    await h.close()
  }
})
