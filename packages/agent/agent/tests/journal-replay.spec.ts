// The memory Journal against the trace replay of the contract's `./testing` entry (AG-23): the
// behaviors the TLC simulation of the finishing model exported are replayed step by step, and the
// violating behaviors of the negative controls are reported at their forbidden last step. The
// session-adapters Journal runs the same replay on its own fixture.
import { describe, it } from 'vitest'
import { createMemoryAgentJournal } from '@omne-harness/agent/testing'
import { decodeActionId, type PendingCall } from '@omne-harness/agent-contract'
import {
  agentJournalReplayConformance,
  createTestCancellationPolicy,
  testCancellationPolicyInstallation,
  type AgentJournalCoreFixture,
} from '@omne-harness/agent-contract/testing'
import { decodeModelOperationId, encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  acceptedInput,
  access,
  checkpoint,
  commitAt,
  consumption,
  evidence,
  instance,
  load,
  modelCall,
  ok,
  open,
  operation,
  producedResult,
} from './journal-support.ts'

/** A standalone memory Journal with the test cancellation policy, one execution per trace. */
const fixture: AgentJournalCoreFixture<string> = {
  async open(name) {
    const memory = createMemoryAgentJournal<string>({
      coordination: 'standalone',
      cancellation: {
        installation: testCancellationPolicyInstallation,
        policy: createTestCancellationPolicy(),
      },
    })
    const opened = await open(memory.port, name)
    return {
      journal: memory.port,
      access,
      execution: opened.execution,
      receipt: opened.receipt,
      authority: opened.authority,
      checkpoint: checkpoint(),
      installation: testCancellationPolicyInstallation,
      acceptInput: async label => acceptedInput(`input-${label}`),
      // A Model call whose effect intent the execution saves; the result settles its call item.
      produceResult: async label => {
        const result = producedResult(label)
        const owned = consumption(`consumption-${label}`)
        const pending: PendingCall = {
          kind: 'model',
          purpose: 'main',
          action: ok(decodeActionId(`action-${label}`)),
          consumption: owned,
          position: { owner: 'agent', work: opened.execution, position: 'I3', purpose: 'main' },
          fixed: evidence(`fixed/${label}`),
          reference: ok(
            encodeModelInvocationRef({
              tenant: access.tenant,
              call: modelCall(label),
              admission: ok(decodeModelOperationId(`mop_${label}`)),
            }),
          ),
        }
        // The effect is committed under the current attachment, also after a takeover.
        const snapshot = await load(memory.port, opened.execution)
        const authority = snapshot.executionAttachment ?? opened.authority
        ok(
          await memory.port.commit(
            commitAt(snapshot, authority, `effect-${label}`, {
              checkpoint: snapshot.checkpoint,
              effects: [{ action: pending.action, pending, authority }],
            }),
          ),
        )
        return {
          result,
          consumption: owned,
          transfer: { kind: 'processed', result, consumption: owned, completion: evidence('done') },
        }
      },
      faultNext: (method, outcome) => memory.failNext(method, { kind: 'commit-unknown', outcome }),
      takeover: async label =>
        ok(
          await memory.port.attach({
            ...access,
            execution: opened.execution,
            operation: operation(`takeover-${label}`),
            instance: instance(`instance-${label}`),
            grant: null,
            recovery: evidence('recovery'),
            takeover: evidence('takeover'),
          }),
        ).authority,
    }
  },
}

describe('the memory Journal replays the traces of the finishing model', () => {
  for (const entry of agentJournalReplayConformance(fixture)) {
    it(entry.name, async () => {
      await entry.run()
    })
  }
})
