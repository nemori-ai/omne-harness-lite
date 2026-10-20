import { createModelRuntime } from '@omne-harness/model'
import { configuration, createExampleAssembly, operation } from './support.ts'

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
try {
  const admitted = await provider.runtime.calls.admit({
    ...example.access,
    call: example.call,
    operation: admission,
    request: example.request,
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
    call: example.call,
    admission,
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
