// The release `handoff` evidence routes by consumer owner (R2-D262 S2). M2 has one consumer owner of
// Model calls, the Agent; its ACKs go to the Agent custody evidence. Another owner's ACK is routed
// nowhere: `unavailable`, never refused as forged, and the Agent adapter is not asked. Red when an
// ACK of another owner reaches the Agent adapter (which would refuse its real evidence as forged),
// or when the Agent owner's ACK no longer reaches it.
import { AGENT_CONSUMER_OWNER, type AgentCustodyQuestion } from '@omne-harness/agent'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeResultVersion,
  encodeModelInvocationRef,
  decodeModelOperationId,
} from '@omne-harness/model-contract'
import type { HandoffEvidenceInput } from '@omne-harness/model/commands'
import { expect, it } from 'vitest'
import { createModelEvidence } from '../../src/model/evidence.ts'

function must<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(JSON.stringify(outcome.failure))
}

const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
if (!organization.ok || !account.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)
const ADOPTION = {
  owner: 'o',
  name: 'agent-consumer-evidence',
  revision: '1',
  digest: '0'.repeat(64),
}
const call = must(decodeModelCallId('mcall_route'))

function ackOf(owner: string): HandoffEvidenceInput {
  const custody = { owner, record: 'saved', revision: '1', digest: '1'.repeat(64) }
  return {
    principal: 'p',
    tenant: TENANT,
    call,
    execution: null,
    consumer: { owner, work: 'work/step-1', position: 'I3', purpose: 'main' },
    result: must(decodeResultVersion('mrver_route')),
    evidence: { kind: 'retained', custody },
    reference: must(
      encodeModelInvocationRef({
        tenant: TENANT,
        call,
        admission: must(decodeModelOperationId('mop_a')),
      }),
    ),
  }
}

function evidenceWith(asked: AgentCustodyQuestion<unknown>[]) {
  return createModelEvidence(ADOPTION, {
    initial: () => undefined,
    reader: () => undefined,
    custody: () => ({
      verify: input => {
        asked.push(input)
        return Promise.resolve(
          input.evidence.kind === 'retained'
            ? { ok: input.evidence.custody }
            : { failure: { kind: 'handoff-invalid', reason: 'kind' } },
        )
      },
    }),
  })
}

it('routes the ACK of the Agent owner to the Agent custody evidence', async () => {
  const asked: AgentCustodyQuestion<unknown>[] = []
  const ack = ackOf(AGENT_CONSUMER_OWNER)
  expect(await evidenceWith(asked).handoff(ack)).toHaveProperty('ok')
  expect(asked).toHaveLength(1)
})

it('answers unavailable for the ACK of another owner and does not ask the Agent adapter', async () => {
  const asked: AgentCustodyQuestion<unknown>[] = []
  expect(await evidenceWith(asked).handoff(ackOf('@omne-harness/tool'))).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'consumer-evidence',
      diagnostic: 'owner-not-wired',
    },
  })
  expect(asked).toEqual([])
})
