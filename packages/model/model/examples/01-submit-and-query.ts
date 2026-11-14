import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import { judgeAdmit } from '@omne-harness/model-contract/provider'
import { createModelRuntime } from '@omne-harness/model'
import { configuration, createExampleAssembly, operation } from '../tests/example-support.ts'

const example = createExampleAssembly({
  facts: [],
  termination: { kind: 'completed', reason: 'limit' },
})
const { runtime } = createModelRuntime(example.dependencies, configuration)
const admission = operation('admit')
const encoded = encodeModelInvocationRef({
  tenant: example.access.tenant,
  call: example.call,
  admission,
})
if ('failure' in encoded) throw new Error(`Reference failed: ${encoded.failure.reason}`)
const reference = encoded.ok
try {
  const checked = judgeAdmit({
    ...example.access,
    call: example.call,
    operation: admission,
    request: example.request,
    consumer: example.consumer,
  })
  if ('failure' in checked)
    throw new Error(`Input rejected: ${checked.failure.field} ${checked.failure.reason}`)
  const reply = await runtime.calls.admit(checked.ok)
  if ('failure' in reply) throw new Error(`Admission failed: ${JSON.stringify(reply.failure)}`)
  console.log('admission:', reply.ok.recovered ? 'recovered' : 'accepted')
  if (reply.ok.reference !== reference) throw new Error('Admission changed the reference')
  console.log('admission call/revision:', reply.ok.call, reply.ok.revision)
  const lookup = await runtime.calls.inspect({ ...example.access, reference })
  if ('failure' in lookup) throw new Error(`Inspection failed: ${JSON.stringify(lookup.failure)}`)
  if (lookup.ok.kind === 'not-accepted') throw new Error('The original admission was not accepted')
  console.log('phase:', lookup.ok.state.phase)
  console.log('transport starts:', example.upstream.counts().start)
} finally {
  await example.withdrawPublication()
}
