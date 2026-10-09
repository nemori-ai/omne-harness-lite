import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startLocalSessionHost } from '../src/session-host-server.ts'
import { parseSessionHostRequest, type SessionHostEndpoint } from '../src/session-host-protocol.ts'
import { submitSessionMessage, type SessionMessageOutcome } from '../src/session-message-client.ts'
import type { SubmitRequest } from '../src/session-message-replies.ts'
import { entryExitCode, runEntryCli } from '../src/entry-application.ts'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { positiveInteger } from '@omne-harness-lite/session-log'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const binding = {
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
}
const checked = parseSessionHostRequest({
  format: 'omne-session-host/1',
  binding,
  command: 'submitInput',
  session: 'actual-session',
  operationKey: 'original-submit',
  message: {
    id: 'original-input',
    type: 'user',
    createdAt: '2026-10-08T00:00:00Z',
    blocks: [
      {
        id: 'original-text',
        kind: 'text',
        text: 'question',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  },
})
if (!checked || checked.command !== 'submitInput') throw new Error('invalid fixture')
const request: SubmitRequest = checked
const operation = {
  tenant: request.binding.tenant,
  principal: 'trusted-owner',
  session: request.session,
  operation: 'submitInput' as const,
  operationKey: request.operationKey,
}
const source = {
  tenant: request.binding.tenant,
  session: request.session,
  journalGeneration: 'actual-journal',
  tail: 8,
}
const receipt = { operation, position: 2, source: { ...source, tail: 2 } }
const submission = {
  kind: 'submission' as const,
  receipt,
  source,
  inputPosition: 1,
  messageId: request.message.id,
  run: { id: 'original-run', state: 'completed' as const },
}
const text = (id: string, position: number, run: string | null) => ({
  id,
  position,
  run,
  type: 'assistant' as const,
  createdAt: '2026-10-08T00:00:00Z',
  blocks: [{ id: `${id}-text`, kind: 'text' as const, text: id }],
})
const history = {
  kind: 'messages' as const,
  source,
  messages: [
    text('previous-reply', 3, 'previous-run'),
    text('this-reply', 6, 'original-run'),
    text('late-other-reply', 7, 'other-run'),
  ],
}
const hostPolicy = {
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
}
const policy = { maxResponseBytes: 65536, timeoutMs: 1000, maxWaitMs: 1000, pollIntervalMs: 5 }
async function fixture(
  read: SessionHostEndpoint['execute'] = async packet => {
    if (packet.command === 'submitInput') return { kind: 'accepted', receipt }
    if (packet.command === 'readSubmission') return submission
    if (packet.command === 'readMessages') return history
    throw new Error('unexpected request')
  },
) {
  const home = await mkdtemp(join(tmpdir(), 'omne-session-message-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const execute = vi.fn(read)
  const host = await startLocalSessionHost({
    home,
    binding: request.binding,
    endpoint: { execute },
    policy: hostPolicy,
    diagnostic: error => {
      throw error
    },
  })
  cleanup.push(() => host.close())
  const controller = new AbortController()
  return {
    home,
    execute,
    host,
    controller,
    options: { home, request, policy, signal: controller.signal },
  }
}
it('submits exactly once and returns only human messages from the Run consuming the original input', async () => {
  const f = await fixture()
  const outcome = await submitSessionMessage(f.options)
  expect(outcome).toMatchObject({
    status: 'completed',
    receipt,
    submission,
    messages: [text('this-reply', 6, 'original-run')],
  })
  expect(f.execute.mock.calls.map(([packet]) => packet.command)).toEqual([
    'submitInput',
    'readSubmission',
    'readMessages',
  ])
  expect(entryExitCode({ outcome, diagnostics: [] })).toBe(0)
  expect(outcome.request).toEqual({
    binding: request.binding,
    session: request.session,
    operationKey: request.operationKey,
    messageId: request.message.id,
  })
  expect(outcome.request).not.toHaveProperty('message')
})
it('keeps a queued original input accepted when its bounded wait expires without mistaking an earlier terminal Run', async () => {
  const f = await fixture(async packet =>
    packet.command === 'submitInput' ? { kind: 'accepted', receipt } : { ...submission, run: null },
  )
  const outcome = await submitSessionMessage({ ...f.options, policy: { ...policy, maxWaitMs: 30 } })
  expect(outcome).toMatchObject({
    status: 'accepted',
    receipt,
    submission: { run: null },
    reason: 'waitExpired',
  })
  expect(f.execute.mock.calls.filter(([packet]) => packet.command === 'submitInput')).toHaveLength(
    1,
  )
  expect(f.execute.mock.calls.some(([packet]) => packet.command === 'readMessages')).toBe(false)
  expect(entryExitCode({ outcome, diagnostics: [] })).toBe(4)
})
it.each(['foreign-operation', 'foreign-generation', 'changed-receipt', 'different-message'])(
  'refuses a %s observation while preserving the accepted original receipt',
  async fault => {
    const bad =
      fault === 'foreign-operation'
        ? {
            ...submission,
            receipt: { ...receipt, operation: { ...operation, operationKey: 'other-operation' } },
          }
        : fault === 'foreign-generation'
          ? { ...submission, source: { ...source, journalGeneration: 'other-journal' } }
          : fault === 'changed-receipt'
            ? { ...submission, receipt: { ...receipt, position: 3 } }
            : { ...submission, messageId: 'other-message' }
    const f = await fixture(async packet =>
      packet.command === 'submitInput' ? { kind: 'accepted', receipt } : bad,
    )
    const outcome = await submitSessionMessage(f.options)
    expect(outcome).toMatchObject({ status: 'unconfirmed', receipt, reason: 'invalidSubmission' })
    expect(f.execute.mock.calls).toHaveLength(2)
  },
)
it('retains the exact unknownCommit OperationRef and never resubmits or polls it as accepted', async () => {
  const f = await fixture(async () => ({ kind: 'unknownCommit', operation }))
  expect(await submitSessionMessage(f.options)).toMatchObject({
    status: 'unconfirmed',
    reason: 'unknownCommit',
    operation,
    receipt: null,
  })
  expect(f.execute).toHaveBeenCalledTimes(1)
})
it('preserves acceptance when the client detaches and does not send a cancellation to the host', async () => {
  let f: Awaited<ReturnType<typeof fixture>>
  f = await fixture(async packet => {
    if (packet.command === 'submitInput') return { kind: 'accepted', receipt }
    f.controller.abort()
    return { ...submission, run: null }
  })
  const outcome = await submitSessionMessage(f.options)
  expect(outcome).toMatchObject({ status: 'accepted', receipt, reason: 'detached' })
  expect(f.execute.mock.calls.map(([packet]) => packet.command)).toEqual([
    'submitInput',
    'readSubmission',
  ])
  expect(f.host).toHaveProperty('socketPath')
})
it.each(['failed', 'cancelled'] as const)(
  'does not return success for an original Run that %s',
  async state => {
    const f = await fixture(async packet =>
      packet.command === 'submitInput'
        ? { kind: 'accepted', receipt }
        : packet.command === 'readSubmission'
          ? { ...submission, run: { id: 'original-run', state } }
          : history,
    )
    const outcome = await submitSessionMessage(f.options)
    expect(outcome).toHaveProperty('status', state)
    expect(entryExitCode({ outcome, diagnostics: [] })).toBe(3)
  },
)
it('does not expose raw blocks or accept a message prefix predating the original terminal observation', async () => {
  const f = await fixture(async packet =>
    packet.command === 'submitInput'
      ? { kind: 'accepted', receipt }
      : packet.command === 'readSubmission'
        ? submission
        : { ...history, source: { ...source, tail: 7 } },
  )
  const outcome = await submitSessionMessage(f.options)
  expect(outcome).toMatchObject({ status: 'unconfirmed', receipt, reason: 'invalidMessages' })
  expect(outcome).not.toHaveProperty('messages')
})
it('writes original receipt coordinates beyond the safe integer range without rounding', async () => {
  const parsed = readJsonStrict('9007199254740993')
  if ('failed' in parsed || !positiveInteger(parsed.ok)) throw new Error('invalid exact fixture')
  const saved = { ...receipt, position: parsed.ok, source: { ...receipt.source, tail: parsed.ok } }
  const f = await fixture(async () => ({ kind: 'unknownCommit', operation }))
  const observed = await submitSessionMessage(f.options)
  // The wire codecs already reject shape errors. This case checks the final output boundary.
  const outcome: SessionMessageOutcome = { ...observed, receipt: saved }
  let output = ''
  expect(
    await runEntryCli(
      ['--session', request.session, '--message-file', '/not-read-by-output-test', '--json'],
      {
        signal: f.controller.signal,
        isTTY: false,
        version: async () => '',
        execute: async () => ({ outcome, diagnostics: [] }),
        stdout: async text => {
          output += text
        },
        stderr: async () => {},
      },
    ),
  ).toBe(4)
  expect(output).toContain('"position":9007199254740993')
  expect(output).toContain('"tail":9007199254740993')
  expect(output).not.toContain('9007199254740992')
})
