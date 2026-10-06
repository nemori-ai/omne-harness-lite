import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type {
  ToolActionFacts,
  ToolAdmissionOperations,
  AdmissionToken,
} from '@omne-harness-lite/tool-admission'
import {
  captureToolJournalValue,
  prepareToolJournalEntry,
  projectToolJournal,
  type ExecutionSubmission,
} from '@omne-harness-lite/tool-execution-runtime'
import type { RuntimeJournalView } from '../src/runtime-journal.ts'
import {
  captureSubmission,
  createSubmissionAdmission,
  submissionIdentity,
} from '../src/submission.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'submit-org', account: 'submit-user' })),
  session: unwrap(parseOpaqueIdentifier('submit-session', 'SessionRef')),
}
// These two opaque bindings are controlled ports. This unit does not establish live issuer authorization or official provenance.
const access = Object.freeze({}) as SessionAccess
const token = 'controlled-locator' as AdmissionToken
const parsedCall = {
  id: unwrap(parseOpaqueIdentifier('block', 'BlockId')),
  visibility: { toHuman: true, toModel: true },
  kind: 'tool_call' as const,
  callId: unwrap(parseOpaqueIdentifier('call', 'CallId')),
  complete: true as const,
  tool: 'echo',
  arguments: { value: 1 },
}
const request: ExecutionSubmission = {
  access,
  scope,
  origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
  adoption: 'adoption',
  call: parsedCall,
  admissionToken: token,
}
const definition = {
  name: 'echo',
  description: 'Echo the value',
  paradigm: 'single' as const,
  origin: { kind: 'authored' as const },
  input: {
    type: 'object' as const,
    properties: { value: { type: 'number' as const, description: 'Value to return' } },
    description: 'Input',
  },
  permissions: { execute: { default: 'auto' as const } },
}
function facts(): ToolActionFacts {
  return {
    origin: request.origin,
    latestAttempt: 1,
    runState: 'open',
    calls: [request.call],
    route: { kind: 'none' },
    adoption: {
      key: 'adoption',
      tools: [
        { name: 'echo', capability: 'tool:echo', asset: 'echo-asset', version: '1', definition },
      ],
      report: {
        session: scope.session,
        runId: 'run',
        attempt: 1,
        computedAt: 0 as ToolActionFacts['adoption']['report']['computedAt'],
        snapshots: [],
        availability: [],
        mcpActions: [],
        endpointHoldings: [],
        effectivePermissions: {},
        skillGate: [],
      },
    },
    batch: {
      kind: 'complete',
      completion: {
        key: 'completed',
        gate: { kind: 'available' },
        items: [
          {
            callId: request.call.callId,
            effectiveCall: request.call,
            conclusions: ['official'],
            decision: { kind: 'allow', conclusion: 'official' },
          },
        ],
      },
    },
  }
}
function fixture() {
  let open = true
  let view: RuntimeJournalView = {
    kind: 'view',
    prefix: { scope, ownerGeneration: 'physical-owner', tail: 10, entries: [] },
    executions: new Map(),
    facts: facts(),
  }
  const authorize = vi.fn<SessionAccessOperations['authorize']>(async () => ({
    kind: 'authorized',
    identity: {
      binding: 'controlled',
      principal: 'user',
      principalKind: 'human',
      scope,
      consumer: 'tool',
      contextKeys: [],
    },
  }))
  const read = vi.fn(async () => view)
  const verifyToken = vi.fn<ToolAdmissionOperations['verifyToken']>(async () => ({
    kind: 'valid',
    checked: { scope, ownerGeneration: 'physical-owner', tail: 10 },
  }))
  const admission: ToolAdmissionOperations = {
    verifyToken,
    forPass: async () => ({ kind: 'rejected', reason: 'passUnavailable' }),
  }
  let current: ToolAdmissionOperations | undefined = admission
  const check = createSubmissionAdmission({
    authorization: { authorize },
    journal: { read },
    admission: () => current,
    isOpen: () => open,
    attempts: 2,
  })
  return {
    check,
    get view() {
      return view
    },
    authorize,
    read,
    verifyToken,
    replaceFacts(patch: Partial<ToolActionFacts>) {
      view = { ...view, facts: { ...view.facts!, ...patch } }
    },
    removeAdmission() {
      current = undefined
    },
    close() {
      open = false
    },
  }
}

test('uses the actual checked physical generation and exact tail without upgrading a previous token check', async () => {
  const f = fixture()
  f.verifyToken.mockResolvedValueOnce({
    kind: 'valid',
    checked: { scope, ownerGeneration: 'physical-owner', tail: 11 },
  })
  const result = await f.check(request)
  expect(result).toHaveProperty('kind', 'admitted')
  expect(f.verifyToken).toHaveBeenCalledTimes(2)
  expect(f.read).toHaveBeenCalledTimes(2)
  if (result.kind !== 'admitted') throw new Error('expected admitted input')
  expect(result.view.prefix.tail).toBe(10)
  expect(result.selected).toMatchObject({ asset: 'echo-asset', version: '1', adoption: 'adoption' })
  expect(result.request.access).toBe(access)
})
test('a changed physical generation fails rather than admitting against a different owner', async () => {
  const f = fixture()
  f.verifyToken.mockResolvedValue({
    kind: 'valid',
    checked: { scope, ownerGeneration: 'new-owner', tail: 10 },
  })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
  expect(f.verifyToken).toHaveBeenCalledTimes(1)
})
test('bounded repeated tail mismatch retains failure instead of pretending the last view was verified', async () => {
  const f = fixture()
  f.verifyToken.mockResolvedValue({
    kind: 'valid',
    checked: { scope, ownerGeneration: 'physical-owner', tail: 11 },
  })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
  expect(f.verifyToken).toHaveBeenCalledTimes(2)
})
test('checks current authorization before reading object existence and again after verification', async () => {
  const f = fixture()
  f.authorize.mockResolvedValueOnce({ kind: 'rejected', reason: 'notAuthorized' })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(f.read).not.toHaveBeenCalled()
  f.verifyToken.mockImplementationOnce(async () => {
    f.authorize.mockResolvedValue({ kind: 'rejected', reason: 'notAuthorized' })
    return { kind: 'valid', checked: { scope, ownerGeneration: 'physical-owner', tail: 10 } }
  })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
})
test('does not admit a newly submitted execution after optional admission withdrawal or owner closure', async () => {
  const f = fixture()
  f.verifyToken.mockImplementationOnce(async () => {
    f.removeAdmission()
    return { kind: 'valid', checked: { scope, ownerGeneration: 'physical-owner', tail: 10 } }
  })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
  f.close()
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
})
test('complete-batch and denial guards also apply to token-exempt calls', async () => {
  const f = fixture()
  const { admissionToken: _token, ...base } = request
  const captured: ExecutionSubmission = {
    ...base,
    call: {
      id: parsedCall.id,
      visibility: parsedCall.visibility,
      kind: 'tool_call',
      callId: request.call.callId,
      complete: true,
      tool: 'echo',
      rawArguments: '{',
      unparseable: true,
    },
  }
  const unparseable = captured
  f.replaceFacts({ calls: [unparseable.call], batch: { kind: 'pending' } })
  expect(await f.check(captured)).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
  f.replaceFacts({
    batch: {
      kind: 'complete',
      completion: {
        key: 'completed',
        gate: { kind: 'missing', reason: 'contribution' },
        items: [
          {
            callId: request.call.callId,
            effectiveCall: unparseable.call,
            conclusions: [],
            decision: {
              kind: 'denied',
              conclusion: 'completed',
              reason: {
                kind: 'admission_unavailable',
                by: 'official-tool-admission',
                conclusion: 'completed',
                explanation: 'Official admission is unavailable',
              },
            },
          },
        ],
      },
    },
  })
  expect(await f.check(captured)).toEqual({ kind: 'rejected', reason: 'callConflict' })
  f.replaceFacts({
    batch: {
      kind: 'complete',
      completion: {
        key: 'completed',
        gate: { kind: 'available' },
        items: [
          {
            callId: request.call.callId,
            effectiveCall: unparseable.call,
            conclusions: [],
            decision: { kind: 'notExecutable', reason: 'unparseable' },
          },
        ],
      },
    },
  })
  expect(await f.check(captured)).toMatchObject({ kind: 'admitted', notExecutable: 'unparseable' })
  expect(f.verifyToken).not.toHaveBeenCalled()
  f.replaceFacts({ route: { kind: 'denial', intentKey: 'denied' } })
  expect(await f.check(captured)).toEqual({ kind: 'rejected', reason: 'callConflict' })
})
test('captures ordinary input before IO, retains access identity, and never invokes getters', async () => {
  const f = fixture()
  const mutable = { ...request, call: { ...parsedCall, arguments: { value: 1 } } }
  f.authorize.mockImplementationOnce(async () => {
    mutable.call.arguments.value = 2
    return {
      kind: 'authorized',
      identity: {
        binding: 'controlled',
        principal: 'user',
        principalKind: 'human',
        scope,
        consumer: 'tool',
        contextKeys: [],
      },
    }
  })
  const result = await f.check(mutable)
  expect(result).toHaveProperty('kind', 'admitted')
  expect(f.verifyToken.mock.calls[0]?.[3]).toEqual(request.call)
  const get = vi.fn(() => request.call)
  const hostile = { ...request }
  Object.defineProperty(hostile, 'call', { enumerable: true, get })
  expect(captureSubmission(hostile)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
  expect(get).not.toHaveBeenCalled()
  const throwingProxy = new Proxy(request, {
    getPrototypeOf() {
      throw new Error('hostile proxy')
    },
  })
  expect(await f.check(throwingProxy)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
})
test('recognizes only the same accepted execution input after the original Run ends without rechecking new admission', async () => {
  const f = fixture()
  const payload = captureToolJournalValue({
    revision: 1,
    ref: { ...scope, callId: request.call.callId },
    kind: 'execution_intended',
    origin: request.origin,
    input: { format: 'tool-input/1', submission: submissionIdentity(request) },
    selected: {
      capability: 'tool:echo',
      asset: 'echo-asset',
      version: '1',
      definition,
      adoption: 'adoption',
    },
  })
  if ('invalid' in payload) throw new Error('invalid intent fixture')
  const prepared = prepareToolJournalEntry({ origin: request.origin, value: payload })
  if ('invalid' in prepared) throw new Error('invalid entry fixture')
  const row = { ...prepared.entry, session: scope.session, position: 1 }
  const history = projectToolJournal(scope, [row])
  if (!('executions' in history)) throw new Error('invalid history fixture')
  const view = {
    ...f.view,
    executions: history.executions,
    facts: {
      ...f.view.facts!,
      runState: 'ended' as const,
      route: { kind: 'execution' as const, intentKey: row.dedupeKey! },
    },
  }
  f.read.mockResolvedValue(view)
  const duplicate = {
    ...request,
    call: { ...parsedCall, arguments: { value: new LosslessNumber('1.0') } },
  }
  expect(await f.check(duplicate)).toHaveProperty('kind', 'existing')
  expect(f.verifyToken).not.toHaveBeenCalled()
  expect(await f.check({ ...request, call: { ...parsedCall, arguments: { value: 2 } } })).toEqual({
    kind: 'rejected',
    reason: 'callConflict',
  })
})
test('ended Run or replaced attempt rejects the first execution intent', async () => {
  const f = fixture()
  f.replaceFacts({ runState: 'ended' })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runEnded' })
  f.replaceFacts({ runState: 'open', latestAttempt: 2 })
  expect(await f.check(request)).toEqual({ kind: 'rejected', reason: 'runEnded' })
  expect(f.verifyToken).not.toHaveBeenCalled()
})
