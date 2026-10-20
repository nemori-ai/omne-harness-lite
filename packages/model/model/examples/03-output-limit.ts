import { createModelRuntime } from '@omne-harness/model'
import { configuration, createExampleAssembly, operation } from './support.ts'

// trim is an actual upstream reminder, not a locally estimated missing-token count.
// An unsealed prefix remains partial output. It does not become an executable tool suggestion.
const trim = { kind: 'trim', index: '0', removed: '7', reason: 'output-limit' } as const
const example = createExampleAssembly({
  facts: [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'Kept prefix' },
    trim,
  ],
  termination: { kind: 'completed', reason: 'limit' },
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
  if (termination.kind !== 'completed' || termination.reason !== 'limit')
    throw new Error('Expected completed/limit')
  console.log('termination:', termination.kind, termination.reason)
  console.log('upstream trim:', trim.removed, trim.reason)
  // Snapshot has visible blocks and state, but no full trims list. Runtime result reading and
  // ACK are not implemented yet. This lesson does not invent a result-consumption shortcut.
} finally {
  await example.withdrawPublication()
}
