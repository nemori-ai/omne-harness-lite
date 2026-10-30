import {
  decodeActionId,
  type AcceptedInput,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeInputId,
  decodeStepId,
  type Access,
  type AgentExecutionId,
  type AgentAccountHandoff,
  type AgentAccountOutcome,
  type PendingCall,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import { judgeMessage } from '@omne-harness/message'
import {
  decodeRevision,
  resolveModelInvocationRef,
  type ModelDelivery,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { ModelReceiverDependencies } from '../receiving-types.ts'
import { createMemoryAgentJournal, type MemoryAgentJournal } from './journal.ts'
import { testAdoption, testEvidence } from './fixtures.ts'

function value<T>(result: Outcome<T, unknown>): T {
  if ('failure' in result) throw new Error('invalid receiver fixture value')
  return result.ok
}
export type ModelReceiverFixture = Readonly<{
  durability: 'none'
  access: Access<string>
  execution: AgentExecutionId
  delivery: ModelDelivery
  dependencies: ModelReceiverDependencies<string>
  journal: MemoryAgentJournal<string>
  sent: AgentAccountHandoff[]
  outlet(next: AgentAccountOutcome): void
}>
/** Real memory Journal and original binding, with explicit Model/access/outlet doubles. No durability. */
export async function assembleModelReceiverFixture(
  tenant: Access<string>['tenant'],
  entry: ReceivedEntry,
): Promise<ModelReceiverFixture> {
  const access = { tenant, principal: 'receiver-test' }
  const execution = value(decodeAgentExecutionId('receiver-fixture'))
  const instance = value(decodeAgentInstanceId('receiver-fixture'))
  if (
    entry.delivery.producer !== 'model' ||
    entry.delivery.key.kind !== 'account' ||
    !('account' in entry.delivery)
  )
    throw new Error('model account fixture required')
  const delivery: ModelDelivery = {
    kind: 'account',
    consumer: entry.consumer,
    key: entry.delivery.key,
    account: entry.delivery.account,
  }
  const reference = value(resolveModelInvocationRef(delivery.key.reference, tenant))
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: value(decodeActionId('receiver-action')),
    consumption: entry.consumption,
    position: entry.consumer,
    fixed: testEvidence('fixed'),
    reference: delivery.key.reference,
  }
  const message = judgeMessage({
    id: `msg_${'a'.repeat(24)}`,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: 'blk_receiver-input',
        visibility: { toHuman: true, toModel: true },
        text: 'receiver fixture',
      },
    ],
  })
  if ('rejected' in message) throw new Error('invalid receiver fixture message')
  const journal = createMemoryAgentJournal<string>({ coordination: 'standalone' })
  const open = value(decodeAgentOperationId('receiver-open'))
  const initial: AcceptedInput = {
    id: value(decodeInputId('receiver-input')),
    content: message.ok,
    source: null,
    priority: 'ordinary',
  }
  const invokeEntry = {
    kind: 'invoke' as const,
    operation: open,
    execution,
    initial,
    checkpoint: {
      schema: testAdoption('checkpoint'),
      definition: testAdoption('definition'),
      step: value(decodeStepId('receiver-step')),
      position: 'M1',
      calls: [pending],
      passages: [],
      batch: null,
      inputBatch: null,
      requestPreparation: null,
      compaction: null,
      adoptedContext: null,
      guard: null,
      completedPassages: [],
      priorConditions: null,
      currentHandoff: null,
    },
  }
  const handoff = { kind: 'input' as const, execution, entry: open, input: initial.id }
  const runtime = {
    instance,
    scope: testEvidence('scope'),
    definition: testAdoption('definition'),
    grant: null,
  }
  value(
    await journal.port.open({
      ...access,
      execution,
      operation: open,
      original: {
        entry: invokeEntry,
        handoff,
        outcome: {
          request: {
            kind: 'input',
            reference: handoff,
            entry: invokeEntry,
            source: { kind: 'external-input', input: initial.id },
          },
          origin: { kind: 'invoke', ...runtime },
          provider: testAdoption('message-handoff'),
          qualification: testEvidence('qualification'),
          record: testEvidence('handoff/receiver-open'),
          decision: {
            kind: 'prepared',
            message: initial.content,
            admission: testEvidence('admission/receiver-open'),
          },
        },
      },
      runtime,
    }),
  )
  const sent: AgentAccountHandoff[] = []
  let outcome: AgentAccountOutcome = { kind: 'received' }
  const dependencies: ModelReceiverDependencies<string> = {
    provider: journal.provider,
    targets: journal.targets,
    access: {
      async check() {
        return { kind: 'allowed', evidence: testEvidence('access') }
      },
    },
    capacity: () => ({ records: 16, bytes: 1000000, attachments: 16, inFlight: 2 }),
    models: {
      async inspect() {
        return {
          ok: {
            kind: 'found',
            state: {
              phase: 'accepted',
              call: reference.call,
              revision: value(decodeRevision('1')),
              consumer: pending.position,
              control: { kind: 'none' },
              custody: { kind: 'producer' },
            },
          },
        }
      },
      async dispatches() {
        return {
          ok: [
            {
              dispatch: delivery.key.dispatch,
              supplier: {
                adoption: testAdoption('supplier'),
                recipient: 'test',
                model: 'test',
                credential: { kind: 'factory' },
              },
              intent: reference.admission,
              send: 'started',
              firstContent: 'none-proven',
              terminal: null,
              account: delivery.account,
              materialization: null,
            },
          ],
        }
      },
    },
    outlet: {
      async deliver(input) {
        sent.push(input.handoff)
        return outcome
      },
    },
  }
  return {
    durability: 'none' as const,
    access,
    execution,
    delivery,
    dependencies,
    journal,
    sent,
    outlet(next: AgentAccountOutcome) {
      outcome = next
    },
  }
}
