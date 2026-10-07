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
  overrides: { cwd?: string; env?: Record<string, string>; stdin?: Uint8Array } = {},
) {
  const prepared = await prepareHostTerminalCommand(
    terminal,
    { script, ...overrides },
    defaultHostNativePolicy,
  )
  if (prepared.kind !== 'ready') throw new Error(prepared.kind)
  expect(await prepared.control.go()).toBe('started')
  const outputs = { terminal: '' }
  for await (const part of prepared.control.process.output) {
    if (part.stream !== 'terminal') throw new Error('Wrong native output mode')
    outputs.terminal += Buffer.from(part.data).toString()
  }
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
      expect((await execute(first, 'show; printf "|%s|%s" "$PWD" "$ONLY"')).outputs.terminal).toBe(
        'one|/|baseline',
      )
      expect(
        (await execute(second, 'printf "%s|%s" "${VALUE-unset}" "$PWD"')).outputs.terminal,
      ).toBe('unset|/tmp')
      expect(
        (
          await execute(first, 'printf "%s|%s" "$PWD" "$ONLY"; cd /', {
            cwd: '/tmp',
            env: { ONLY: 'temporary' },
          })
        ).outputs.terminal,
      ).toBe('/tmp|temporary')
      expect((await execute(first, 'printf "%s|%s" "$PWD" "$ONLY"')).outputs.terminal).toBe(
        '/|baseline',
      )
    } finally {
      expect(await first.stop('forced')).toBe('confirmed')
      expect(await second.stop('forced')).toBe('confirmed')
    }
  },
)

test(
  'real PTY state retains x/v and traps; optional stdin is an exact file with EOF',
  { tags: ['slow'] },
  async () => {
    const terminal = await create()
    try {
      expect(
        (await execute(terminal, 'test -t 0 && test -t 1 && test -t 2; printf tty')).outputs
          .terminal,
      ).toBe('tty')
      await execute(terminal, 'set -x; printf traced')
      expect(
        (await execute(terminal, 'case $- in *x*) printf kept-x;; *) exit 20;; esac')).outputs
          .terminal,
      ).toContain('kept-x')
      await execute(terminal, 'set +x; set -v; printf verbose')
      expect(
        (await execute(terminal, 'case $- in *v*) printf kept-v;; *) exit 21;; esac')).outputs
          .terminal,
      ).toContain('kept-v')
      await execute(terminal, 'set +v; trap "printf debug" DEBUG; printf trapped')
      expect((await execute(terminal, 'printf next')).outputs.terminal).toContain('next')
      await execute(terminal, 'trap - DEBUG; trap "printf returned" RETURN; printf r')
      expect((await execute(terminal, 'printf next-r')).outputs.terminal).toContain('returned')
      await execute(terminal, 'trap - RETURN')
      const input = await execute(
        terminal,
        '/usr/bin/python3 -c "import sys; print(sys.stdin.buffer.read().hex())"',
        { stdin: new Uint8Array([0, 10, 255, 13, 4]) },
      )
      expect(input.outputs.terminal).toBe('000aff0d04\r\n')
      expect(input.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
    } finally {
      expect(await terminal.stop('forced')).toBe('confirmed')
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
      expect(first.outputs).toEqual({ terminal: 'fronterrlate' })
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
  `builtin printf '\\033]777;omne;%s;999\\007' "$(basename -- "$__omne_path")" >&3`,
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

test(
  'ordinary PTY output can precede a delayed control receipt without losing completion',
  { tags: ['slow'] },
  async () => {
    const terminal = await create()
    const policy = { ...defaultHostNativePolicy, commandDeadlineMs: 2000 }
    try {
      // Delay only the control printf; ordinary output must remain on this leg.
      const prepared = await prepareHostTerminalCommand(
        terminal,
        {
          script:
            'function builtin(){ if [ "$1" = printf ]; then /bin/sleep 0.2; fi; command builtin "$@"; }; printf before; printf error >&2',
        },
        policy,
      )
      if (prepared.kind !== 'ready') throw new Error(prepared.kind)
      expect(await prepared.control.go()).toBe('started')
      const outputs = { terminal: '' }
      for await (const part of prepared.control.process.output) {
        if (part.stream !== 'terminal') throw new Error('Wrong native output mode')
        outputs.terminal += Buffer.from(part.data).toString()
      }
      expect(await prepared.control.process.result).toMatchObject({
        kind: 'completed',
        exit: { code: 0 },
      })
      expect(outputs).toEqual({ terminal: 'beforeerror' })
      expect(terminal.information().state).toBe('idle')
    } finally {
      expect(await terminal.stop('forced')).toBe('confirmed')
    }
  },
)
