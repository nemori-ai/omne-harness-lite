// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file, drives a call of each pi family through the assembled send path, then meters the next
// request with the real preparation lease.
//
// The calibrated metering of the local host as one composition: the first call X runs through
// `assembleLocalModel`, the real Model runtime and the in-memory ModelCommands, settles with a
// reasoning state, is read, acknowledged and cleaned up. The next request continues X and carries
// X's reply. Its lease comes from the same host (`host.preparation`), reads X through the same
// ModelCommands and meters with the real family meter over the real `rules.plan`. Nothing leaves
// the machine: the server answers with the recorded SSE body of the model that the request names.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  decodeModelCallId,
  judgeFixedModelRequest,
  type AssembledModelInput,
  type FixedModelRequest,
  type ModelBlock,
  type ModelInputMeter,
  type ModelPreparationLease,
  type ModelProfile,
  type PreparationLineage,
  type RequestBudget,
  type ResultPart,
} from '@omne-harness/model-contract'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { assembleLocalHost, decoded, MARGIN_PERCENT, ROUTE_PATH } from './support/local-host.ts'
import { officialProfile } from './support/profiles.ts'
import { readRecordFixture, type FamilyName, type RecordFixture } from './support/records.ts'

type Case = Readonly<{
  family: FamilyName
  name: string
  /** The method name of the family for a unit replaced by the output count of its source. */
  outputGroup: string
  /**
   * Whether X's own request history holds an earlier reply with reasoning state, for which the
   * fixture declares no source. When X cannot be read the anchor misses and the full metering
   * reaches that reply first, so it decides the named unavailability (`source-missing`).
   */
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
      ? OPENAI_RECORDS.filter(record => record.name === item.name)
      : ANTHROPIC_RECORDS.filter(record => record.name === item.name)
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

/**
 * X's reply as the consumer writes it into the next request: the read blocks, the scope of the
 * request declaration, the format of X's receipt and the positions of the reasoning state parts.
 */
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

/** The identity of the carried reply in the next request, as the judge branded it. */
function replyId(request: FixedModelRequest) {
  const message = request.messages.find(item => item.id === ASSISTANT_ID)
  if (message === undefined) throw new Error('the next request has no reply')
  return message.id
}

/** The first request with these messages appended, through the contract judge. */
function nextRequest(fixture: RecordFixture, appended: readonly unknown[]): FixedModelRequest {
  const json: unknown = fixture.requestJson
  const messages: unknown = Reflect.get(Object(json), 'messages')
  if (!Array.isArray(messages)) throw new Error('fixture request without messages')
  return decoded(judgeFixedModelRequest({ ...Object(json), messages: [...messages, ...appended] }))
}

function assembledOf(request: FixedModelRequest): AssembledModelInput {
  return {
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    parameters: request.parameters,
    representation: request.representation,
    source: request.source,
  }
}

/** Plans the request with the lease's rules and measures it with the lease's meter. */
function measureOn(
  lease: ModelPreparationLease,
  profile: ModelProfile,
  request: FixedModelRequest,
): ReturnType<ModelInputMeter['measure']> {
  const [binding] = lease.bindings
  const assembled = assembledOf(request)
  const planned = decoded(binding.rules.plan({ profile, supplier: binding.supplier, assembled }))
  return binding.meter.measure({
    profile: profile.adoption,
    supplier: profile.definition.suppliers[0],
    context: profile.definition.context,
    limits: profile.definition.limits,
    assembled,
    parameters: planned.parameters,
    representation: planned.representation,
  })
}

function inputEstimate(budget: RequestBudget) {
  const check = budget.checks.find(item => item.metric === 'input-tokens')
  if (check?.measurement.kind !== 'estimate') throw new Error('no estimated input check')
  return check.measurement
}

function known(account: { usage: readonly unknown[] } | null, name: string): bigint {
  const item = account?.usage.find(entry => Reflect.get(Object(entry), 'name') === name)
  const lexeme: unknown = Reflect.get(Object(item), 'lexeme')
  if (Reflect.get(Object(item), 'state') !== 'known' || typeof lexeme !== 'string')
    throw new Error(`usage ${name} is not known`)
  return BigInt(lexeme)
}

const ceilMargin = (estimated: bigint): bigint => (estimated * MARGIN_PERCENT + 99n) / 100n

/**
 * Runs X through the host: drive to settlement, read the reply, acknowledge it and release the
 * request material. Returns X's reply as the assistant message of the next request.
 */
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

        // X's dispatch keeps its message sequence, its receipt and its account after cleanup.
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

        // The consumer writes X's reply as the assistant message of the next request.
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
          decoded(measureOn(leases[0], profile, withReply)),
          decoded(measureOn(leases[1], profile, withoutReply)),
        ] as const
        for (const budget of budgets)
          expect(budget.calibration).toEqual({ anchor: { kind: 'hit' } })
        const [carried, plain] = budgets.map(inputEstimate)
        if (carried === undefined || plain === undefined) throw new Error('two estimates')

        // The amount is the anchor plus the estimate of the new units; the margin covers only
        // the estimate. The carried reply adds exactly X's output count, the rest is the same.
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
              measureOn(lease, profile, withReply),
              measureOn(continued, profile, withoutReply),
            ]
            expect(await lease.release()).toEqual({})
            expect(await continued.release()).toEqual({})
            return measured
          }),
        )
        expect(JSON.stringify(outcomes[0])).toBe(JSON.stringify(outcomes[1]))
        // X reads as no fact: the anchor misses and the full metering answers. A reasoning unit
        // without an output count is a named unavailability, never zero.
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
