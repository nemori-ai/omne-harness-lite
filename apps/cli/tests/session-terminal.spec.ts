import { checkSession } from '@omne-harness-lite/session-log'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
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
const timestamp = '2026-10-10T18:00:00Z'
async function fixture(
  fault?: 'clock' | 'unknown' | 'wait' | 'model',
  toolTexts: readonly string[] = [],
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
        return {
          kind: 'messages',
          source,
          messages: [
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
              blocks: toolTexts.map((text, index) => ({ id: `tool-${index}`, kind: 'text', text })),
            },
            {
              id: 'answer',
              position: 9,
              run: 'run-one',
              type: 'assistant',
              createdAt: timestamp,
              blocks: [{ id: 'answer-text', kind: 'text', text: 'Current answer' }],
            },
          ],
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
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValueOnce('Question')
    .mockResolvedValue(undefined)
  const show = vi.fn(async () => true)
  const identity = vi.fn()
  let identityNumber = 0
  return {
    execute,
    host,
    submit: () => submit,
    create: () => create,
    text,
    show,
    identity,
    options: {
      home,
      binding,
      routeName: 'selected-route',
      session: null,
      workspace: '/workspace',
      signal: new AbortController().signal,
      originalId: () => `id-${++identityNumber}`,
      policy,
      dialog: { text, show, identity, choose: async () => undefined },
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
  expect(f.show).toHaveBeenCalledExactlyOnceWith('Assistant', ['Current answer'])
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
  expect(f.show).toHaveBeenCalledExactlyOnceWith('Assistant', [
    'Tool output (completed)',
    'command output',
    'diagnostic output',
    'Exit code: 0',
    'Output omitted: 8 bytes, 2 frames',
    'Transport omitted: 3 bytes',
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
  expect(f.show).toHaveBeenCalledExactlyOnceWith('Assistant', [...values, 'Current answer'])
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
it('keeps an accepted queued input and its identity when the bounded wait expires', async () => {
  const f = await fixture('wait')
  expect(
    await runTerminalSession({ ...f.options, policy: { ...policy, maxWaitMs: 30 } }),
  ).toMatchObject({
    outcome: {
      status: 'accepted',
      reason: 'waitExpired',
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
