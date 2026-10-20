import { encodeModelInvocationRef, judgeFixedModelRequest } from '@omne-harness/model-contract'
import { createModelRuntime } from '@omne-harness/model'
import { configuration, createExampleAssembly, operation } from '../tests/example-support.ts'

const example = createExampleAssembly({
  facts: [],
  termination: {
    kind: 'failed',
    fault: {
      cause: 'input-over-limit',
      upstreamStatus: '413',
      diagnostic: 'upstream-size-rejected',
      // The supplier reported a limit but no actual size. Keep that unknown as null.
      reported: { metric: 'context-tokens', limit: '2048', actual: null },
    },
  },
})
const provider = createModelRuntime(example.dependencies, configuration)
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
  // The pure judge checks closed structure and finite parser budgets, not supplier tokens.
  // Success fixes a private frozen copy. A supplier can still reject its context size.
  const checked = judgeFixedModelRequest(example.request)
  if ('failure' in checked)
    throw new Error(`Input rejected: ${checked.failure.field} ${checked.failure.reason}`)
  const admitted = await provider.runtime.calls.admit({
    ...example.access,
    call: example.call,
    operation: admission,
    request: checked.ok,
    consumer: example.consumer,
    capacity: example.capacity,
  })
  if ('failure' in admitted)
    throw new Error(`Admission failed: ${JSON.stringify(admitted.failure)}`)
  example.upstream.resume()
  const driven = await provider.driver.drive(example.driveInput, new AbortController().signal)
  // Successful local execution can produce a failed business termination.
  if ('failure' in driven) throw new Error(`Drive failed: ${JSON.stringify(driven.failure)}`)
  const lookup = await provider.runtime.calls.inspect({
    ...example.access,
    reference,
  })
  if ('failure' in lookup) throw new Error(`Inspection failed: ${JSON.stringify(lookup.failure)}`)
  if (lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled')
    throw new Error('Expected Settlement')
  const { termination } = lookup.ok.state.settlement
  if (termination.kind !== 'failed' || termination.fault.cause !== 'input-over-limit')
    throw new Error('Expected input-over-limit')
  console.log('termination:', termination.kind, termination.fault.cause)
  console.log('reported:', JSON.stringify(termination.fault.reported))
  console.log('transport starts:', example.upstream.counts().start)
  // Do not retry the same input or switch suppliers. A consumer can reduce the input and
  // explicitly admit a new call, with new call and admission identities, after its own decision.
} finally {
  await example.withdrawPublication()
}
