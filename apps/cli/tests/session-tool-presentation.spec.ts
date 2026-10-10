import { expect, it, vi } from 'vitest'
import { createLocalSessionAccess } from '@omne-harness-lite/session-runtime-local'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type {
  PreparedToolExecution,
  ExecutionObserver,
  ToolPoolInstance,
} from '@omne-harness-lite/tool-execution-runtime'
import { createSessionPresentation } from '../src/session-presentation.ts'
import { observeSessionToolPool } from '../src/session-tool-presentation.ts'

const tenant = unwrap(parseTenantId({ organization: 'organization', account: 'account' }))
const scope = { tenant, session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')) }
async function fixture(toHuman: boolean) {
  const owner = createLocalSessionAccess({
    tenant,
    principal: { principal: 'user', principalKind: 'human' },
    consumers: ['tool'],
    operations: ['tool.read'],
    policy: { maxBindings: 2, maxContextKeys: 2 },
    authority: { check: async identity => ({ kind: 'authorized', identity }) },
  })
  const grant = await owner.issuer.issue({
    principal: 'user',
    principalKind: 'human',
    scope,
    consumer: 'tool',
    contextKeys: [],
    operations: ['tool.read'],
  })
  if (grant.kind !== 'issued') throw Error('fixture access')
  const callId = unwrap(parseOpaqueIdentifier('call', 'CallId'))
  const request: PreparedToolExecution = {
    access: grant.access,
    ref: { ...scope, callId },
    origin: {
      run: unwrap(parseOpaqueIdentifier('run', 'RunId')),
      attempt: 1,
      assistantMessage: 'message',
    },
    call: {
      id: unwrap(parseOpaqueIdentifier('block', 'BlockId')),
      kind: 'tool_call',
      complete: true,
      callId,
      tool: unwrap(parseOpaqueIdentifier('Shell', 'ModelToolName')),
      arguments: {},
      visibility: { toHuman, toModel: true },
    },
    source: { ...scope, journalGeneration: 'journal', tail: 1 },
    afterAction: { pass: 'pass', selectedChain: [] },
    adoption: 'adoption',
    notExecutable: 'no_such_entry',
  }
  const release = vi.fn(),
    read = vi.fn<ExecutionObserver['read']>(async () => {
      throw Error('read failed')
    })
  const frames = vi.fn<ExecutionObserver['frames']>(async () => ({
    kind: 'rejected',
    reason: 'notFound',
  }))
  const pool: ToolPoolInstance = {
    ready: Promise.resolve(),
    idle: async () => {},
    close: async () => {},
    operations: {
      submit: async () => ({ kind: 'recorded', execution: request.ref }),
      acquire: async () => ({
        kind: 'acquired',
        observer: {
          read,
          waitForEnd: read,
          frames,
          release,
        },
      }),
      stop: async () => 'stopped',
      answer: async () => 'accepted',
    },
  }
  return { owner, request, pool, release, read, frames }
}
it('does not publish a private tool name through the production observation wrapper', async () => {
  const f = await fixture(false),
    store = createSessionPresentation({ maxCalls: 4, maxBlocks: 8, maxCharactersPerCall: 200 })
  try {
    const observed = observeSessionToolPool(f.pool, scope, 'run', store)
    expect(await observed.operations.submit(f.request)).toEqual({
      kind: 'recorded',
      execution: f.request.ref,
    })
    expect((await store.read(scope, 'run')).items).toEqual([])
    expect(f.read).not.toHaveBeenCalled()
  } finally {
    await f.owner.close()
  }
})
it('releases the actual observer after a read failure without changing submission or closing its pool', async () => {
  const f = await fixture(true),
    store = createSessionPresentation({ maxCalls: 4, maxBlocks: 8, maxCharactersPerCall: 200 })
  try {
    const observed = observeSessionToolPool(f.pool, scope, 'run', store)
    await observed.operations.submit(f.request)
    expect((await store.read(scope, 'run')).items).toEqual([
      {
        id: 'block',
        kind: 'tool_call',
        tool: 'Shell',
        call: 'call',
        arguments: { encoding: 'json', text: '{}' },
        observation: {
          state: 'unavailable',
          blocks: [],
          notice: 'Tool observation unavailable',
          offloaded: false,
        },
      },
    ])
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    await f.owner.close()
  }
})

it('shows terminal result text and failure cause, releases observers, and reuses the terminal observation', async () => {
  const f = await fixture(true)
  f.read.mockResolvedValue({
    kind: 'found',
    snapshot: {
      ref: f.request.ref,
      origin: f.request.origin,
      adoptedContext: [],
      resources: [],
      state: {
        phase: 'ended',
        terminal: { outcome: 'failed', code: 'start_failed', result: 'actual failure body' },
        account: {
          callId: f.request.call.callId,
          initiator: tenant,
          externalEffect: 'unknown',
          cost: { total_usd: 'unknown', items: [] },
          frames: 'unknown',
          wallClock: { startedAt: '2026-10-10T00:00:00Z' },
        },
      },
    },
  })
  const store = createSessionPresentation({ maxCalls: 4, maxBlocks: 8, maxCharactersPerCall: 200 })
  try {
    await observeSessionToolPool(f.pool, scope, 'run', store).operations.submit(f.request)
    const first = await store.read(scope, 'run')
    expect(first.items).toMatchObject([
      {
        kind: 'tool_call',
        observation: {
          state: 'failed',
          notice: 'start_failed',
          blocks: [{ text: 'actual failure body' }],
        },
      },
    ])
    expect((await store.read(scope, 'run')).items).toEqual(first.items)
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    await f.owner.close()
  }
})
it('does not misattribute another Run to this presentation', async () => {
  const f = await fixture(true)
  const store = createSessionPresentation({ maxCalls: 4, maxBlocks: 8, maxCharactersPerCall: 200 })
  try {
    await observeSessionToolPool(f.pool, scope, 'different-run', store).operations.submit(f.request)
    expect((await store.read(scope, 'different-run')).items).toEqual([])
    expect(f.read).not.toHaveBeenCalled()
  } finally {
    await f.owner.close()
  }
})

it('shows cumulative public tool frames and excludes private frame content', async () => {
  const f = await fixture(true)
  f.read.mockResolvedValue({
    kind: 'found',
    snapshot: {
      ref: f.request.ref,
      origin: f.request.origin,
      adoptedContext: [],
      resources: [],
      state: { phase: 'running', startedAt: '2026-10-10T00:00:00Z' },
    },
  })
  f.frames.mockResolvedValue({
    kind: 'snapshot',
    value: {
      position: 1,
      blocks: [
        {
          index: 0,
          closed: false,
          opened: {
            id: unwrap(parseOpaqueIdentifier('frame', 'BlockId')),
            kind: 'text',
            fill: 'append',
            visibility: { toHuman: true, toModel: true },
          },
          content: 'real frame',
        },
        {
          index: 1,
          closed: false,
          opened: {
            id: unwrap(parseOpaqueIdentifier('hidden-frame', 'BlockId')),
            kind: 'thinking',
            fill: 'append',
            visibility: { toHuman: false, toModel: true },
          },
          content: 'private frame',
        },
      ],
    },
  })
  const store = createSessionPresentation({ maxCalls: 4, maxBlocks: 8, maxCharactersPerCall: 200 })
  try {
    await observeSessionToolPool(f.pool, scope, 'run', store).operations.submit(f.request)
    const read = await store.read(scope, 'run')
    expect(JSON.stringify(read)).toContain('real frame')
    expect(JSON.stringify(read)).not.toContain('private frame')
    expect(f.frames).toHaveBeenCalledOnce()
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    await f.owner.close()
  }
})
