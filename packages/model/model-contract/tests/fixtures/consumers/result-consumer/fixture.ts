import type { ResultPart } from '@omne-harness/model-contract'
// The consumer that owns a result: it reads the exact settled version in pages, hands it off with
// evidence that it holds, and repeats an acknowledgement instead of claiming the result again. It
// imports only the public contract and the scripted provider that stands for whatever serves it.
import {
  access,
  callRef,
  evidence,
  expect,
  failureOf,
  must,
  newWorld,
  operation,
  textBlock,
  textsOf,
  version,
  type World,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

/** Settles the call `name` with five blocks cut into pages of two. */
function settle(world: World, name: string): void {
  world.controller.settle({
    ...callRef(name),
    version: version(name),
    termination: { kind: 'completed', reason: 'stop' },
    parts: ['one', 'two', 'three', 'four', 'five']
      .map(text => textBlock(`b-${text}`, text))
      .map(block => ({ kind: 'sealed' as const, block, trims: [] })),
    source: evidence(`settlement-${name}`),
    pageSize: 2,
    pageTargetBytes: 1024,
  })
}

const processed = (label: string) => ({ kind: 'processed', completion: evidence(label) }) as const

const ackOf = (name: string, label = 'processed') => ({
  ...access(name),
  operation: operation(`ack-${name}`),
  result: version(name),
  evidence: processed(label),
})

async function readsTheExactVersionInPages(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  const state = await world.state('a')
  expect(state.phase === 'settled', 'the call did not settle')
  expect(state.settlement.version === version('a'), 'the settlement names another version')
  const started = must(
    await world.consumption.beginRead({
      ...access('a'),
      operation: operation('read-a'),
      result: state.settlement.version,
    }),
  )
  expect(started.kind === 'started' && started.value.kind === 'reading', 'the read did not start')
  const first = started.value.page
  expect(textsOf(first.parts).join() === 'one,two', 'the first page differs')
  expect(first.next === '2', `the first page continues at ${String(first.next)}`)
  expect(first.settlement.version === version('a'), 'the page belongs to another version')
  const second = must(
    await world.consumption.readNext({ ...access('a'), read: started.read, after: '2' }),
  )
  expect(second.kind === 'reading' && second.page.next === '4', 'the second page is wrong')
  const third = must(
    await world.consumption.readNext({ ...access('a'), read: started.read, after: '4' }),
  )
  expect(third.kind === 'reading', 'the third page did not come')
  expect(textsOf(third.page.parts).join() === 'five' && third.page.next === null, 'last page')
  const closed = must(await world.consumption.closeRead({ ...access('a'), read: started.read }))
  expect(closed.kind === 'ended' && closed.reason === 'complete', 'the read did not complete')
}

async function acknowledgesWithProcessedEvidence(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  const receipt = must(await world.consumption.acknowledge(ackOf('a')))
  expect(receipt.custody.kind === 'acknowledged', 'the custody did not change hands')
  expect(receipt.custody.operation === operation('ack-a'), 'the receipt names another operation')
  expect(receipt.custody.receipt.record === 'processed', 'the receipt is not the evidence given')
  expect(receipt.custody.cleanup === 'pending', `cleanup is ${receipt.custody.cleanup}`)
  const state = await world.state('a')
  expect(state.custody.kind === 'acknowledged', 'the call does not show the receipt')
}

async function acknowledgesWithRetainedEvidence(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  const receipt = must(
    await world.consumption.acknowledge({
      ...ackOf('a'),
      evidence: { kind: 'retained', custody: evidence('kept') },
    }),
  )
  expect(receipt.custody.kind === 'acknowledged', 'the custody did not change hands')
  expect(receipt.custody.receipt.record === 'kept', 'the receipt is not the retained custody')
}

async function repeatedAcknowledgeReturnsTheOriginalReceipt(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  const first = must(await world.consumption.acknowledge(ackOf('a')))
  const again = must(await world.consumption.acknowledge(ackOf('a')))
  expect(JSON.stringify(again) === JSON.stringify(first), 'the repeat returned another receipt')
  const reread = must(
    await world.consumption.beginRead({
      ...access('a'),
      operation: operation('read-after'),
      result: version('a'),
    }),
  )
  expect(reread.kind === 'acknowledged', `an acknowledged result was read again as ${reread.kind}`)
}

async function openReadSurvivesAcknowledgeAndCleanupIsShown(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  const started = must(
    await world.consumption.beginRead({
      ...access('a'),
      operation: operation('read-a'),
      result: version('a'),
    }),
  )
  expect(started.kind === 'started', 'the read did not start')
  must(await world.consumption.acknowledge(ackOf('a')))
  const next = must(
    await world.consumption.readNext({ ...access('a'), read: started.read, after: '2' }),
  )
  expect(next.kind === 'reading', 'the acknowledgement cut off the open read')
  world.controller.setCleanup({ ...callRef('a'), cleanup: 'running', diagnostic: null })
  world.controller.setCleanup({ ...callRef('a'), cleanup: 'blocked', diagnostic: 'disk is full' })
  const custody = (await world.state('a')).custody
  expect(custody.kind === 'acknowledged', 'a blocked cleanup undid the acknowledgement')
  expect(custody.cleanup === 'blocked', `cleanup is ${custody.cleanup}`)
  expect(custody.diagnostic === 'disk is full', 'the reason of the block was lost')
}

// SPEC.md "逐操作行为" acknowledge row and docs/object-model.md (ModelConsumption): an early
// acknowledgement is refused and the result keeps its state. No kind is pinned for it, so only the
// refusal and the unchanged custody are checked.
async function acknowledgeBeforeSettlementIsRefused(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  failureOf(await world.consumption.acknowledge(ackOf('a')))
  expect((await world.state('a')).custody.kind === 'producer', 'the early acknowledgement counted')
  settle(world, 'a')
  const receipt = must(await world.consumption.acknowledge(ackOf('a')))
  expect(receipt.custody.kind === 'acknowledged', 'the consumer cannot acknowledge once settled')
}

// Same clauses: evidence that the provider does not accept (a forged one) is refused and the result
// keeps its state. No kind is pinned, so only the refusal and the unchanged custody are checked.
async function foreignEvidenceIsRefused(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  world.controller.expectEvidence({ ...callRef('a'), evidence: evidence('processed') })
  failureOf(await world.consumption.acknowledge(ackOf('a', 'forged')))
  expect((await world.state('a')).custody.kind === 'producer', 'forged evidence moved the custody')
  const receipt = must(await world.consumption.acknowledge(ackOf('a')))
  expect(receipt.custody.receipt.record === 'processed', 'the real evidence was not taken')
}

// SPEC.md "逐操作行为" and "写操作" paragraphs: the operation and its arguments are fixed together, so
// other evidence under the same operation conflicts and never replaces the first.
async function otherEvidenceUnderTheSameOperationConflicts(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  must(await world.consumption.acknowledge(ackOf('a', 'first')))
  const refusal = failureOf(await world.consumption.acknowledge(ackOf('a', 'second')))
  expect(refusal.kind === 'conflict', `the second evidence was refused as ${refusal.kind}`)
  const custody = (await world.state('a')).custody
  expect(custody.kind === 'acknowledged', 'the conflict undid the acknowledgement')
  expect(custody.receipt.record === 'first', 'the second evidence replaced the first')
}

// SPEC.md acknowledge row ("提交未知认回原 ACK") and docs/object-model.md: an unknown reply is
// answered by repeating the same operation with the same evidence, and the full result is not read
// again.
async function unknownReplyIsRepeatedWithTheSameOperation(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settle(world, 'a')
  world.controller.commitUnknown({
    tenant: callRef('a').tenant,
    action: 'acknowledge',
    operation: operation('ack-a'),
    effect: 'applied',
    query: 'answers',
  })
  const unknown = failureOf(await world.consumption.acknowledge(ackOf('a')))
  expect(unknown.kind === 'commit-unknown', 'the acknowledgement did not end unknown')
  const receipt = must(await world.consumption.acknowledge(ackOf('a')))
  expect(receipt.custody.operation === operation('ack-a'), 'the repeat made another receipt')
  expect(receipt.custody.receipt.record === 'processed', 'the repeat gave other evidence')
  const reread = must(
    await world.consumption.beginRead({
      ...access('a'),
      operation: operation('read-after'),
      result: version('a'),
    }),
  )
  expect(reread.kind === 'acknowledged', 'the result was claimed again after the repeat')
}

async function readsPartialWithoutALiveRoute(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const parts: readonly ResultPart[] = [
    { kind: 'sealed', block: textBlock('first', 'one'), trims: [] },
    {
      kind: 'partial',
      content: 'tool-arguments',
      value: '{}',
      trims: [{ removed: '2', reason: 'actual' }],
    },
    { kind: 'partial', content: 'voice', value: 'unsealed', trims: [] },
  ]
  world.controller.settle({
    ...callRef('a'),
    version: version('a'),
    termination: { kind: 'completed', reason: 'limit' },
    parts,
    source: evidence('partial'),
    pageSize: 2,
    pageTargetBytes: 1,
  })
  world.controller.withdrawInstance(callRef('a'))
  expect(
    must(await world.instances.connect(access('a'))).kind === 'no-live-route',
    'the instance still has a route',
  )
  const input = { ...access('a'), operation: operation('read-partial'), result: version('a') }
  const read = must(await world.consumption.beginRead(input))
  expect(read.kind === 'started' && read.value.kind === 'reading', 'the partial read did not start')
  const received: ResultPart[] = [...read.value.page.parts]
  must(await world.consumption.acknowledge(ackOf('a')))
  let after = read.value.page.next
  while (after !== null) {
    const page = must(await world.consumption.readNext({ ...access('a'), read: read.read, after }))
    expect(page.kind === 'reading', 'an acknowledged original reader lost the partial value')
    received.push(...page.page.parts)
    after = page.page.next
  }
  expect(
    JSON.stringify(received) === JSON.stringify(parts),
    'the consumer lost partial values, ordering or trims',
  )
  expect(
    must(await world.consumption.beginRead({ ...input, operation: operation('new-partial-read') }))
      .kind === 'acknowledged',
    'a new result claim followed ACK',
  )
}

export const fixture = {
  role: 'result-consumer',
  paths: [
    {
      name: 'reads sealed and partial values with actual trims without a live route and across ACK',
      kind: 'normal',
      run: readsPartialWithoutALiveRoute,
    },
    {
      name: 'reads the exact settled version in pages until the read completes',
      kind: 'normal',
      run: readsTheExactVersionInPages,
    },
    {
      name: 'acknowledges with processed evidence and the call shows the receipt',
      kind: 'normal',
      run: acknowledgesWithProcessedEvidence,
    },
    {
      name: 'acknowledges with retained evidence and the receipt names the retained custody',
      kind: 'normal',
      run: acknowledgesWithRetainedEvidence,
    },
    {
      name: 'a repeated acknowledgement returns the original receipt and the result is not read again',
      kind: 'normal',
      run: repeatedAcknowledgeReturnsTheOriginalReceipt,
    },
    {
      name: 'an open read survives the acknowledgement and a blocked cleanup is shown',
      kind: 'normal',
      run: openReadSurvivesAcknowledgeAndCleanupIsShown,
    },
    {
      name: 'an acknowledgement before the call settled is refused',
      kind: 'failure',
      decision:
        'the consumer keeps the duty to process the result and acknowledges only after the call settled',
      run: acknowledgeBeforeSettlementIsRefused,
    },
    {
      name: 'evidence that the provider does not accept is refused and the custody stays',
      kind: 'failure',
      decision:
        'the consumer does not count a refused handoff and hands the result off again with the evidence of the work that processed it',
      run: foreignEvidenceIsRefused,
    },
    {
      name: 'other evidence under the same acknowledgement operation conflicts',
      kind: 'failure',
      decision:
        'the consumer treats the first evidence as final: other evidence under the same operation does not replace it',
      run: otherEvidenceUnderTheSameOperationConflicts,
    },
    {
      name: 'an acknowledgement whose reply is unknown is repeated under the same operation',
      kind: 'failure',
      decision:
        'the consumer repeats the same operation with the same evidence and does not claim the result again',
      run: unknownReplyIsRepeatedWithTheSameOperation,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
