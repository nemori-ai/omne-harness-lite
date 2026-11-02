import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelInstanceId,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { MaterializedTransport, SendDemand } from '@omne-harness/model-contract/provider'
import {
  composeFamilies,
  createNetworkResources,
  type PiTransportConfig,
} from '@omne-harness/pi-ai-transport'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { sendResourcesOver } from '../src/send-resources.ts'
import { readRecordFixture } from './support/records.ts'

function take<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('fixture identity')
}
const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture tenant')
const scope = tenant(organization.value, account.value)
const call = take(decodeModelCallId('mcall_proof'))
const request = readRecordFixture('pi-ai-openai', OPENAI_RECORDS[0]).request
const demand: SendDemand<unknown> = {
  principal: null,
  tenant: scope,
  call,
  execution: {
    tenant: scope,
    call,
    instance: take(decodeModelInstanceId('minst_proof')),
    generation: '1',
  },
  dispatch: take(decodeDispatchId('mdisp_proof')),
  request,
  supplier: request.suppliers[0],
  consumer: { owner: 'tests', work: 'work', position: '1', purpose: 'proof' },
  initiator: { owner: 'tests', subject: 'actor', revision: '1' },
}
const unavailable = {
  failure: {
    kind: 'unavailable',
    dependency: 'model-materialization',
    diagnostic: 'source-unavailable',
  },
}
const binding = { failure: { kind: 'invalid', field: 'receipt', reason: 'binding' } }

function harness(maxRecords = 2) {
  const network = createNetworkResources({ maxConnections: 1, idleConnectionTimeoutMs: 1000 })
  let allowed = true
  let created = 0
  let prepares = 0
  let materializes = 0
  let closed = 0
  let wait: Promise<void> = Promise.resolve()
  let materializationFailure: TransportFailure | null = null
  const resources = sendResourcesOver<unknown>({
    config: {
      network,
      families: composeFamilies([]),
      routes: {},
      limits: {
        connectTimeoutMs: null,
        maxErrorBodyBytes: 1024,
        maxEventBytes: 1024,
        json: {
          maxBytes: 1024,
          maxDepth: 8,
          maxItems: 8,
          maxMembers: 8,
          maxStringLength: 1024,
          maxNumberLength: 8,
        },
      },
      materialization: {
        maxRecords,
        execution: () =>
          allowed
            ? { ok: demand.initiator }
            : { failure: { kind: 'denied', action: 'execution-channel' } },
      },
    },
    createTransport(_config: PiTransportConfig) {
      created++
      return {
        transport: {
          async prepare() {
            prepares++
            return {
              ok: {
                async materialize() {
                  materializes++
                  await wait
                  if (materializationFailure !== null) return { failure: materializationFailure }
                  const product: MaterializedTransport = {
                    receipt: {
                      supplier: demand.supplier.adoption,
                      representation: request.representation,
                      payloadDigest: 'a'.repeat(64),
                      replayFormat: 'proof-v1',
                    },
                    start: () => ({ async *[Symbol.asyncIterator]() {} }),
                    async close() {
                      closed++
                    },
                  }
                  return { ok: product }
                },
                async close() {},
              },
            }
          },
        },
        async close() {},
      }
    },
  })
  return {
    resources,
    counts: () => ({ created, prepares, materializes, closed }),
    revoke: () => {
      allowed = false
    },
    pause: (barrier: Promise<void>) => {
      wait = barrier
    },
    fail: (failure: TransportFailure) => {
      materializationFailure = failure
    },
    async prepare(input = demand) {
      const resource = take(await resources.acquire(input))
      const prepared = take(
        await resource.transport.prepare(input.request, input.supplier, { resent: [] }),
      )
      return { resource, prepared }
    },
    async close() {
      await resources.close()
      await network.close()
    },
  }
}

describe('real materialization provenance', () => {
  it('binds all proof inputs, clones receipts and checks current execution qualification', async () => {
    const h = harness()
    try {
      const { prepared } = await h.prepare()
      const product = take(await prepared.materialize(new AbortController().signal))
      const proof = { ...demand, receipt: structuredClone(structuredClone(product.receipt)) }
      const source = take(h.resources.materialization.prove(proof))
      expect(source.owner).toBe('model')
      for (const changed of [
        { ...proof, consumer: { ...proof.consumer, work: 'other' } },
        { ...proof, supplier: { ...proof.supplier, model: 'other' } },
        { ...proof, request: { ...proof.request, messages: [] } },
        { ...proof, receipt: { ...proof.receipt, replayFormat: 'other' } },
      ])
        expect(h.resources.materialization.prove(changed)).toEqual(binding)
      const { replayFormat: _format, ...receipt } = proof.receipt
      expect(h.resources.materialization.prove({ ...proof, receipt })).toEqual(binding)
      expect(
        h.resources.materialization.prove({
          ...proof,
          execution: { ...demand.execution, generation: '2' },
        }),
      ).toEqual(unavailable)
      h.revoke()
      expect(h.resources.materialization.prove(proof)).toEqual({
        failure: { kind: 'denied', action: 'execution-channel' },
      })
    } finally {
      await h.close()
    }
  })

  it('reserves capacity and checks the acquired demand before creating or preparing a transport', async () => {
    const h = harness(1)
    try {
      const first = await h.prepare()
      expect(await h.resources.acquire(demand)).toHaveProperty(
        'failure.diagnostic',
        'record-capacity',
      )
      expect(h.counts().created).toBe(2)
      expect(
        await first.resource.transport.prepare({ ...request, messages: [] }, demand.supplier, {
          resent: [],
        }),
      ).toEqual({ failure: { kind: 'invalid', field: 'demand', reason: 'binding' } })
      expect(h.counts().prepares).toBe(1)
      await first.resource.release()
      h.revoke()
      expect(await h.resources.acquire(demand)).toHaveProperty('failure.kind', 'denied')
      expect(h.counts().created).toBe(2)
    } finally {
      await h.close()
    }
  })

  it('does not overwrite a live resource record with another successful product', async () => {
    const h = harness()
    try {
      const first = await h.prepare()
      const second = await h.prepare()
      const product = take(await first.prepared.materialize(new AbortController().signal))
      expect(await second.prepared.materialize(new AbortController().signal)).toEqual(binding)
      expect(h.counts().closed).toBe(1)
      await second.resource.release()
      expect(
        h.resources.materialization.prove({ ...demand, receipt: product.receipt }),
      ).toHaveProperty('ok.owner', 'model')
      await first.resource.release()
      expect(h.resources.materialization.prove({ ...demand, receipt: product.receipt })).toEqual(
        unavailable,
      )
    } finally {
      await h.close()
    }
  })

  it('does not register a late product after release and closes that product', async () => {
    const h = harness()
    let resume = () => {}
    h.pause(
      new Promise<void>(resolve => {
        resume = resolve
      }),
    )
    try {
      const { resource, prepared } = await h.prepare()
      const pending = prepared.materialize(new AbortController().signal)
      await resource.release()
      resume()
      expect(await pending).toEqual(unavailable)
      expect(h.counts().closed).toBe(1)
    } finally {
      resume()
      await h.close()
    }
  })

  it('retains a materialization failure and the original promise across repeated calls', async () => {
    const h = harness()
    try {
      h.fail({ kind: 'unavailable', dependency: 'transport', diagnostic: 'down' })
      const { prepared } = await h.prepare()
      const first = prepared.materialize(new AbortController().signal)
      expect(prepared.materialize(new AbortController().signal)).toBe(first)
      const result = await first
      expect(await prepared.materialize(new AbortController().signal)).toBe(result)
      expect(h.counts().materializes).toBe(1)
    } finally {
      await h.close()
    }
  })
})
