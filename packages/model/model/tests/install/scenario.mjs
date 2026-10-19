// Runs inside an install-closure consumer directory, so it sees only the installed packages: a
// caller outside the repository delivers a call through injected credential ports and judges a
// custodian snapshot. Any failed assertion exits non-zero and fails the closure report.
import assert from 'node:assert/strict'
import { deliver, judgePresence, judgeResolution } from '@omne-harness/model'
import { MODEL_SEND, decodeCredentialId } from '@omne-harness/model-contract'
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
