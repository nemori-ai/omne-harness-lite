import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { checkSession } from '@omne-harness-lite/session-log'
import { expect, it, vi } from 'vitest'
import { InputFailure } from '../src/diagnostic.ts'
import {
  runEntryCli,
  entryExitCode,
  type EntryExecution,
  type EntryRuntime,
} from '../src/entry-application.ts'

function runtime(result: EntryExecution) {
  const execute = vi.fn<EntryRuntime['execute']>().mockResolvedValue(result)
  const stdout = vi.fn<EntryRuntime['stdout']>().mockResolvedValue(undefined)
  const stderr = vi.fn<EntryRuntime['stderr']>().mockResolvedValue(undefined)
  return {
    signal: new AbortController().signal,
    isTTY: false,
    version: async () => 'omne 0.0.0\n',
    execute,
    stdout,
    stderr,
  }
}
it('refuses a non-terminal governance command without opening state or echoing input', async () => {
  const io = runtime({
    outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
    diagnostics: [],
  })
  expect(
    await runEntryCli(
      ['tenant', 'create', '--name', 'private-name', '--home', '/private/path'],
      io,
    ),
  ).toBe(2)
  expect(io.execute).not.toHaveBeenCalled()
  expect(io.stdout).not.toHaveBeenCalled()
  const text = io.stderr.mock.calls[0]![0]
  expect(text).toContain('omne: tty-required\n')
  expect(text).toContain('omne tenant create --json')
  expect(text).not.toContain('private-name')
  expect(text).not.toContain('/private/path')
})
it('gives the same validated action when the actual terminal provider is unsupported', async () => {
  const io = runtime({
    outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
    diagnostics: [],
  })
  io.isTTY = true
  io.execute.mockRejectedValue(new InputFailure('tty-unsupported'))
  expect(await runEntryCli(['logout'], io)).toBe(2)
  expect(io.stderr.mock.calls[0]![0]).toContain('omne logout --json')
  expect(io.stdout).not.toHaveBeenCalled()
})
it('keeps the original unknown creation reference in one machine report and exits unknown', async () => {
  const result: EntryExecution = {
    outcome: {
      kind: 'pending',
      request: {
        login: {
          centerId: 'a'.repeat(32),
          accountId: 'owner',
          loginStateHandle: 'original',
        } as never,
        name: '研发组',
        creationKey: 'original-key',
      },
    },
    diagnostics: [],
  }
  const io = runtime(result)
  expect(await runEntryCli(['tenant', 'create', '--name', '研发组', '--json'], io)).toBe(4)
  expect(io.execute).toHaveBeenCalledTimes(1)
  expect(JSON.parse(io.stdout.mock.calls[0]![0])).toMatchObject({
    format: 'omne-cli/1',
    action: 'tenant.create',
    outcome: { kind: 'pending', request: { creationKey: 'original-key' } },
  })
})
it('does not turn a saved or remote success into success when cleanup failed', async () => {
  const result: EntryExecution = {
    outcome: {
      kind: 'saved',
      profile: {
        name: 'center',
        center: {
          centerId: 'a'.repeat(32),
          endpoint: 'https://center.invalid/',
          trust: { mode: 'ca' },
        },
      },
    },
    diagnostics: ['client-close-failed'],
  }
  const io = runtime(result)
  expect(
    await runEntryCli(
      ['center', 'add', 'https://center.invalid/', '--name', 'center', '--system-ca', '--json'],
      io,
    ),
  ).toBe(70)
  expect(JSON.parse(io.stdout.mock.calls[0]![0])).toMatchObject({
    outcome: { kind: 'saved' },
    diagnostics: ['client-close-failed'],
  })
})
it('reports an output failure with a safe code and never prints its original error', async () => {
  const io = runtime({
    outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
    diagnostics: [],
  })
  io.stdout.mockRejectedValue(new Error('never-print-secret'))
  expect(await runEntryCli(['tenant', 'create', '--name', '研发组', '--json'], io)).toBe(70)
  expect(io.stderr).toHaveBeenCalledWith('omne: output-failed\n')
})
it('does not invoke identity or runtime work for help', async () => {
  const io = runtime({
    outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
    diagnostics: [],
  })
  expect(await runEntryCli(['--help'], io)).toBe(0)
  expect(io.execute).not.toHaveBeenCalled()
  expect(io.stdout.mock.calls[0]![0]).toContain('omne tenant create')
})
it.each([['machine', 'login'], ['tui'], ['organization', 'create']])(
  'rejects retired entry %j before execution',
  async (...args) => {
    const io = runtime({
      outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
      diagnostics: [],
    })
    expect(await runEntryCli(args, io)).toBe(2)
    expect(io.execute).not.toHaveBeenCalled()
  },
)
it('does not report an installed capability when it is unavailable', () => {
  expect(
    entryExitCode({
      outcome: { kind: 'not-ready', reason: 'capability-not-installed' },
      diagnostics: [],
    }),
  ).toBe(3)
})

it('renders a terminal detach as a resume command rather than a machine envelope', async () => {
  const io = runtime({
    outcome: { kind: 'session-detached', session: 'session-one' },
    diagnostics: [],
  })
  expect(await runEntryCli([], { ...io, isTTY: true })).toBe(0)
  expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
    'Detached. Resume with omne --session session-one\n',
  )
})
it('renders an unconfirmed terminal submission without claiming failure or losing its original identity', async () => {
  const session = checkSession('session-one')
  if ('failure' in session) throw new Error('invalid fixture Session')
  const io = runtime({
    outcome: {
      kind: 'session-message',
      status: 'unconfirmed',
      reason: 'unknownCommit',
      receipt: null,
      request: {
        binding: checkedTenantBinding({
          formatVersion: 1,
          centerId: 'a'.repeat(32),
          tenant: { organization: 'team', account: 'owner' },
        }),
        session: session.ok,
        operationKey: 'original-input',
        messageId: 'message-one',
      },
    },
    diagnostics: [],
  })
  expect(await runEntryCli([], { ...io, isTTY: true })).toBe(4)
  expect(io.stdout).toHaveBeenCalledExactlyOnceWith(
    'Input status is unconfirmed. Do not submit it again.\nSession: session-one\nOperation: original-input\n',
  )
})
