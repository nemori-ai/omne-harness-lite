import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { RunnerReadScope } from '@omne-harness-lite/loop-extension-runner'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { checkSourceToken } from '@omne-harness-lite/session-log'
import type { ExecutionSubmission } from '@omne-harness-lite/tool-execution-runtime'
import { prepareDriverToolRequest } from '../src/driver-tool-request.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'owner-org', account: 'owner-user' })),
  session: unwrap(parseOpaqueIdentifier('owner-session', 'SessionRef')),
}
const source = checkSourceToken({ ...scope, journalGeneration: 'persistent-generation', tail: 3 })
if ('failure' in source) throw new Error('invalid fixture source')
const fixedSource = source.ok
const request: ExecutionSubmission = {
  access: Object.freeze({}) as ExecutionSubmission['access'],
  scope,
  adoption: 'adopted',
  origin: { run: 'owner-run', attempt: 1, assistantMessage: 'reply' },
  call: {
    id: unwrap(parseOpaqueIdentifier('call-block', 'BlockId')),
    kind: 'tool_call',
    complete: true,
    visibility: { toHuman: true, toModel: true },
    callId: unwrap(parseOpaqueIdentifier('owner-call', 'CallId')),
    tool: 'echo',
    arguments: {},
  },
}
export const extension = {
  name: 'example:after',
  position: 'after_action',
  dimension: { scope: 'each' },
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: 'example:after' },
} as const
export const selectedChain = [{ definition: extension, power: 'observe' }]

export function chainHead(
  nonempty = false,
): Awaited<ReturnType<RunnerReadScope['sources']['manifest']['readHead']>> {
  const root = { category: 'agent_definition', name: 'example:root' } as const
  const capability = { category: 'loop_extension', name: extension.name } as const
  const tuple = { capability, asset: 'ast_after', version: 1, from: 'factory' }
  const record = {
    session: scope.session,
    seq: 1,
    evaluation: {
      kind: 'given',
      ref: unwrap(parseOpaqueIdentifier('evaluation_one', 'EvaluationRef')),
    } as const,
    evaluationRef: unwrap(parseOpaqueIdentifier('evaluation_one', 'EvaluationRef')),
    tables: {
      loop_extension: {
        filledAt: unwrap(instantFromEpochMs(1)),
        composition: nonempty ? [tuple] : [],
      },
      mcp: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      plugin: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      skill: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      slash_command: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
      tool: { filledAt: unwrap(instantFromEpochMs(1)), composition: [] },
    },
    content: {
      evaluation: {
        root,
        assets: [
          { capability: root, asset: 'ast_root', version: 1, from: 'factory', replaced: [] },
          ...(nonempty ? [{ ...tuple, replaced: [] }] : []),
        ],
        composition: nonempty ? [capability] : [],
        values: nonempty
          ? [
              { capability, item: 'position', value: 'after_action', from: 'factory' },
              { capability, item: 'dimension', value: { scope: 'each' }, from: 'factory' },
              { capability, item: 'power', value: { allowed: ['observe'] }, from: 'factory' },
              { capability, item: 'usableBy', value: { allowed: ['self'] }, from: 'factory' },
            ]
          : [],
        filteredOut: [],
        unresolved: [],
      },
      compositionOrder: nonempty ? [capability] : [],
      filledBy: { kind: 'assembly' },
    },
  }
  return { head: 1, latest: { loop_extension: record } }
}

function given(nonempty = false) {
  let active = true
  const unused = vi.fn((): never => {
    throw new Error('unexpected Runner owner operation')
  })
  const holdingTenant = vi.fn<RunnerReadScope['sources']['sessionTenancy']['holdingTenant']>(
    async () => ({ tenant: scope.tenant }),
  )
  const readHead = vi.fn<RunnerReadScope['sources']['manifest']['readHead']>(async () =>
    chainHead(nonempty),
  )
  const readVersion = vi.fn<RunnerReadScope['sources']['history']['read']>(async () => ({
    version: {
      number: 1,
      publishedAt: '2026-09-29T00:00:00Z',
      content: { category: 'loop_extension', extension },
    },
  }))
  const release = vi.fn(() => {
    active = false
  })
  const held: RunnerReadScope = {
    binding: { ...scope, logGeneration: 'physical-owner-generation' },
    sources: {
      sessionTenancy: { holdingTenant },
      manifest: { readHead, dependencyPresence: unused },
      history: { read: readVersion },
      isActive: () => true,
    },
    isActive: () => active,
    release,
    owner: {
      start: unused,
      hasUnknown: unused,
      closeAdmission: unused,
      drain: unused,
      reconcileStoppedLog: unused,
    },
  }
  const acquireReplay = vi.fn(
    async (): Promise<RunnerReadScope | { failure: 'unavailable' }> => held,
  )
  const controller = new AbortController()
  return {
    held,
    holdingTenant,
    readHead,
    readVersion,
    release,
    acquireReplay,
    controller,
    revoke() {
      active = false
    },
    prepare() {
      return prepareDriverToolRequest({
        request,
        source: fixedSource,
        host: { acquireReplay, acquireDispatch: unused },
        signal: controller.signal,
        notExecutable: 'no_such_entry',
      })
    },
  }
}

test.each(['host', 'inactive', 'session', 'tenant', 'headMissing', 'headFailure'] as const)(
  'Session refuses %s before producing a prepared Tool request',
  async failure => {
    const f = given()
    switch (failure) {
      case 'host':
        f.acquireReplay.mockResolvedValue({ failure: 'unavailable' })
        break
      case 'inactive':
        f.revoke()
        break
      case 'session':
        f.acquireReplay.mockResolvedValue({
          ...f.held,
          binding: { ...f.held.binding, session: 'other-session' },
        })
        break
      case 'tenant':
        f.acquireReplay.mockResolvedValue({
          ...f.held,
          binding: {
            ...f.held.binding,
            tenant: unwrap(parseTenantId({ organization: 'foreign-org', account: 'owner-user' })),
          },
        })
        break
      case 'headMissing':
        f.readHead.mockResolvedValue({ head: 0, latest: {} })
        break
      case 'headFailure':
        f.readHead.mockResolvedValue({ failure: 'unavailable' })
        break
    }
    expect(await f.prepare()).toBeUndefined()
    expect(f.release).toHaveBeenCalledTimes(failure === 'host' ? 0 : 1)
    expect(f.readVersion).not.toHaveBeenCalled()
    if (failure !== 'headMissing' && failure !== 'headFailure')
      expect(f.holdingTenant).not.toHaveBeenCalled()
  },
)

test.each([false, true])(
  'Session captures the %s nonempty chain and releases its scope',
  async nonempty => {
    const f = given(nonempty)
    const prepared = await f.prepare()
    expect(prepared?.afterAction.selectedChain).toEqual(
      nonempty ? [{ definition: extension, power: 'observe' }] : [],
    )
    expect(prepared?.source).toEqual(fixedSource)
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.held.isActive()).toBe(false)
    expect(f.holdingTenant.mock.contexts).toEqual([f.held.sources.sessionTenancy])
    expect(f.readHead.mock.contexts).toEqual([f.held.sources.manifest])
    expect(f.readVersion).toHaveBeenCalledTimes(nonempty ? 1 : 0)
  },
)

test('physical owner generation differs from persistent journal generation without treating them as equal identities', async () => {
  const f = given()
  expect(f.held.binding.logGeneration).not.toBe(fixedSource.journalGeneration)
  expect(await f.prepare()).toBeDefined()
  expect(f.release).toHaveBeenCalledOnce()
})

test.each(['revoke', 'abort'] as const)(
  'Session rejects %s during actual Runner chain reading',
  async action => {
    const f = given(),
      entered = Promise.withResolvers<void>(),
      gate = Promise.withResolvers<void>()
    f.readHead.mockImplementation(async () => {
      entered.resolve()
      await gate.promise
      return chainHead()
    })
    const pending = f.prepare()
    await entered.promise
    if (action === 'revoke') f.revoke()
    else f.controller.abort()
    gate.resolve()
    expect(await pending).toBeUndefined()
    expect(f.release).toHaveBeenCalledOnce()
  },
)

test('Runner captures source functions and original receivers before suspension', async () => {
  const f = given(true),
    entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  f.holdingTenant.mockImplementation(async () => {
    entered.resolve()
    await gate.promise
    return { tenant: scope.tenant }
  })
  const pending = f.prepare()
  await entered.promise
  const replaced = vi.fn((): never => {
    throw new Error('replacement source used')
  })
  f.held.sources.sessionTenancy.holdingTenant = replaced
  f.held.sources.manifest.readHead = replaced
  f.held.sources.history.read = replaced
  gate.resolve()
  expect((await pending)?.afterAction.selectedChain).toEqual([
    { definition: extension, power: 'observe' },
  ])
  expect(replaced).not.toHaveBeenCalled()
  expect(f.holdingTenant.mock.contexts).toEqual([f.held.sources.sessionTenancy])
  expect(f.readHead.mock.contexts).toEqual([f.held.sources.manifest])
  expect(f.readVersion.mock.contexts).toEqual([f.held.sources.history])
  expect(f.release).toHaveBeenCalledOnce()
})
