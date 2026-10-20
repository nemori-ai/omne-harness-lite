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
try {
  const reply = await runtime.calls.admit({
    ...example.access,
    call: example.call,
    operation: admission,
    request: example.request,
    consumer: example.consumer,
    capacity: example.capacity,
  })
  // Reply<T> is { ok: T } or { failure: ModelFailure }. Never treat a failure as admission.
  if ('failure' in reply) throw new Error(`Admission failed: ${JSON.stringify(reply.failure)}`)
  console.log('admission:', reply.ok.recovered ? 'recovered' : 'accepted')
  const lookup = await runtime.calls.inspect({ ...example.access, call: example.call, admission })
  if ('failure' in lookup) throw new Error(`Inspection failed: ${JSON.stringify(lookup.failure)}`)
  // Lookup is found with CallState, or an authoritative not-accepted with the admission ID.
  if (lookup.ok.kind === 'not-accepted') throw new Error('The original admission was not accepted')
  console.log('phase:', lookup.ok.state.phase)
  // The host queued this call. No driver ran, so acceptance proves neither send nor completion.
  console.log('transport starts:', example.upstream.counts().start)
} finally {
  await example.withdrawPublication()
}
