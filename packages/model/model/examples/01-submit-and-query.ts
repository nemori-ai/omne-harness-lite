import { encodeModelInvocationRef, judgeAdmit } from '@omne-harness/model-contract'
import { createModelRuntime } from '@omne-harness/model'
import { configuration, createExampleAssembly, operation } from '../tests/example-support.ts'

const example = createExampleAssembly({
  facts: [],
  termination: { kind: 'completed', reason: 'limit' },
})
const { runtime } = createModelRuntime(example.dependencies, configuration)
// principal is the current actor. tenant is an explicitly minted isolation scope.
// call names the logical invocation. operation identifies this one admission write.
const admission = operation('admit')
// Fix this locator before admission. A lost reply cannot take away the recovery identity.
const encoded = encodeModelInvocationRef({
  tenant: example.access.tenant,
  call: example.call,
  admission,
})
if ('failure' in encoded) throw new Error(`Reference failed: ${encoded.failure.reason}`)
const reference = encoded.ok
try {
  // This pure check returns a fixed payload or { failure: { field, reason } }.
  // It preserves the current opaque principal and minted tenant. It grants no authority.
  const checked = judgeAdmit({
    ...example.access,
    call: example.call,
    operation: admission,
    request: example.request,
    consumer: example.consumer,
    capacity: example.capacity,
  })
  if ('failure' in checked)
    throw new Error(`Input rejected: ${checked.failure.field} ${checked.failure.reason}`)
  const reply = await runtime.calls.admit(checked.ok)
  // Reply<T> is { ok: T } or { failure: ModelFailure }. Never treat a failure as admission.
  if ('failure' in reply) throw new Error(`Admission failed: ${JSON.stringify(reply.failure)}`)
  console.log('admission:', reply.ok.recovered ? 'recovered' : 'accepted')
  // Admission preserves call/revision/recovered and returns the same saveable reference.
  // Save reference with the original fixed input. commit-unknown keeps that original identity.
  if (reply.ok.reference !== reference) throw new Error('Admission changed the reference')
  console.log('admission call/revision:', reply.ok.call, reply.ok.revision)
  const lookup = await runtime.calls.inspect({ ...example.access, reference })
  if ('failure' in lookup) throw new Error(`Inspection failed: ${JSON.stringify(lookup.failure)}`)
  // Lookup is found with CallState, or an authoritative not-accepted with the admission ID.
  if (lookup.ok.kind === 'not-accepted') throw new Error('The original admission was not accepted')
  console.log('phase:', lookup.ok.state.phase)
  // The host queued this call. No driver ran, so acceptance proves neither send nor completion.
  console.log('transport starts:', example.upstream.counts().start)
} finally {
  await example.withdrawPublication()
}
