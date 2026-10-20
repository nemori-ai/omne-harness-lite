// Runs inside an install-closure consumer directory, so it sees only the installed packages: a
// caller outside the repository delivers a call through injected credential ports and judges a
// custodian snapshot. Any failed assertion exits non-zero and fails the closure report.
import assert from 'node:assert/strict'
import { deliver, executeModel, judgePresence, judgeResolution } from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeModelInstanceId,
} from '@omne-harness/model-contract'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { judgeContentBlock } from '@omne-harness/content-block'

function identity(account, organization) {
  const a = accountCodec.parse(account)
  const o = organizationCodec.parse(organization)
  assert.ok(a.ok && o.ok, 'fixture identity')
  return tenant(o.value, a.value)
}

function credentialId(text) {
  const decoded = decodeCredentialId(text)
  assert.ok('ok' in decoded, 'fixture credential id')
  return decoded.ok
}

const owner = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
const stranger = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')
const held = credentialId('cred-held')
const reference = { id: held, tenant: owner, purpose: MODEL_SEND }
const face = { authorized: true, official: false }

const state = {
  closed: false,
  factorySecret: 'synthetic-factory',
  bindings: [
    { id: held, tenant: owner, purpose: MODEL_SEND, secret: 'synthetic-tenant', life: 'active' },
  ],
}

// A port that only judges: it stands in for any custodian that hands over a snapshot.
const port = { resolve: (ref, sendFace) => judgeResolution(state, ref, sendFace) }

const sent = deliver({ reference }, port, face)
assert.deepEqual(sent.send, { sent: true, value: 'synthetic-tenant' })
assert.deepEqual(sent.record, { reference })

const denied = deliver({ reference: { ...reference, tenant: stranger } }, port, face)
assert.deepEqual(denied.send, { sent: false })

const absent = deliver({ reference: { ...reference, id: credentialId('cred-none') } }, port, face)
assert.deepEqual(absent.send, { sent: false })

assert.deepEqual(judgeResolution(state, reference, face), {
  kind: 'value',
  scope: 'tenant',
  value: 'synthetic-tenant',
})
assert.deepEqual(judgeResolution(state, { ...reference, tenant: stranger }, face), {
  kind: 'denied',
})
assert.deepEqual(judgeResolution(state, { ...reference, id: credentialId('cred-none') }, face), {
  kind: 'absent',
})
assert.equal(judgePresence(state, reference).present, true)
console.log('scenario ok: value, denied, absent and a minted-tenant judgment')

const testing = await import('@omne-harness/model/testing')
const { createModelRuntime, createModelSendBoundary } = await import('@omne-harness/model')
assert.deepEqual(Object.keys(testing).sort(), [
  'createMemoryModelCommands',
  'createTestModelDependencies',
])
const assembled = testing.createTestModelDependencies({
  owners: [],
  evidence: [],
  authority: {
    authorize: () => ({ failure: { kind: 'denied', action: 'fixture' } }),
    execution: () => ({ failure: { kind: 'denied', action: 'fixture' } }),
  },
  limits: {
    scanPageCalls: 2,
    resultPageParts: 1,
    resultPageTargetBytes: 1024,
    readIdleMs: 1000,
    capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
  },
  start: '2026-10-19T00:00:00Z',
  maxWaiters: 2,
  maxQueued: 2,
  sends: [],
})
const shell = createModelRuntime(assembled.dependencies, {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  readIdleMs: 1000,
  resultPageTargetBytes: 128,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
})
assert.deepEqual(await shell.quiesce(), {
  failure: {
    kind: 'unavailable',
    dependency: 'model-runtime',
    diagnostic: 'managed-runtime-not-implemented operation=quiesce stage=5.5',
  },
})
const decodedCall = decodeModelCallId('mcall_installed')
assert.ok('ok' in decodedCall, 'fixture model call id')
assert.deepEqual(
  await shell.runtime.instances.connect({
    tenant: owner,
    principal: 'synthetic',
    call: decodedCall.ok,
  }),
  {
    failure: {
      kind: 'unavailable',
      dependency: 'model-runtime',
      diagnostic: 'managed-runtime-not-implemented operation=instances.connect stage=3.5',
    },
  },
)
assert.equal('driver' in shell.runtime, false)

const adoption = name => ({
  owner: 'installed-consumer',
  name,
  revision: '1',
  digest: 'a'.repeat(64),
})
const request = {
  profile: adoption('profile'),
  suppliers: [
    {
      adoption: adoption('supplier'),
      recipient: 'fixture',
      model: 'fixture',
      credential: { kind: 'factory' },
    },
  ],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}
const ending = { kind: 'completed', reason: 'stop' }
const scripted = createScriptedTransport({
  receipt: {
    supplier: request.suppliers[0].adoption,
    representation: request.representation,
    payloadDigest: 'installed-payload',
  },
  facts: [],
  ending: { kind: 'terminated', termination: ending },
  rejection: null,
})
const independent = []
for await (const fact of executeModel(request, scripted.transport, new AbortController().signal))
  independent.push(fact)
assert.deepEqual(independent, [{ kind: 'ended', termination: ending }])
assert.deepEqual(scripted.counts(), {
  prepare: 1,
  materialize: 1,
  start: 1,
  closePrepared: 1,
  closeMaterialized: 1,
})
console.log('scenario ok: standalone executeModel sent once and closed both resources')

function decoded(outcome) {
  assert.ok('ok' in outcome, JSON.stringify(outcome))
  return outcome.ok
}
const evidence = {
  owner: 'installed',
  record: decodedCall.ok,
  revision: '1',
  digest: 'a'.repeat(64),
}
const principal = { prove: () => true }
const runtimeDependencies = testing.createTestModelDependencies({
  owners: [{ consumerOwner: 'installed', work: { kind: 'exempt' }, evidence: request.profile }],
  evidence: [
    {
      adoption: request.profile,
      continuity: input => ({ ok: input.source }),
      materialization: input => ({
        ok: { ...evidence, record: `${input.call}/${input.dispatch}` },
      }),
      lateFact: () => ({
        failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
      }),
      retry: () => ({
        failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
      }),
      handoff: () => ({
        failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
      }),
      receive: () => ({
        failure: { kind: 'unavailable', dependency: 'fixture', diagnostic: 'unused' },
      }),
    },
  ],
  authority: {
    authorize: input =>
      input.access.principal === principal && input.access.tenant === owner
        ? { ok: { owner: 'identity', subject: 'installed', revision: '1' } }
        : { failure: { kind: 'denied', action: input.action } },
    execution: () => ({ ok: { owner: 'host', subject: 'installed', revision: '1' } }),
  },
  limits: {
    scanPageCalls: 2,
    resultPageParts: 1,
    resultPageTargetBytes: 1024,
    readIdleMs: 1000,
    capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
  },
  start: '2026-10-19T00:00:00Z',
  maxWaiters: 2,
  maxQueued: 10,
  sends: [],
  sending: {
    maxRetainedAttempts: 4,
    credentials: {
      present: () => ({ kind: 'unavailable' }),
      resolve: (ref, face) => {
        assert.equal(ref.id, 'official-installed-query')
        assert.equal(ref.tenant, owner)
        assert.deepEqual(face, { authorized: true, official: true })
        return { kind: 'value', scope: 'factory', value: 'synthetic-send' }
      },
    },
    sources: [
      {
        profile: request.profile,
        supplier: request.suppliers[0].adoption,
        recipient: request.suppliers[0].recipient,
        model: request.suppliers[0].model,
        credential: {
          kind: 'factory',
          official: true,
          queryId: credentialId('official-installed-query'),
        },
        current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
      },
    ],
  },
})
const provider = createModelRuntime(runtimeDependencies.dependencies, {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  readIdleMs: 1000,
  resultPageTargetBytes: 128,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
})
const admission = {
  tenant: owner,
  principal,
  call: decodedCall.ok,
  operation: decoded(decodeModelOperationId('mop_installed-admit')),
  request,
  consumer: { owner: 'installed', work: 'work', position: 'position', purpose: 'test' },
  capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
}
decoded(await provider.runtime.calls.admit(admission))
const drive = {
  ...admission,
  operation: decoded(decodeModelOperationId('mop_installed-claim')),
  instance: decoded(decodeModelInstanceId('minst_installed')),
  continuity: evidence,
}
decoded(await provider.driver.drive(drive, new AbortController().signal))
decoded(await provider.driver.drive(drive, new AbortController().signal))
const dispatches = decoded(await provider.runtime.calls.dispatches(admission))
assert.equal(dispatches.length, 1)
assert.equal(dispatches[0].send, 'prepared')
assert.equal(dispatches[0].materialization, null)
assert.equal(
  decoded(await provider.runtime.calls.inspect({ ...admission, admission: admission.operation }))
    .kind,
  'found',
)
assert.equal(
  (
    await provider.runtime.calls.inspect({
      ...admission,
      tenant: stranger,
      admission: admission.operation,
    })
  ).failure.kind,
  'denied',
)
console.log(
  'scenario ok: installed runtime admitted, recalled and prepared exactly one unsent dispatch',
)

const managedBlock = judgeContentBlock({
  kind: 'text',
  id: 'installed-send-text',
  visibility: { toHuman: true, toModel: true },
  text: 'installed sender output',
})
assert.ok('ok' in managedBlock)
const managedSourceFacts = [
  { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '0', delta: 'installed sender output' },
  { kind: 'block-seal', index: '0', block: managedBlock.ok },
]
const managedTransport = createScriptedTransport({
  receipt: {
    supplier: request.suppliers[0].adoption,
    representation: request.representation,
    payloadDigest: 'b'.repeat(64),
  },
  facts: managedSourceFacts,
  ending: { kind: 'terminated', termination: ending },
  rejection: null,
})
const sender = createModelSendBoundary({
  commands: runtimeDependencies.dependencies.commands,
  coordinator: runtimeDependencies.controls.send.coordinator,
  credentials: {
    present: () => ({ kind: 'unavailable' }),
    resolve: (ref, face) => {
      assert.equal(ref.id, 'official-installed-query')
      assert.equal(ref.tenant, owner)
      assert.deepEqual(face, { authorized: true, official: true })
      return { kind: 'value', scope: 'factory', value: 'synthetic-send' }
    },
  },
  maxRetainedAttempts: 4,
  resources: {
    async acquire() {
      return {
        ok: {
          transport: managedTransport.transport,
          startWithCredential(materialized, secret, signal) {
            assert.equal(secret, 'synthetic-send')
            return materialized.start(signal)
          },
          async release() {},
        },
      }
    },
  },
})
const recovery = decoded(await runtimeDependencies.dependencies.commands.loadRecovery(admission))
const demand = {
  ...admission,
  execution: recovery.execution,
  dispatch: dispatches[0].dispatch,
  supplier: dispatches[0].supplier,
  initiator: recovery.initiator,
}
const result = await sender.send(demand, new AbortController().signal)
assert.equal(result.kind, 'started')
assert.equal(typeof result.window, 'string')
assert.notEqual(result.window, '')
const managedFacts = []
for await (const fact of result.facts) managedFacts.push(fact)
assert.deepEqual(managedFacts, [...managedSourceFacts, { kind: 'ended', termination: ending }])
const preserved = decoded(
  await runtimeDependencies.dependencies.commands.preserve({
    ...demand.execution,
    operation: decoded(decodeModelOperationId('mop_installed-preserve')),
    expected: decoded(await runtimeDependencies.dependencies.commands.loadRecovery(admission)).state
      .revision,
    dispatch: demand.dispatch,
    window: result.window,
    facts: managedFacts,
  }),
)
assert.equal(preserved.call, demand.call)
assert.deepEqual(preserved.blocks, [{ kind: 'sealed', index: '0', block: managedBlock.ok }])
assert.equal(managedTransport.counts().start, 1)
assert.equal(managedTransport.counts().closePrepared, 1)
assert.equal(managedTransport.counts().closeMaterialized, 1)
assert.equal((await sender.send(demand, new AbortController().signal)).kind, 'unknown')
assert.equal(managedTransport.counts().start, 1)
assert.equal(
  decoded(await runtimeDependencies.dependencies.commands.dispatches(admission))[0].send,
  'started',
)
console.log(
  'scenario ok: installed sender returned its window, preserved its facts and started once',
)
