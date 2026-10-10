import { expect, it, vi } from 'vitest'
import { createLocalSessionAccess } from '@omne-harness-lite/session-runtime-local'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type {
  PreparedToolExecution,
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
    read = vi.fn(async () => {
      throw Error('read failed')
    })
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
          frames: async () => ({ kind: 'rejected', reason: 'notFound' }),
          release,
        },
      }),
      stop: async () => 'stopped',
      answer: async () => 'accepted',
    },
  }
  return { owner, request, pool, release, read }
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
      { kind: 'tool', text: 'Shell', state: 'unavailable', call: 'call' },
    ])
    expect(f.release).toHaveBeenCalledOnce()
  } finally {
    await f.owner.close()
  }
})
