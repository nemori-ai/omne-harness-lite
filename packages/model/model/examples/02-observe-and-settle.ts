import { createModelRuntime } from '@omne-harness/model'
import { judgePart } from '@omne-harness/message'
import { configuration, createExampleAssembly, operation } from '../tests/example-support.ts'

const text = judgePart({
  kind: 'text',
  id: 'answer',
  text: 'Hello',
  visibility: { toHuman: true, toModel: true },
})
if ('rejected' in text || text.ok.kind !== 'text') throw new Error('Invalid teaching block')
const example = createExampleAssembly({
  facts: [
    { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    { kind: 'block-delta', index: '0', delta: 'Hello' },
    { kind: 'block-seal', index: '0', block: text.ok },
  ],
  termination: { kind: 'completed', reason: 'stop' },
})
const provider = createModelRuntime(example.dependencies, configuration)
const admission = operation('admit')
const admitted = await provider.runtime.calls.admit({
  ...example.access,
  call: example.call,
  operation: admission,
  request: example.request,
  consumer: example.consumer,
  capacity: example.capacity,
})
if ('failure' in admitted) throw new Error(`Admission failed: ${JSON.stringify(admitted.failure)}`)
// driver belongs to the trusted host. A normal caller receives only provider.runtime.
const driving = provider.driver.drive(example.driveInput, new AbortController().signal)
let observer: AsyncIterator<import('@omne-harness/model-contract').Observation> | undefined
try {
  await Promise.race([
    example.publicationReady,
    driving.then(reply => {
      if ('failure' in reply)
        throw new Error(`Drive failed before publication: ${JSON.stringify(reply.failure)}`)
      throw new Error('Drive ended without a publication')
    }),
  ])
  const connected = await provider.runtime.instances.connect({
    ...example.access,
    call: example.call,
  })
  if ('failure' in connected)
    throw new Error(`Connect failed: ${JSON.stringify(connected.failure)}`)
  if (connected.ok.kind !== 'live') throw new Error('The host has no live route')
  observer = connected.ok.handle
    .observe({ ...example.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  const first = await observer.next()
  // Observation is snapshot, changed, or ended. A live route alone proves no business result.
  if (first.done || first.value.kind !== 'snapshot')
    throw new Error('Expected the initial snapshot')
  console.log('observation:', first.value.kind)
  example.upstream.resume()
  const driven = await driving
  // drive reports local execution and release. Inspect remains the authority for Settlement.
  if ('failure' in driven) throw new Error(`Drive failed: ${JSON.stringify(driven.failure)}`)
  const changed = await observer.next()
  if (changed.done || changed.value.kind !== 'changed')
    throw new Error('Expected confirmed changes')
  console.log('observation:', changed.value.kind)
  const lookup = await provider.runtime.calls.inspect({
    ...example.access,
    call: example.call,
    admission,
  })
  if ('failure' in lookup) throw new Error(`Inspection failed: ${JSON.stringify(lookup.failure)}`)
  if (lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled')
    throw new Error('Expected Settlement')
  const { termination, version, source } = lookup.ok.state.settlement
  console.log(
    'termination:',
    termination.kind,
    termination.kind === 'completed' ? termination.reason : '',
  )
  // version identifies the retained result. source.owner/record identify the evidence owner
  // and record. source.revision/digest bind the original evidence revision and content.
  console.log('settlement:', JSON.stringify({ version, termination, source }))
} finally {
  // Returning the observer stops only observation. The original driver owns stream release.
  await observer?.return?.()
  example.upstream.resume()
  await driving
  await example.withdrawPublication()
}
console.log(
  'transport starts/closes:',
  example.upstream.counts().start,
  example.upstream.counts().closeMaterialized,
)
