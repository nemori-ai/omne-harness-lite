import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionForMessage } from '../src/session-creation-client.ts'
import { startLocalSessionHost } from '../src/session-host-server.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import type { SessionHostRequest, SessionHostResult } from '../src/session-host-protocol.ts'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const binding = checkedTenantBinding({
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
})
const defaults = {
  definition: { category: 'agent_definition' as const, name: 'configured-root' },
  executionType: 'interactive',
  mode: 'never' as const,
  collaboration: 'co-work' as const,
}
const operation = {
  tenant: binding.tenant,
  principal: 'owner',
  operation: 'createSession' as const,
  operationKey: 'original-create',
  session: null,
}
const source = {
  tenant: binding.tenant,
  session: 'created-session',
  journalGeneration: 'original-generation',
  tail: 3,
}
const receipt = { operation, source, position: 3 }
async function setup(execute: (request: SessionHostRequest) => Promise<unknown>) {
  const home = await mkdtemp(join(tmpdir(), 'omne-create-client-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const actual = vi.fn(execute)
  // The peer intentionally sends malformed data in negative cases. No live authority is synthesized.
  const host = await startLocalSessionHost({
    home,
    binding,
    endpoint: { execute: async request => (await actual(request)) as SessionHostResult },
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
  cleanup.push(() => host.close())
  const originalId = vi.fn(() => 'original-create'),
    controller = new AbortController()
  return {
    actual,
    controller,
    originalId,
    options: {
      home,
      binding,
      signal: controller.signal,
      originalId,
      policy: { timeoutMs: 1000, maxResponseBytes: 65536 },
    },
  }
}
it('captures the actual defaults and recognizes only its complete original creation receipt', async () => {
  const f = await setup(async request =>
    request.command === 'readCreationDefaults'
      ? { kind: 'creationDefaults', defaults }
      : { kind: 'created', session: 'created-session', receipt },
  )
  const result = await createSessionForMessage(f.options)
  expect(result).toEqual({ kind: 'created-session', session: 'created-session', receipt })
  expect(f.originalId).toHaveBeenCalledOnce()
  expect(f.actual.mock.calls.map(([x]) => x.command)).toEqual([
    'readCreationDefaults',
    'createSession',
  ])
  expect(f.actual.mock.calls[1]?.[0]).toEqual({
    format: 'omne-session-host/1',
    binding,
    command: 'createSession',
    input: { ...defaults, operationKey: 'original-create' },
  })
})
it.each(['missing', 'invalid'] as const)(
  'does not allocate an operation or create a Session when host defaults are %s',
  async kind => {
    const f = await setup(async () =>
      kind === 'missing'
        ? { kind: 'creationNotReady' }
        : { kind: 'creationDefaults', defaults: { ...defaults, workspace: '/not-allowed' } },
    )
    expect(await createSessionForMessage(f.options)).toMatchObject({
      kind: 'session-creation',
      status: 'blocked',
      request: null,
      operation: null,
    })
    expect(f.actual).toHaveBeenCalledOnce()
    expect(f.originalId).not.toHaveBeenCalled()
  },
)
it('preserves the complete original operation and semantic input on unknown creation without resending', async () => {
  const f = await setup(async request =>
    request.command === 'readCreationDefaults'
      ? { kind: 'creationDefaults', defaults }
      : { kind: 'unknownCommit', operation },
  )
  expect(await createSessionForMessage(f.options)).toMatchObject({
    kind: 'session-creation',
    status: 'unconfirmed',
    reason: 'unknownCommit',
    operation,
    request: { command: 'createSession', input: { ...defaults, operationKey: 'original-create' } },
  })
  expect(f.originalId).toHaveBeenCalledOnce()
  expect(f.actual.mock.calls.map(([x]) => x.command)).toEqual([
    'readCreationDefaults',
    'createSession',
  ])
})
it.each(['principal', 'session', 'source', 'position'] as const)(
  'rejects a creation receipt with mismatched %s',
  async mismatch => {
    const wrong =
      mismatch === 'principal'
        ? { ...receipt, operation: { ...operation, principal: 'other' } }
        : mismatch === 'source'
          ? { ...receipt, source: { ...source, session: 'other' } }
          : mismatch === 'position'
            ? { ...receipt, position: 4 }
            : receipt
    const f = await setup(async request =>
      request.command === 'readCreationDefaults'
        ? { kind: 'creationDefaults', defaults }
        : {
            kind: 'created',
            session: mismatch === 'session' ? 'other' : 'created-session',
            receipt: wrong,
          },
    )
    expect(await createSessionForMessage(f.options)).toMatchObject({
      kind: 'session-creation',
      status: 'unconfirmed',
      reason: 'invalidCreationReply',
      operation,
    })
    expect(f.actual).toHaveBeenCalledTimes(2)
  },
)
it('keeps explicit rejection separate from an unknown creation', async () => {
  const f = await setup(async request =>
    request.command === 'readCreationDefaults'
      ? { kind: 'creationDefaults', defaults }
      : { failure: 'definitionUnavailable' },
  )
  expect(await createSessionForMessage(f.options)).toMatchObject({
    kind: 'session-creation',
    status: 'rejected',
    reason: 'definitionUnavailable',
    operation,
  })
})
it('detaches only the client wait and preserves the original request while creation finishes', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  const f = await setup(async request => {
    if (request.command === 'readCreationDefaults') return { kind: 'creationDefaults', defaults }
    entered.resolve()
    await gate.promise
    return { kind: 'created', session: 'created-session', receipt }
  })
  const waiting = createSessionForMessage(f.options)
  void waiting.catch(error => entered.reject(error))
  try {
    await entered.promise
    f.controller.abort()
    expect(await waiting).toMatchObject({
      status: 'unconfirmed',
      operation,
      request: { command: 'createSession' },
    })
  } finally {
    gate.resolve()
  }
  expect(f.actual).toHaveBeenCalledTimes(2)
})
