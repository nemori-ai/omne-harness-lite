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
import type { ModelCommandsEvidence } from '@omne-harness/model/commands'
import { createDefaultRetryPolicy } from '@omne-harness/model'
import { DEFAULT_COMPACTION_CONSUMER } from '@omne-harness/context-compaction'

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
    receive: () => undefined,
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

it('routes the default summary owner to its own durable completion proof', async () => {
  const evidence = createModelEvidence(ADOPTION, {
    initial: () => undefined,
    reader: () => undefined,
    receive: () => undefined,
    custody: () => undefined,
    compaction: () => ({
      verify: async given => {
        expect(given.consumer.owner).toBe(DEFAULT_COMPACTION_CONSUMER)
        return { failure: { kind: 'handoff-invalid', reason: 'unproven-result' } }
      },
    }),
  })
  const ack = ackOf(DEFAULT_COMPACTION_CONSUMER)
  expect(await evidence.handoff(ack)).toEqual({
    failure: { kind: 'handoff-invalid', reason: 'unproven-result' },
  })
})

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

type ReceiveInput = Parameters<ModelCommandsEvidence['receive']>[0]
type RetryInput = Parameters<ModelCommandsEvidence['retry']>[0]

it('asks the installed receive record for the proof, and answers unavailable while none is installed', async () => {
  const asked: ReceiveInput[] = []
  const proof = { ok: { window: 'w', batchDigest: 'd', paused: true, noPrefetch: true } } as const
  const reader: { current: { prove(input: ReceiveInput): typeof proof } | undefined } = {
    current: undefined,
  }
  const evidence = createModelEvidence(ADOPTION, {
    initial: () => undefined,
    reader: () => undefined,
    receive: () => reader.current as never,
    custody: () => undefined,
  })
  const input = { window: 'w' } as unknown as ReceiveInput

  expect(await evidence.receive(input)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'model-receive-evidence',
      diagnostic: 'receive-window-unproven',
    },
  })
  reader.current = {
    prove: given => {
      asked.push(given)
      return proof
    },
  }
  expect(await evidence.receive(input)).toBe(proof)
  expect(asked).toEqual([input])
})

it('accepts the retry decision of the default policy, and refuses the same source for another decision', async () => {
  const evidence = evidenceWith([])
  const position = {
    operation: must(decodeModelOperationId('mop_position')),
    dispatch: 'mdisp_one',
    policy: ADOPTION,
    consumer: { owner: 'policy', work: call, position: 'mdisp_one', purpose: 'model-retry' },
  } as unknown as RetryInput['position']
  const supplier = { adoption: ADOPTION } as RetryInput['request']['suppliers'][number]
  const request = {
    retryPolicy: ADOPTION,
    fallback: false,
    suppliers: [supplier],
  } as unknown as RetryInput['request']
  const policy = createDefaultRetryPolicy<unknown>({
    adoption: ADOPTION,
    policy: { maxAttempts: 2, maxElapsedMs: 1000, delaysMs: [0], jitter: 0 },
    clock: { now: () => '2026-11-17T00:00:00.000Z' },
    random: () => 0,
  })
  const answer = await policy.decide({
    position,
    request,
    dispatches: [{}],
    failure: { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'http-503' },
  } as unknown as Parameters<typeof policy.decide>[0])
  if (!('ok' in answer) || answer.ok.kind !== 'decided') throw new Error(JSON.stringify(answer))
  const { decision, source } = answer.ok
  expect(decision.kind).toBe('retry')

  const given = { position, decision, source, request } as RetryInput
  expect(await evidence.retry(given)).toEqual({ ok: source })
  expect(
    await evidence.retry({
      ...given,
      decision: { kind: 'stop', fault: { cause: 'runtime-lost' } },
    } as RetryInput),
  ).toEqual({ failure: { kind: 'invalid', field: 'source', reason: 'untrusted' } })
})
