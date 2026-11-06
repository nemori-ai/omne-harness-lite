import { expect, it } from 'vitest'
import { GetWaitSchema, ReadInboxSchema, decodeRecoveryCommand } from '../src/index.ts'

const operation = { tenantRef: 'tenant-a', actorRef: 'receiver-a', operationId: 'bind-a' }
const waitRef = {
  owner: 'app',
  waitId: 'wait-a',
  incarnation: 'logical-1',
  destination: 'app-inbox',
}
const bind = {
  protocol: 'hitl/1',
  operation,
  waitRef,
  expectedGeneration: '0',
  instanceId: 'process-b',
  implementationRef: 'app-v1',
}
const decisionRef = {
  card: { request: { tenantRef: 'tenant-a', requestId: 'request-a' }, cardId: 'card-a' },
  decisionId: 'decision-a',
  submission: { ...operation, operationId: 'reply-a' },
}

it('keeps logical waiting identity stable while a receiver instance changes', () => {
  const first = decodeRecoveryCommand('bindReceiver', JSON.stringify(bind))
  const restart = decodeRecoveryCommand(
    'bindReceiver',
    JSON.stringify({
      ...bind,
      operation: { ...operation, operationId: 'bind-b' },
      instanceId: 'process-c',
      expectedGeneration: '9007199254740993',
    }),
  )
  expect(first).toMatchObject({ kind: 'decoded', command: { waitRef } })
  expect(restart).toMatchObject({
    kind: 'decoded',
    command: {
      waitRef,
      expectedGeneration: '9007199254740993',
      instanceId: 'process-c',
    },
  })
})

it.each(['01', '-1', 0, 9007199254740992])(
  'rejects a noncanonical generation: %j',
  expectedGeneration => {
    expect(
      decodeRecoveryCommand('bindReceiver', JSON.stringify({ ...bind, expectedGeneration })),
    ).toEqual({ kind: 'invalid-input', reason: 'shape' })
  },
)

it('binds consumption to the same tenant and original operation identity', () => {
  const consume = {
    protocol: 'hitl/1',
    operation: { ...operation, operationId: 'consume-a' },
    waitRef,
    receiverGeneration: '2',
    decisionRef,
    consumeOperationId: 'consume-a',
  }
  expect(decodeRecoveryCommand('consumeDecision', JSON.stringify(consume))).toMatchObject({
    kind: 'decoded',
  })
  for (const invalid of [
    { ...consume, consumeOperationId: 'another-operation' },
    { ...consume, operation: { ...consume.operation, tenantRef: 'tenant-b' } },
    { ...consume, receiverGeneration: '02' },
    { ...consume, resume: true },
  ])
    expect(decodeRecoveryCommand('consumeDecision', JSON.stringify(invalid))).toEqual({
      kind: 'invalid-input',
      reason: 'shape',
    })
})

it('bounds inbox reads and does not accept a client receipt as a consumption command', () => {
  expect(GetWaitSchema.safeParse({ protocol: 'hitl/1', waitRef }).success).toBe(true)
  const query = { protocol: 'hitl/1', waitRef, receiverGeneration: '2', limit: 100 }
  expect(ReadInboxSchema.safeParse(query).success).toBe(true)
  expect(ReadInboxSchema.safeParse({ ...query, limit: 101 }).success).toBe(false)
  expect(ReadInboxSchema.safeParse({ ...query, receiverGeneration: undefined }).success).toBe(false)
  expect(
    decodeRecoveryCommand(
      'consumeDecision',
      JSON.stringify({
        protocol: 'hitl/1',
        operation,
        consumerReceipt: { outcome: 'accepted' },
      }),
    ),
  ).toEqual({ kind: 'invalid-input', reason: 'shape' })
})

it('applies the same bounded JSON boundary to recovery writes', () => {
  expect(decodeRecoveryCommand('bindReceiver', '{')).toEqual({
    kind: 'invalid-input',
    reason: 'json',
  })
  expect(decodeRecoveryCommand('bindReceiver', '汉'.repeat(90_000))).toEqual({
    kind: 'limited',
    resource: 'command-bytes',
    limit: 262_144,
  })
})
