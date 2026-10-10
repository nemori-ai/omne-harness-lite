import { checkSession } from '@omne-harness-lite/session-log'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import type { SessionMessageView } from '../src/session-reading.ts'
import { runTerminalSession } from '../src/session-terminal.ts'
import { startLocalSessionHost } from '../src/session-host-server.ts'
import { prepareTenantDirectory } from '../src/state-layout.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import type { SessionHostEndpoint, SessionHostRequest } from '../src/session-host-protocol.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const binding = checkedTenantBinding({
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
})
const defaults = {
  definition: { category: 'agent_definition' as const, name: 'official' },
  executionType: 'terminal',
  mode: 'never' as const,
  collaboration: 'co-work' as const,
}
const policy = { maxResponseBytes: 65536, timeoutMs: 1000, maxWaitMs: 1000, pollIntervalMs: 5 }
const checkedSession = checkSession('session-one')
if ('failure' in checkedSession) throw new Error('invalid fixture Session')
const sessionId = checkedSession.ok
const foreignSession = checkSession('foreign')
if ('failure' in foreignSession) throw new Error('invalid foreign fixture Session')
const foreignSessionId = foreignSession.ok
const timestamp = '2026-10-10T18:00:00Z'
async function fixture(
  fault?: 'clock' | 'unknown' | 'wait' | 'model' | 'history',
  toolTexts: readonly string[] = [],
  initialHistory: readonly SessionMessageView[] = [],
) {
  const home = await mkdtemp(join(tmpdir(), 'term-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const paths = await prepareTenantDirectory(home, binding)
  const local = await openClientLocalState(
    { directory: paths.auth },
    {
      storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
    },
  )
  await local.close()
  let submit: Extract<SessionHostRequest, { command: 'submitInput' }> | undefined
  let create: Extract<SessionHostRequest, { command: 'createSession' }> | undefined
  const source = {
    tenant: binding.tenant,
    session: sessionId,
    journalGeneration: 'journal',
    tail: 10,
  }
  const receipt = () => ({
    operation: {
      tenant: binding.tenant,
      principal: binding.tenant.account,
      session: sessionId,
      operation: 'submitInput' as const,
      operationKey: submit!.operationKey,
    },
    position: 2,
    source: { ...source, tail: 2 },
  })
  const execute = vi.fn<SessionHostEndpoint['execute']>(async packet => {
    switch (packet.command) {
      case 'readCreationDefaults':
        return { kind: 'creationDefaults', defaults }
      case 'readInitialModel':
        return {
          kind: 'initialModel',
          routeName: fault === 'model' ? 'other-route' : 'selected-route',
        }
      case 'readClock':
        return fault === 'clock' ? { failure: 'unavailable' } : { kind: 'clock', timestamp }
      case 'createSession':
        create = packet
        return {
          kind: 'created',
          session: source.session,
          receipt: {
            operation: {
              tenant: binding.tenant,
              principal: binding.tenant.account,
              session: null,
              operation: 'createSession',
              operationKey: packet.input.operationKey,
            },
            position: 1,
            source: { ...source, tail: 1 },
          },
        }
      case 'submitInput':
        submit = packet
        return fault === 'unknown'
          ? { kind: 'unknownCommit', operation: receipt().operation }
          : { kind: 'accepted', receipt: receipt() }
      case 'readSubmission':
        return {
          kind: 'submission',
          receipt: receipt(),
          source,
          inputPosition: 1,
          messageId: submit!.message.id,
          run: fault === 'wait' ? null : { id: 'run-one', state: 'completed' },
        }
      case 'readMessages':
        if (fault === 'history')
          return {
            kind: 'messages',
            source: { ...source, session: foreignSessionId },
            messages: [],
          }
        return {
          kind: 'messages',
          source,
          messages: submit
            ? [
                {
                  id: submit.message.id,
                  position: 2,
                  run: null,
                  type: 'user',
                  createdAt: timestamp,
                  blocks: [
                    {
                      id: 'question-text',
                      kind: 'text',
                      text:
                        submit.message.blocks[0]!.kind === 'text'
                          ? submit.message.blocks[0]!.text
                          : '',
                    },
                  ],
                },
                {
                  id: 'previous',
                  position: 3,
                  run: 'previous-run',
                  type: 'assistant',
                  createdAt: timestamp,
                  blocks: [{ id: 'previous-text', kind: 'text', text: 'Do not repeat me' }],
                },
                {
                  id: 'tool-output',
                  position: 8,
                  run: 'run-one',
                  type: 'tool',
                  createdAt: timestamp,
                  blocks: toolTexts.map((text, index) => ({
                    id: `tool-${index}`,
                    kind: 'text',
                    text,
                  })),
                },
                {
                  id: 'answer',
                  position: 9,
                  run: 'run-one',
                  type: 'assistant',
                  createdAt: timestamp,
                  blocks: [{ id: 'answer-text', kind: 'text', text: 'Current answer' }],
                },
              ]
            : initialHistory,
        }
      default:
        throw new Error(`Unexpected ${packet.command}`)
    }
  })
  const host = await startLocalSessionHost({
    home,
    binding,
    endpoint: { execute },
    policy: {
      maxRequestBytes: 65536,
      maxResponseBytes: 65536,
      maxConnections: 8,
      maxInFlight: 4,
      requestTimeoutMs: 2000,
      headersTimeoutMs: 1000,
      idleTimeoutMs: 1000,
      checkIntervalMs: 100,
      maxFailureRecords: 8,
      maxHeaderBytes: 8192,
    },
    diagnostic: error => {
      throw error
    },
  })
  cleanup.push(host.close)
  const text = vi
    .fn<(title: string, body?: readonly string[]) => Promise<string | undefined>>()
    .mockResolvedValueOnce('Question')
    .mockResolvedValue(undefined)
  const show = vi.fn(async () => true)
  const identity = vi.fn()
  const progress = vi.fn()
  let identityNumber = 0
  return {
    execute,
    host,
    submit: () => submit,
    create: () => create,
    text,
    show,
    identity,
    progress,
    options: {
      home,
      binding,
      routeName: 'selected-route',
      session: null,
      workspace: '/workspace',
      signal: new AbortController().signal,
      originalId: () => `id-${++identityNumber}`,
      policy,
      dialog: { text, compose: text, show, identity, progress, choose: async () => undefined },
    },
  }
}
it('creates through the actual socket, timestamps from the host and displays only the submitted Run', async () => {
  const f = await fixture()
  expect(await runTerminalSession(f.options)).toEqual({
    outcome: { kind: 'session-detached', session: 'session-one' },
    diagnostics: [],
  })
  expect(f.create()?.input).toEqual({ ...defaults, operationKey: 'id-1', workspace: '/workspace' })
  expect(f.submit()?.message).toMatchObject({
    createdAt: timestamp,
    blocks: [{ text: 'Question' }],
  })
  expect(f.show).not.toHaveBeenCalled()
  expect(f.text.mock.calls[1]?.[1]).toEqual([
    '',
    'You',
    'Question',
    '',
    'Assistant',
    'Current answer',
  ])
  expect(f.identity).toHaveBeenCalledWith(expect.arrayContaining(['Session: session-one']))
  expect(f.execute.mock.calls.filter(([p]) => p.command === 'submitInput')).toHaveLength(1)
})
it('attaches to an explicit Session without creating another one', async () => {
  const f = await fixture()
  await runTerminalSession({ ...f.options, session: 'session-one' })
  expect(f.create()).toBeUndefined()
  expect(f.submit()?.session).toBe('session-one')
})
it('renders execution output and loss counts without showing environment implementation fields', async () => {
  const f = await fixture(undefined, [
    JSON.stringify({
      kind: 'execution',
      environment: { reference: { generation: 'internal-generation' } },
      outcome: {
        kind: 'completed',
        exit: { code: 0 },
        output: { mode: 'terminal', terminal: { discardedBytes: 3 } },
      },
      output: {
        streams: [
          { stream: 'stdout', text: 'command output' },
          { stream: 'stderr', text: 'diagnostic output' },
        ],
        retainedBytes: 32,
        toolDiscardedBytes: 8,
        droppedFrames: 2,
      },
    }),
  ])
  await runTerminalSession(f.options)
  expect(f.text.mock.calls[1]?.[1]).toEqual([
    '',
    'You',
    'Question',
    '',
    'Tool',
    'Tool output (completed)',
    'command output',
    'diagnostic output',
    'Exit code: 0',
    'Output omitted: 8 bytes, 2 frames',
    'Transport omitted: 3 bytes',
    '',
    'Assistant',
    'Current answer',
  ])
})
it('preserves unrecognized tool text instead of dropping a failed or unknown result', async () => {
  const values = [
    'ordinary tool text',
    '{"kind":"execution","output":null}',
    '{"kind":"rejected","reason":"unavailable"}',
  ]
  const f = await fixture(undefined, values)
  await runTerminalSession(f.options)
  expect(f.text.mock.calls[1]?.[1]).toEqual([
    '',
    'You',
    'Question',
    '',
    'Tool',
    ...values,
    '',
    'Assistant',
    'Current answer',
  ])
})
it('never substitutes local wall time or submits when the host clock is unavailable', async () => {
  const f = await fixture('clock')
  expect(await runTerminalSession(f.options)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'host-clock-unavailable' },
  })
  expect(f.submit()).toBeUndefined()
})
it('preserves the original unknown submission and does not request another input', async () => {
  const f = await fixture('unknown')
  const result = await runTerminalSession(f.options)
  expect(result.outcome).toMatchObject({
    kind: 'session-message',
    status: 'unconfirmed',
    reason: 'unknownCommit',
  })
  expect(f.text).toHaveBeenCalledOnce()
  expect(f.show).not.toHaveBeenCalled()
  expect(f.execute.mock.calls.filter(([p]) => p.command === 'submitInput')).toHaveLength(1)
})
it('keeps waiting beyond the script deadline until the terminal detaches', async () => {
  const f = await fixture('wait')
  const controller = new AbortController()
  let observed!: () => void
  const firstRead = new Promise<void>(resolve => {
    observed = resolve
  })
  const execute = f.execute.getMockImplementation()!
  f.execute.mockImplementation(async packet => {
    if (packet.command === 'readSubmission') observed()
    return execute(packet)
  })
  let ended = false
  const pending = runTerminalSession({
    ...f.options,
    signal: controller.signal,
    policy: { ...policy, maxWaitMs: 30 },
  }).finally(() => {
    ended = true
  })
  try {
    await firstRead
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(ended).toBe(false)
  } finally {
    controller.abort()
  }
  expect(await pending).toMatchObject({
    outcome: {
      status: 'accepted',
      reason: 'detached',
      receipt: { operation: { operation: 'submitInput' } },
    },
  })
  expect(f.text).toHaveBeenCalledOnce()
  expect(f.execute.mock.calls.filter(([p]) => p.command === 'submitInput')).toHaveLength(1)
})
it('cancelled terminal input detaches without submitting or closing the host', async () => {
  const f = await fixture()
  f.text.mockReset().mockResolvedValue(undefined)
  expect(await runTerminalSession(f.options)).toMatchObject({
    outcome: { kind: 'session-detached' },
  })
  expect(f.submit()).toBeUndefined()
  expect(f.execute.mock.calls.map(([p]) => p.command)).toEqual([
    'readCreationDefaults',
    'readInitialModel',
    'readCreationDefaults',
    'createSession',
    'readMessages',
  ])
})

it('refuses an attached host with a different initial model before creating or submitting', async () => {
  const f = await fixture('model')
  expect(await runTerminalSession(f.options)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'host-model-mismatch' },
  })
  expect(f.create()).toBeUndefined()
  expect(f.submit()).toBeUndefined()
  expect(f.text).not.toHaveBeenCalled()
})

it('keeps the next composer visible beside the user message and answer without a continuation dialog', async () => {
  const f = await fixture()
  await runTerminalSession(f.options)
  expect(f.show).not.toHaveBeenCalled()
  expect(f.text).toHaveBeenCalledTimes(2)
  const body = f.text.mock.calls[1]?.[1]
  expect(body).toEqual(expect.arrayContaining(['You', 'Question', 'Assistant', 'Current answer']))
  expect(f.progress.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['You', 'Question']))
})

it('loads existing human conversation through the host before asking for another message', async () => {
  const f = await fixture(
    undefined,
    [],
    [
      {
        id: 'past-user',
        position: 1,
        run: null,
        type: 'user',
        createdAt: timestamp,
        blocks: [{ id: 'past-text', kind: 'text', text: 'Previous question' }],
      },
      {
        id: 'past-answer',
        position: 2,
        run: 'past-run',
        type: 'assistant',
        createdAt: timestamp,
        blocks: [{ id: 'past-answer-text', kind: 'text', text: 'Previous answer' }],
      },
    ],
  )
  f.text.mockReset().mockResolvedValue(undefined)
  await runTerminalSession({ ...f.options, session: 'session-one' })
  expect(f.text.mock.calls[0]?.[1]).toEqual(
    expect.arrayContaining(['You', 'Previous question', 'Assistant', 'Previous answer']),
  )
  expect(f.submit()).toBeUndefined()
})

it('refuses a foreign history response before exposing a composer or submitting input', async () => {
  const f = await fixture('history')
  expect(await runTerminalSession(f.options)).toMatchObject({
    outcome: { kind: 'blocked', reason: 'history-unavailable' },
  })
  expect(f.text).not.toHaveBeenCalled()
  expect(f.submit()).toBeUndefined()
})
