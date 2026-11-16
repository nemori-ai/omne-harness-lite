import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  encodeModelOperationRef,
  resolveModelOperationRef,
} from '@omne-harness/model-contract/provider'
import { createModelRuntime } from '@omne-harness/model'
import { judgePart } from '@omne-harness/message'
import type { AckInput, AckReceipt, ModelFailure } from '@omne-harness/model-contract'
import { configuration, createExampleAssembly, operation } from '../tests/example-support.ts'

const block = judgePart({
  kind: 'text',
  id: 'answer',
  text: 'Hello',
  visibility: { toHuman: true, toModel: true },
})
if ('rejected' in block || block.ok.kind !== 'text') throw new Error('Invalid lesson block')
const example = createExampleAssembly({
  paging: { parts: 1, targetBytes: 128 },
  facts: [
    { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
    { kind: 'block-delta', index: '0', delta: 'Hello' },
    { kind: 'block-seal', index: '0', block: block.ok },
    { kind: 'block-open', index: '1', content: 'tool-arguments', mode: 'append' },
    { kind: 'block-delta', index: '1', delta: '{"unfinished":' },
    { kind: 'trim', index: '1', removed: '2', reason: 'upstream-cut' },
  ],
  termination: {
    kind: 'failed',
    fault: { cause: 'upstream-protocol', diagnostic: 'partial-lesson', upstreamStatus: null },
  },
})
const provider = createModelRuntime(example.dependencies, configuration)
const access = { ...example.access, call: example.call }
const admission = operation('admit')
const encoded = encodeModelInvocationRef({
  tenant: example.access.tenant,
  call: example.call,
  admission,
})
if ('failure' in encoded) throw new Error(`Reference failed: ${encoded.failure.reason}`)
const reference = encoded.ok
const admitted = await provider.runtime.calls.admit({
  ...access,
  operation: admission,
  request: example.request,
  consumer: example.consumer,
})
if ('failure' in admitted) throw new Error(`Admission failed: ${JSON.stringify(admitted.failure)}`)
const driving = provider.driver.drive(example.driveInput, new AbortController().signal)
example.upstream.resume()
let pendingAck: AckInput<typeof example.access.principal> | undefined
try {
  const driven = await driving
  if ('failure' in driven) throw new Error(`Drive failed: ${JSON.stringify(driven.failure)}`)
  const lookup = await provider.runtime.calls.inspect({ ...example.access, reference })
  if ('failure' in lookup) throw new Error(`Inspect failed: ${JSON.stringify(lookup.failure)}`)
  if (lookup.ok.kind !== 'found' || lookup.ok.state.phase !== 'settled')
    throw new Error('No settled result')
  const result = lookup.ok.state.settlement.version
  const readOperation = operation('read')
  const first = await provider.runtime.consumption.beginRead({
    ...example.access,
    reference,
    operation: readOperation,
    result,
  })
  if ('failure' in first) throw new Error(`Read failed: ${JSON.stringify(first.failure)}`)
  if (first.ok.kind === 'acknowledged') {
    console.log('already acknowledged:', first.ok.custody.operation, first.ok.custody.cleanup)
  } else {
    const reading = { ...access, read: first.ok.read }
    let state = first.ok.value
    let processed = 0
    let closeFailure: ModelFailure | undefined
    try {
      while (state.kind === 'reading') {
        for (const part of state.page.parts) {
          console.log(
            'part:',
            part.kind,
            part.kind === 'sealed' ? part.block.kind : part.content,
            part.trims,
          )
          processed++
        }
        console.log('termination:', state.page.settlement.termination.kind)
        if (state.page.next === null) break
        const next = await provider.runtime.consumption.readNext({
          ...reading,
          after: state.page.next,
        })
        if ('failure' in next) throw new Error(`Next failed: ${JSON.stringify(next.failure)}`)
        state = next.ok
      }
      if (state.kind === 'ended') throw new Error(`Read ended: ${state.reason}`)
    } finally {
      const closed = await provider.runtime.consumption.closeRead(reading)
      if ('failure' in closed) {
        closeFailure = closed.failure
        console.error('Close failed:', closed.failure)
      } else console.log('read closed:', closed.ok.kind)
    }
    if (closeFailure) throw new Error(`Close failed: ${JSON.stringify(closeFailure)}`)
    const completion = example.completedRecords.finish({
      result,
      consumer: example.consumer,
      outcome: `processed ${processed} parts`,
    })
    pendingAck = {
      ...access,
      operation: operation('ack'),
      result,
      evidence: { kind: 'processed', completion },
    }
    const ackReference = encodeModelOperationRef({
      tenant: access.tenant,
      call: access.call,
      admission,
      operation: pendingAck.operation,
    })
    if ('failure' in ackReference)
      throw new Error(`ACK reference failed: ${ackReference.failure.reason}`)
    const savedAck = { reference: ackReference.ok, result, evidence: pendingAck.evidence }
    const restored = resolveModelOperationRef(savedAck.reference, example.access.tenant)
    if ('failure' in restored) throw new Error(`ACK restore failed: ${restored.failure.kind}`)
    pendingAck = {
      ...example.access,
      call: restored.ok.call,
      operation: restored.ok.operation,
      result: savedAck.result,
      evidence: savedAck.evidence,
    }
    let acknowledgement = await provider.runtime.consumption.acknowledge(pendingAck)
    if ('failure' in acknowledgement && acknowledgement.failure.kind === 'commit-unknown') {
      acknowledgement = await provider.runtime.consumption.acknowledge(pendingAck)
    }
    if ('failure' in acknowledgement)
      throw new Error(`ACK unresolved; keep pendingAck: ${JSON.stringify(acknowledgement.failure)}`)
    const receipt: AckReceipt = acknowledgement.ok
    console.log(
      'ACK:',
      receipt.call,
      receipt.result,
      receipt.custody.operation,
      receipt.custody.receipt,
      receipt.custody.cleanup,
    )
    const repeated = await provider.runtime.consumption.acknowledge(pendingAck)
    if ('failure' in repeated) throw new Error(`Repeat failed: ${JSON.stringify(repeated.failure)}`)
    console.log('same ACK:', repeated.ok.custody.operation === receipt.custody.operation)
    pendingAck = undefined
  }
} finally {
  example.upstream.resume()
  await driving
  await example.withdrawPublication()
}
