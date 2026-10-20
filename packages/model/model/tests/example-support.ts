import { createHash } from 'node:crypto'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeCredentialId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type ConsumerRef,
  type DurableEvidence,
  type ResultVersion,
  type FixedModelRequest,
  type Publication,
  type TransportFact,
  type TransportTermination,
} from '@omne-harness/model-contract'
import { createScriptedTransport } from '@omne-harness/model-contract/testing'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import type { ModelConfiguration, SendResources } from '@omne-harness/model'

function decoded<T>(reply: { ok: T } | { failure: unknown }): T {
  if ('failure' in reply) throw new Error(`Invalid example input: ${JSON.stringify(reply.failure)}`)
  return reply.ok
}
export const operation = (name: string) => decoded(decodeModelOperationId(`mop_example-${name}`))

/**
 * Only repeated test assembly lives here. Each lesson calls the real public runtime itself.
 * No vendor, disk store or production host participates. These identities and evidence are
 * trusted only inside this isolated in-memory assembly. Never use this authority in production.
 */
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
  // The request fixes all adoptions. A production request comes from qualified preparation
  // and conversion providers. Factory means a credential source, not permission to use it.
  const request: FixedModelRequest = {
    profile: adoption,
    suppliers: [
      { adoption, recipient: 'example.invalid', model: 'script', credential: { kind: 'factory' } },
    ],
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
      capacity: { bytes: '1000000', blocks: '100', attachmentBytes: '0' },
    },
    authority: {
      // Every protected access checks the actual principal and the minted tenant.
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
        // Continuity vouches for this host's original call. It is not an access token.
        continuity: input =>
          input.source.owner === 'example-host' && input.source.record === call
            ? { ok: input.source }
            : unavailable(),
        materialization: input => ({ ok: evidence(`${input.call}/${input.dispatch}`) }),
        // This controlled iterator never prefetches. The exact batch digest is provided by
        // Commands, so this proof covers the original window rather than a guessed terminal.
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
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'value', scope: 'factory', value: 'synthetic-example-only' }),
      },
      sources: [
        {
          profile: adoption,
          supplier: adoption,
          recipient: 'example.invalid',
          model: 'script',
          credential: {
            kind: 'factory',
            official: true,
            queryId: decoded(decodeCredentialId('example-query')),
          },
          current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
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
      let owned: import('@omne-harness/model-contract').MaterializedTransport | undefined
      return {
        ok: {
          transport: {
            async prepare(request, supplier) {
              const prepared = await transport.transport.prepare(request, supplier)
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
            // Start is synchronous. Only delivery of its first fact waits for the lesson.
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
  // createSender uses the testing assembly's public shared credential fence. The real product
  // sender owns materialization, window/send writes, the one start, and reverse-order release.
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
    // This is the lesson application's completion store, not a Model API or durable backend.
    completedRecords,
    capacity: { bytes: '100000', blocks: '10', attachmentBytes: '0' },
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
      // Closing an observation is separate from withdrawing a live route. Neither action
      // cancels the business call. The memory host has no background production scheduler.
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
