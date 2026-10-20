// Runs inside an install-closure consumer directory, so it sees only the installed packages: a
// caller outside the repository delivers a call through injected credential ports and judges a
// custodian snapshot. Any failed assertion exits non-zero and fails the closure report.
import assert from 'node:assert/strict'
import { deliver, executeModel, judgePresence, judgeResolution } from '@omne-harness/model'
import { MODEL_SEND, decodeCredentialId } from '@omne-harness/model-contract'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'

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
const { createModelRuntime } = await import('@omne-harness/model')
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
  readIdleMs: 1000,
  resultPageTargetBytes: 128,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
})
assert.deepEqual(await shell.quiesce(), {
  failure: {
    kind: 'unavailable',
    dependency: 'model-runtime',
    diagnostic: 'managed-runtime-not-implemented',
  },
})
assert.equal('driver' in shell.runtime, false)

const adoption = name => ({
  owner: 'installed-consumer',
  name,
  revision: '1',
  digest: `digest-${name}`,
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
