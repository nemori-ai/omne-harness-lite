// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  decodeModelCallId,
  type FixedModelRequest,
  type ModelBlock,
  type PreparationLineage,
  type ResultPart,
} from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { assembleLocalHost, decoded, MARGIN_PERCENT, ROUTE_PATH } from './support/local-host.ts'
import { inputEstimate, known, measureOn } from './support/metering.ts'
import { officialProfile } from './support/profiles.ts'
import { readRecordFixture, type FamilyName, type RecordFixture } from './support/records.ts'

type Case = Readonly<{
  family: FamilyName
  name: string
  outputGroup: string
  historyCarriesState: boolean
}>

const CASES: readonly Case[] = [
  {
    family: 'pi-ai-openai',
    name: 'openai/gpt-5.6-sol',
    outputGroup: 'openai-complete-output-group-workload-estimated/1',
    historyCarriesState: true,
  },
  {
    family: 'pi-ai-anthropic',
    name: 'anthropic/claude-sonnet-5',
    outputGroup: 'anthropic-complete-signed-encrypted-output-zero-framing-estimated/1',
    historyCarriesState: false,
  },
]
const ANCHORED = '+continuation-anchored/1'

function recordOf(item: Case) {
  const records =
    item.family === 'pi-ai-openai'
      ? OPENAI_RECORDS.filter(record => record.name === item.name && record.status === 'current')
      : ANTHROPIC_RECORDS.filter(record => record.name === item.name && record.status === 'current')
  const [record] = records
  if (record === undefined) throw new Error(`no record ${item.name}`)
  return { route: record.route, fixture: readRecordFixture(item.family, record) }
}

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-continuation-')))
  const streams = new Map(
    CASES.map(item => [item.name, recordOf(item).fixture.stream] satisfies [string, string]),
  )
  server = await startHttpsServer(certificate, (res, request) => {
    const model: unknown = Reflect.get(Object(JSON.parse(request.body)), 'model')
    const stream = typeof model === 'string' ? streams.get(model) : undefined
    if (request.path !== ROUTE_PATH || stream === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(stream)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

const ASSISTANT_ID = 'msg_a000000000000000000000'
const NEXT_USER = {
  id: 'msg_n000000000000000000000',
  role: 'user',
  blocks: [
    {
      kind: 'text',
      id: 'n0',
      visibility: { toHuman: true, toModel: true },
      text: 'And what follows from that?',
    },
  ],
}

function replyOf(
  input: Readonly<{ fixture: RecordFixture; blocks: readonly ModelBlock[]; format: string }>,
) {
  const { fixture, blocks, format } = input
  return {
    id: ASSISTANT_ID,
    role: 'assistant',
    blocks,
    replay: {
      scope: fixture.request.declarations[0].produces,
      format,
      at: blocks.flatMap((block, at) => (block.kind === 'reasoning_state' ? [at] : [])),
    },
  }
}

function replyId(request: FixedModelRequest) {
  const message = request.messages.find(item => item.id === ASSISTANT_ID)
  if (message === undefined) throw new Error('the next request has no reply')
  return message.id
}

function nextRequest(fixture: RecordFixture, appended: readonly unknown[]): FixedModelRequest {
  const json: unknown = fixture.requestJson
  const messages: unknown = Reflect.get(Object(json), 'messages')
  if (!Array.isArray(messages)) throw new Error('fixture request without messages')
  return decoded(judgeFixedModelRequest({ ...Object(json), messages: [...messages, ...appended] }))
}

const ceilMargin = (estimated: bigint): bigint => (estimated * MARGIN_PERCENT + 99n) / 100n

async function settleReadAndClean(local: ReturnType<typeof assembleLocalHost>) {
  const callAccess = { ...local.access, call: local.call }
  const { driven, reference } = await local.drive()
  expect(driven).toEqual({ ok: undefined })
  const recovery = decoded(await local.commands.loadRecovery(callAccess))
  if (recovery.state.phase !== 'settled' || recovery.execution === null)
    throw new Error('X did not settle')
  const version = recovery.state.settlement.version

  const consumption = local.provider.runtime.consumption
  const started = decoded(
    await consumption.beginRead({
      ...local.access,
      reference,
      operation: local.operation('read'),
      result: version,
    }),
  )
  if (started.kind !== 'started') throw new Error('the read did not start')
  const parts: ResultPart[] = []
  let state = started.value
  while (state.kind === 'reading') {
    parts.push(...state.page.parts)
    const after = state.page.next
    if (after === null) break
    state = decoded(await consumption.readNext({ ...callAccess, read: started.read, after }))
  }
  decoded(await consumption.closeRead({ ...callAccess, read: started.read }))
  const blocks: ModelBlock[] = parts.map(item => {
    if (item.kind !== 'sealed') throw new Error('X left a partial part')
    return item.block
  })

  decoded(
    await consumption.acknowledge({
      ...callAccess,
      operation: local.operation('ack'),
      result: version,
      evidence: { kind: 'processed', completion: local.completion(version) },
    }),
  )
  expect(
    decoded(
      await local.commands.advanceCleanup({
        ...recovery.execution,
        operation: local.operation('cleanup'),
      }),
    ),
  ).toMatchObject({ kind: 'acknowledged', cleanup: 'released' })
  expect(await local.commands.loadRecovery(callAccess)).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'recovery-material-released' },
  })
  return blocks
}

describe('the next request continues a settled and cleaned call X through the assembled host', () => {
  it.each(CASES.map((item): [string, Case] => [item.name, item]))(
    '%s: the anchor is X’s real input total, the margin covers only the estimate, and the reasoning unit counts as X’s output',
    async (name, item) => {
      const { route, fixture } = recordOf(item)
      const local = assembleLocalHost({
        request: fixture.request,
        label: `continued-${name.replace(/[^a-z0-9]/gu, '-')}`,
        directory,
        gateway: { url: server.url, ca: certificate.cert },
      })
      try {
        const blocks = await settleReadAndClean(local)
        expect(blocks.some(block => block.kind === 'reasoning_state')).toBe(true)

        const [record, ...others] = decoded(
          await local.commands.dispatches({ ...local.access, call: local.call }),
        )
        expect(others).toEqual([])
        expect(record?.messages).toEqual(fixture.request.messages.map(message => message.id))
        if (record === undefined) throw new Error('X has no dispatch')
        const format = record.materialization?.receipt.replayFormat
        if (format === undefined) throw new Error('X has no replay format')
        const anchor =
          known(record.account, 'input') +
          known(record.account, 'cache-read') +
          known(record.account, 'cache-write')
        const output = known(record.account, 'output')

        const reply = replyOf({ fixture, blocks, format })
        const withReply = nextRequest(fixture, [reply, NEXT_USER])
        const withoutReply = nextRequest(fixture, [NEXT_USER])
        const profile = officialProfile({
          family: item.family,
          model: route.model,
          retryPolicy: fixture.request.retryPolicy,
        })
        const reasoned: PreparationLineage = {
          continues: local.call,
          sources: [{ message: replyId(withReply), call: local.call }],
        }
        const leases = [
          decoded(
            await local.host.preparation.acquire({ ...local.access, profile, lineage: reasoned }),
          ),
          decoded(
            await local.host.preparation.acquire({
              ...local.access,
              profile,
              lineage: { continues: local.call },
            }),
          ),
        ] as const
        const budgets = [
          decoded(await measureOn(leases[0], profile, withReply)),
          decoded(await measureOn(leases[1], profile, withoutReply)),
        ] as const
        for (const budget of budgets)
          expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
        const [carried, plain] = budgets.map(inputEstimate)
        if (carried === undefined || plain === undefined) throw new Error('two estimates')

        const carriedEstimate = BigInt(carried.amount) - anchor
        const plainEstimate = BigInt(plain.amount) - anchor
        expect(plainEstimate).toBeGreaterThan(0n)
        expect(carriedEstimate - plainEstimate).toBe(output)
        expect(BigInt(carried.margin)).toBe(ceilMargin(carriedEstimate))
        expect(BigInt(plain.margin)).toBe(ceilMargin(plainEstimate))
        expect(plain.method.name.endsWith(ANCHORED)).toBe(true)
        expect(carried.method.name.endsWith(`+${item.outputGroup}${ANCHORED}`)).toBe(true)

        for (const lease of leases) expect(await lease.release()).toEqual({})
      } finally {
        await local.close()
      }
    },
  )

  it.each(CASES.map((item): [string, Case] => [item.name, item]))(
    '%s: another tenant that names X gets byte for byte what a call that does not exist gives',
    async (name, item) => {
      const { route, fixture } = recordOf(item)
      const local = assembleLocalHost({
        request: fixture.request,
        label: `foreign-${name.replace(/[^a-z0-9]/gu, '-')}`,
        directory,
        gateway: { url: server.url, ca: certificate.cert },
      })
      try {
        const blocks = await settleReadAndClean(local)
        const [record] = decoded(
          await local.commands.dispatches({ ...local.access, call: local.call }),
        )
        const format = record?.materialization?.receipt.replayFormat
        if (format === undefined) throw new Error('X has no replay format')
        const reply = replyOf({ fixture, blocks, format })
        const withReply = nextRequest(fixture, [reply, NEXT_USER])
        const withoutReply = nextRequest(fixture, [NEXT_USER])
        const profile = officialProfile({
          family: item.family,
          model: route.model,
          retryPolicy: fixture.request.retryPolicy,
        })
        const missing = decoded(decodeModelCallId('mcall_never-admitted'))
        const lineageOf = (call: typeof missing): PreparationLineage => ({
          continues: call,
          sources: [{ message: replyId(withReply), call }],
        })
        const outcomes = await Promise.all(
          [
            { access: local.foreign, call: local.call },
            { access: local.access, call: missing },
          ].map(async ({ access, call }) => {
            const lease = decoded(
              await local.host.preparation.acquire({
                ...access,
                profile,
                lineage: lineageOf(call),
              }),
            )
            const continued = decoded(
              await local.host.preparation.acquire({
                ...access,
                profile,
                lineage: { continues: call },
              }),
            )
            const measured = [
              await measureOn(lease, profile, withReply),
              await measureOn(continued, profile, withoutReply),
            ]
            expect(await lease.release()).toEqual({})
            expect(await continued.release()).toEqual({})
            return measured
          }),
        )
        expect(JSON.stringify(outcomes[0])).toBe(JSON.stringify(outcomes[1]))
        const [carried, plain] = outcomes[0] ?? []
        const unavailable = (diagnostic: string) => ({
          failure: {
            kind: 'unavailable',
            dependency: profile.definition.suppliers[0].adoption.owner,
            diagnostic,
          },
        })
        if (item.historyCarriesState) {
          expect(carried).toEqual(unavailable('source-missing'))
          expect(plain).toEqual(unavailable('source-missing'))
        } else {
          expect(carried).toEqual(unavailable('source-unreadable'))
          expect(plain).toMatchObject({
            ok: { calibration: { anchor: { kind: 'miss', reason: 'call-unreadable' } } },
          })
        }
      } finally {
        await local.close()
      }
    },
  )
})
