import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { readJsonText } from '@omne-harness/json-text'
import type { Effect, ToolResultData } from '@omne-harness/tool-contract'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  adoption,
  configuration,
  evidence,
  functionDefinition,
  jsonLimits,
  ok,
  operationId,
  text,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const classes = [
  { category: 'A', model: false, offloaded: false, program: false },
  { category: 'B', model: false, offloaded: false, program: true },
  { category: 'C', model: true, offloaded: false, program: false },
  { category: 'D', model: true, offloaded: false, program: true },
  { category: 'E', model: true, offloaded: true, program: false },
  { category: 'F', model: true, offloaded: true, program: true },
] as const
const samples = classes.flatMap(sample =>
  [false, true].flatMap(native =>
    (['not-occurred', 'occurred', 'unknown'] as const).map(effect => ({
      ...sample,
      native,
      effect,
    })),
  ),
)

it.each(samples)(
  'preserves each channel lifetime for $category native=$native effect=$effect',
  async sample => {
    let now = 0
    const effect: Effect =
      sample.effect === 'unknown'
        ? { kind: 'unknown', diagnostic: 'external effect confirmation is pending' }
        : { kind: sample.effect, evidence: evidence('external-effect') }
    const data: ToolResultData = sample.program
      ? {
          kind: 'json',
          contract: adoption('matrix-program'),
          schema: { id: 'matrix-program', revision: '1', digest: 'sha256:matrix-program' },
          value: { kind: 'number', lexeme: '12345678901234567890.00' },
        }
      : { kind: 'none' }
    const schema = readJsonText('{"type":"number"}', jsonLimits)
    if (schema.kind !== 'ok') throw new Error('invalid schema fixture')
    const base = functionDefinition()
    if (base.kind !== 'function') throw new Error('function fixture required')
    const content = sample.model
      ? [text('model', sample.offloaded ? '中🙂'.repeat(1200) : 'short receipt')]
      : []
    const f = await settlementFixture({
      effect,
      definition: {
        ...base,
        returns: {
          ...base.returns,
          program:
            data.kind === 'none'
              ? { kind: 'none' }
              : {
                  kind: 'json',
                  contract: data.contract,
                  schema: data.schema,
                  maxBytes: 1024,
                  definition: {
                    schema: schema.value,
                    vocabulary: adoption('json-schema'),
                    descriptions: [],
                  },
                },
        },
      },
      offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 8192, maxRetentionMs: 10 },
      wrapMaterialClock: () => ({
        sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
      }),
      value: raw => ({
        content,
        data,
        original: { kind: 'none' },
        attachments: sample.native ? [raw.content] : [],
      }),
    })
    const state = ok(await f.preserve())
    if (state.phase !== 'settled' || state.delivery === null)
      throw new Error('missing result delivery')
    const delivered = ok(await f.ledger.delivery.read({ ...f.access, result: state.result }))
    expect(delivered.data).toEqual(data)
    expect(delivered.attachments).toEqual(f.final.result.attachments)
    expect(delivered.original.kind).toBe(sample.offloaded ? 'offloaded' : 'none')
    if (!sample.offloaded) expect(delivered.content).toEqual(content)
    expect(state.effect).toEqual(effect)
    ok(
      await f.ledger.commands.releaseDelivery({
        ...f.access,
        operation: operationId('matrix-consumed'),
        result: state.result,
        delivery: state.delivery.delivery,
        consumer: state.delivery.consumer,
        evidence: {
          kind: 'processed',
          completion: evidence('matrix-consumer', state.delivery.consumer.owner),
        },
      }),
    )
    await expect(
      f.ledger.reads.result({ ...f.access, result: state.result, after: null }),
    ).resolves.toMatchObject({
      failure: { kind: 'not-found', target: 'result', reason: 'released' },
    })
    if (delivered.original.kind === 'offloaded') {
      const request = {
        ...f.access,
        result: state.result,
        bodyId: delivered.original.bodyId,
        after: null,
        maxBytes: 128,
      }
      await expect(f.ledger.reads.body.read(request)).resolves.toMatchObject({
        ok: { kind: 'text' },
      })
      now = 10
      await expect(f.ledger.reads.body.read(request)).resolves.toMatchObject({
        failure: { kind: 'not-found', target: 'body', reason: 'expired' },
      })
    }
    for (let step = 0; step < 24; step++) {
      if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'idle') break
      if (step === 23) throw new Error('material cleanup did not finish')
    }
    const retained = (await f.records()).filter(
      row => row.kind === 'material' && row.material.state.kind !== 'deleted',
    )
    expect(retained).toHaveLength(sample.native ? 1 : 0)
    if (sample.native) {
      expect(retained[0]).toMatchObject({ material: { purpose: 'raw' } })
      const raw = retained[0]
      if (raw?.kind !== 'material') throw new Error('missing native material')
      const page = ok(
        await f.materialStore.read({
          ...f.access,
          material: raw.material.material,
          offset: '0',
          maxBytes: 128,
        }),
      )
      expect(Buffer.from(page.bytes).toString('utf8')).toBe('original bytes')
    }
    expect((await f.load()).state.effect).toEqual(effect)
  },
)
