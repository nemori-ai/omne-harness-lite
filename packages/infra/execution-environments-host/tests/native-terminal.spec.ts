// @module-tag slow
// Persistent Bash and its original systemd scope execute real commands.
import { expect, test } from 'vitest'
import { prepareHostTerminal, prepareHostTerminalCommand } from '../dist/native-terminal.js'
import { createHostProcessCoordinate } from '../dist/native-control.js'
import { defaultHostNativePolicy } from '../dist/native-policy.js'
import type { HostTerminalControl } from '../src/native-terminal.ts'

async function create() {
  const prepared = await prepareHostTerminal(
    { cwd: '/tmp', env: { PATH: '/usr/bin:/bin', ONLY: 'baseline' } },
    defaultHostNativePolicy,
    await createHostProcessCoordinate(),
  )
  if (prepared.kind !== 'ready') throw new Error(prepared.kind)
  const created = await prepared.control.go()
  if (created.kind !== 'created') {
    await prepared.control.stop('forced')
    throw new Error(created.reason)
  }
  return created.terminal
}
async function execute(
  terminal: HostTerminalControl,
  script: string,
  overrides: { cwd?: string; env?: Record<string, string> } = {},
) {
  const prepared = await prepareHostTerminalCommand(
    terminal,
    { script, ...overrides },
    defaultHostNativePolicy,
  )
  if (prepared.kind !== 'ready') throw new Error(prepared.kind)
  expect(await prepared.control.go()).toBe('started')
  const outputs = { stdout: '', stderr: '' }
  for await (const part of prepared.control.process.output)
    outputs[part.stream] += Buffer.from(part.data).toString()
  return { outputs, result: await prepared.control.process.result, control: prepared.control }
}
test(
  'two terminals isolate real state; whole-command overrides do not mutate the baseline',
  { tags: ['slow'] },
  async () => {
    const first = await create(),
      second = await create()
    try {
      expect(
        (
          await execute(
            first,
            'VALUE=one; function show(){ printf "%s" "$VALUE"; }; cd /; set -o noclobber',
          )
        ).result.kind,
      ).toBe('completed')
      expect((await execute(first, 'show; printf "|%s|%s" "$PWD" "$ONLY"')).outputs.stdout).toBe(
        'one|/|baseline',
      )
      expect((await execute(second, 'printf "%s|%s" "${VALUE-unset}" "$PWD"')).outputs.stdout).toBe(
        'unset|/tmp',
      )
      expect(
        (
          await execute(first, 'printf "%s|%s" "$PWD" "$ONLY"; cd /', {
            cwd: '/tmp',
            env: { ONLY: 'temporary' },
          })
        ).outputs.stdout,
      ).toBe('/tmp|temporary')
      expect((await execute(first, 'printf "%s|%s" "$PWD" "$ONLY"')).outputs.stdout).toBe(
        '/|baseline',
      )
    } finally {
      expect(await first.stop('forced')).toBe('confirmed')
      expect(await second.stop('forced')).toBe('confirmed')
    }
  },
)
test(
  'late inherited output belongs to the original command; old completed stop cannot kill the next command',
  { tags: ['slow'] },
  async () => {
    const terminal = await create()
    try {
      const first = await execute(
        terminal,
        '(sleep 0.05; printf late) & printf front; printf err >&2',
      )
      expect(first.result.kind).toBe('completed')
      expect(first.outputs).toEqual({ stdout: 'frontlate', stderr: 'err' })
      const pending = prepareHostTerminalCommand(
        terminal,
        { script: 'printf next' },
        defaultHostNativePolicy,
      )
      expect(await first.control.stop('forced')).toBe('confirmed')
      const next = await pending
      if (next.kind !== 'ready') throw new Error(next.kind)
      expect(await next.control.go()).toBe('started')
      expect(await next.control.process.result).toHaveProperty('kind', 'completed')
    } finally {
      await terminal.stop('forced')
    }
  },
)
test.each([
  `/usr/bin/python3 -c 'import os,time
if os.fork()==0: os.closerange(0,65536); time.sleep(30)'`,
  'builtin printf damage >&3',
  'exec /bin/true',
] as const)(
  'residual/control damage/process replacement invalidates terminal: %s',
  { tags: ['slow'] },
  async script => {
    const terminal = await create()
    try {
      const value = await execute(terminal, script)
      expect(value.result.kind).toBe('failed')
      expect(terminal.information().state).not.toBe('idle')
      const next = await prepareHostTerminalCommand(
        terminal,
        { script: 'printf forbidden' },
        defaultHostNativePolicy,
      )
      expect(next.kind).toBe('rejected')
    } finally {
      await terminal.stop('forced')
    }
  },
)
