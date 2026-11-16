import { fail, succeed } from '@omne-harness/operation-result'
import { createHash } from 'node:crypto'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type ConsumerRef,
  type DurableEvidence,
  type ResultVersion,
  type FixedModelRequest,
  decodeProviderName,
} from '@omne-harness/model-contract'
import {
  type Publication,
  type TransportFact,
  type TransportTermination,
} from '@omne-harness/model-contract/provider'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import type { ModelConfiguration, SendResources } from '@omne-harness/model'

function decoded<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) throw new Error(`Invalid example input: ${JSON.stringify(reply.failure)}`)
  return reply.ok
}
export const operation = (name: string) => decoded(decodeModelOperationId(`mop_example-${name}`))

export function createExampleAssembly(script: {
  facts: readonly Exclude<TransportFact, { kind: 'ended' }>[]
  termination: TransportTermination
  paging?: { parts: number; targetBytes: number }
}) {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('Invalid example tenant')
  const scope = tenant(organization.value, account.value)
  const principal = Object.freeze({ subject: 'example-developer' })
  const call = decoded(decodeModelCallId('mcall_example'))
  const instance = decoded(decodeModelInstanceId('minst_example'))
  const adoption: Adoption = {
    owner: 'example',
    name: 'script',
    revision: '1',
    digest: '0'.repeat(64),
  }
  const provider = decoded(decodeProviderName('example.invalid'))
  const request: FixedModelRequest = {
    profile: adoption,
    suppliers: [{ adoption, provider, model: 'script', credential: { layer: 'official' } }],
    retryPolicy: adoption,
    representation: adoption,
    source: adoption,
    fallback: false,
    parameters: [],
    parameterAdoptions: [],
    system: [],
    messages: [],
    tools: [],
    toolChoice: 'none',
    declarations: [
      {
        produces: 'example.invalid/script',
        accepts: ['example.invalid/script'],
        foreignThinking: 'omit',
      },
    ],
  }
  const evidence = (record: string) => ({
    owner: 'example-host',
    record,
    revision: '1',
    digest: '1'.repeat(64),
  })
  const unavailable = () =>
    ({
      failure: { kind: 'unavailable', dependency: 'example', diagnostic: 'not-supplied' },
    }) as const
  const consumer = {
    owner: 'example-consumer',
    work: 'lesson',
    position: 'answer',
    purpose: 'learn-model',
  }
  const completed = new Map<
    string,
    { result: ResultVersion; consumer: ConsumerRef; proof: DurableEvidence; outcome: string }
  >()
  const completedRecords = {
    finish(input: {
      result: ResultVersion
      consumer: ConsumerRef
      outcome: string
    }): DurableEvidence {
      const digest = createHash('sha256')
        .update(JSON.stringify({ call, ...input }))
        .digest('hex')
      const proof = { owner: consumer.owner, record: digest, revision: '1', digest }
      completed.set(proof.record, { ...structuredClone(input), proof })
      return { ...proof }
    },
  }
  const assembly = createTestModelDependencies({
    start: '2026-10-20T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 8,
    sends: [],
    owners: [{ consumerOwner: 'example-consumer', work: { kind: 'exempt' }, evidence: adoption }],
    limits: {
      scanPageCalls: 8,
      resultPageParts: script.paging?.parts ?? 8,
      resultPageTargetBytes: script.paging?.targetBytes ?? 1024,
      readIdleMs: 1000,
      unacknowledgedResults: 10,
    },
    authority: {
      authorize: ({ access, action }) =>
        access.principal === principal && tenantEquals(access.tenant, scope)
          ? { ok: { owner: 'example-identity', subject: principal.subject, revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: input =>
        input.instance === instance && tenantEquals(input.tenant, scope)
          ? { ok: { owner: 'example-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption,
        continuity: input =>
          input.source.owner === 'example-host' && input.source.record === call
            ? { ok: input.source }
            : unavailable(),
        materialization: input => ({ ok: evidence(`${input.call}/${input.dispatch}`) }),
        receive: input => ({
          ok: {
            window: input.window,
            batchDigest: input.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        handoff: input => {
          if (input.evidence.kind !== 'processed') return unavailable()
          const proof = input.evidence.completion
          const record = completed.get(proof.record)
          return record &&
            input.call === call &&
            tenantEquals(input.tenant, scope) &&
            record.result === input.result &&
            JSON.stringify(record.consumer) === JSON.stringify(input.consumer) &&
            JSON.stringify(record.proof) === JSON.stringify(proof) &&
            record.outcome.length > 0
            ? { ok: { ...record.proof } }
            : { failure: { kind: 'handoff-invalid', reason: 'example-completion-record' } }
        },
      },
    ],
    sending: {
      maxRetainedAttempts: 8,
      credentials: {
        layerOf: () => fail({ kind: 'unavailable' }),
        resolve: () => succeed(new Map([['apiKey', 'synthetic-example-only']])),
      },
      sources: [
        {
          profile: adoption,
          supplier: adoption,
          provider,
          model: 'script',
          official: true,
          current: () => ({ ok: { authorized: true } }),
        },
      ],
    },
  })
  let resume!: () => void
  const gate = new Promise<void>(resolve => {
    resume = resolve
  })
  const transport = createScriptedTransport({
    receipt: { supplier: adoption, representation: adoption, payloadDigest: 'a'.repeat(64) },
    facts: script.facts,
    ending: { kind: 'terminated', termination: script.termination },
    rejection: null,
  })
  const resources: SendResources<typeof principal> = {
    async acquire() {
      let owned: import('@omne-harness/model-contract/provider').MaterializedTransport | undefined
      return {
        ok: {
          transport: {
            async prepare(request, supplier, dispatch) {
              const prepared = await transport.transport.prepare(request, supplier, dispatch)
              if ('failure' in prepared) return prepared
              return {
                ok: {
                  close: () => prepared.ok.close(),
                  async materialize(signal) {
                    const result = await prepared.ok.materialize(signal)
                    if ('ok' in result) owned = result.ok
                    return result
                  },
                },
              }
            },
          },
          startWithCredential(materialized, _syntheticCredential, signal) {
            if (materialized !== owned) throw new Error('Foreign example materialization')
            const facts = materialized.start(signal)
            return {
              async *[Symbol.asyncIterator]() {
                await gate
                yield* facts
              },
            }
          },
          async release() {
            owned = undefined
          },
        },
      }
    },
  }
  const send = assembly.controls.send.createSender({ resources })
  let published!: () => void
  const publicationReady = new Promise<void>(resolve => {
    published = resolve
  })
  let publication: Publication | undefined
  const instances = {
    ...assembly.dependencies.instances,
    async publish(...args: Parameters<typeof assembly.dependencies.instances.publish>) {
      const result = await assembly.dependencies.instances.publish(...args)
      if ('ok' in result) {
        publication = result.ok
        published()
      }
      return result
    },
  }
  return {
    access: { principal, tenant: scope },
    call,
    request,
    consumer,
    completedRecords,
    driveInput: {
      principal,
      tenant: scope,
      call,
      instance,
      operation: operation('claim'),
      continuity: evidence(call),
    },
    dependencies: { ...assembly.dependencies, send, instances },
    publicationReady,
    upstream: { resume, counts: transport.counts },
    async withdrawPublication() {
      assembly.controls.instances.take()
      if (publication) {
        const result = await instances.withdraw(publication)
        if ('failure' in result)
          throw new Error(`Withdraw failed: ${JSON.stringify(result.failure)}`)
      }
    },
  }
}
export const configuration: ModelConfiguration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
