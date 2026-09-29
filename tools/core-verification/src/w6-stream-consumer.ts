import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  judgeContentBlock,
  readJsonStrict,
  writeJsonLossless,
  jsonNumberSource,
  type JsonNumber,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import { judgeArrivalEnvelope, judgeArrivalEnvelopeText } from '@omne-harness-lite/arrival-events'
import {
  judgeAccountValue,
  ExactDecimal,
  prepareAccountGroup,
  summarize,
  type Cost,
  type Usage,
  type TrimSummary,
} from '@omne-harness-lite/call-accounts'
import {
  start,
  accept,
  snapshot,
  closeOut,
  abandon,
  type AssemblyState,
  type AssemblyResult,
  type AssemblySettlement,
} from '@omne-harness-lite/stream-assembly'
import {
  judgeMessage,
  judgeMessageText,
  judgeModelInvocationRecord,
} from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'

const visible = { toHuman: true, toModel: true }
const frameVisible = { toHuman: true, toModel: false }
const model = { kind: 'model_call', callId: 'model', dispatch: 1 }
const tool = { kind: 'tool_execution', callId: 'call' }
const at = '2026-09-26T00:00:00Z'
const packedConsumer = process.argv.includes('--packed-consumer')
const negativeControl = process.argv.includes('--negative-control=frame-count')
const zeroTrims = {
  merged: 0,
  cut: 0,
  omittedBytes: 0,
  byReason: { rate_merged: 0, frame_too_long: 0, quota_exhausted: 0, rejected: 0 },
}
const unknownUsage: Usage = {
  input_tokens: 'unknown',
  output_tokens: 'unknown',
  cache_read_tokens: 'unknown',
  cache_write_tokens: 'unknown',
  source: 'none',
}
const unknownCost: Cost = { cost_usd: 'unknown', source: 'none' }

function ok<Value>(result: AssemblyResult<Value, string>): Value {
  assert.ok('ok' in result, 'rejected' in result ? result.rejected : 'expected accepted value')
  return result.ok
}
function read(text: string) {
  const result = readJsonStrict(text)
  assert.ok('ok' in result)
  return result.ok
}
function numberEquals(actual: JsonNumber | undefined, expected: number, label = 'exact count') {
  assert.ok(actual !== undefined)
  assert.equal(
    ExactDecimal.from(actual).compare(ExactDecimal.from(expected)),
    0,
    `${label}: actual=${jsonNumberSource(actual)} expected=${expected}`,
  )
}
function trimsEqual(
  actual: TrimSummary,
  expected: {
    merged: number
    cut: number
    omittedBytes: number
    byReason: Readonly<Record<keyof TrimSummary['byReason'], number>>
  },
) {
  numberEquals(actual.merged, expected.merged, 'merged')
  numberEquals(actual.cut, expected.cut, 'cut')
  numberEquals(actual.omittedBytes, expected.omittedBytes, 'omittedBytes')
  for (const reason of ['rate_merged', 'frame_too_long', 'quota_exhausted', 'rejected'] as const)
    numberEquals(actual.byReason[reason], expected.byReason[reason], reason)
}
function feed(target: unknown, events: readonly unknown[]): AssemblyState {
  let state = ok(start(target))
  for (const event of events) {
    assert.deepEqual(judgeArrivalEnvelope({ target, event }), { ok: true })
    state = ok(accept(state, event))
  }
  return state
}
function reject(state: AssemblyState, event: unknown, expected: string) {
  const before = writeJsonLossless(snapshot(state))
  const settlement = writeJsonLossless(closeOut(state))
  assert.deepEqual(accept(state, event), { rejected: expected })
  assert.equal(writeJsonLossless(snapshot(state)), before)
  assert.equal(writeJsonLossless(closeOut(state)), settlement)
}
function openCall(name = 'read_file') {
  return {
    t: 'open',
    index: 0,
    kind: 'tool_call',
    fill: 'append',
    id: 'call-block',
    visibility: visible,
    head: { callId: 'call', tool: name },
  }
}
function callState(raw: string, name = 'read_file', extra: readonly unknown[] = []) {
  return feed(model, [openCall(name), { t: 'fill', index: 0, payload: raw }, ...extra])
}
function firstBlock(value: AssemblySettlement): ContentBlock {
  const block = value.blocks[0]
  assert.ok(block)
  return block
}
function assistant(blocks: readonly ContentBlock[], ending = 'complete') {
  return { id: 'message', type: 'assistant', response: 'response', createdAt: at, ending, blocks }
}
function text(id: string, value: string, visibility = visible) {
  return { id, kind: 'text', visibility, text: value }
}
// Controlled W6 binding, not a claim about a deployed official model implementation.
const adaptation = {
  implementation: { name: 'w6-stream-consumer', revision: 'fixture-1' },
  definition: { modelId: 'openai/test', revision: 'fixture-1' },
  configuration: { revision: 'fixture-1', values: {} },
}
const route = {
  adaptation,
  profile: { origin: 'official', routeName: 'openai/test' },
  profileSnapshot: {
    adaptation,
    providers: ['openai'],
    allowFallback: false,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 200000,
    maxOutputTokens: 64000,
    // This text-only fixture states no real upstream limits or extra project byte cap.
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    inputConstraints: {},
    updatedAt: at,
  },
  selectedBy: 'session',
  provider: 'openai',
  credentialScope: { layer: 'factory' },
  parameters: {},
}
const sentAt = '2026-09-26T00:00:00Z'
const firstTokenAt = '2026-09-26T00:00:01Z'
const endedAt = '2026-09-26T00:00:02Z'
function modelAccount(settlement: AssemblySettlement) {
  assert.ok('usage' in settlement.account)
  assert.deepEqual(judgeAccountValue('Usage', settlement.account.usage), { ok: true })
  assert.deepEqual(judgeAccountValue('Cost', settlement.account.cost), { ok: true })
  assert.deepEqual(judgeAccountValue('TrimSummary', settlement.account.trims), { ok: true })
  return settlement.account
}
function responseBase(settlement: AssemblySettlement) {
  const account = modelAccount(settlement)
  return {
    id: 'response',
    call: { callId: 'model' },
    dispatch: 1,
    route,
    usage: account.usage,
    cost: account.cost,
    // These SA-only cases retain neither adapter projection/digest evidence nor upstream usage.
    inputCalibration: {
      requestInput: { kind: 'unavailable', reason: 'not_retained' },
      observedInput: { kind: 'unavailable', reason: 'missing_usage' },
      outputGroup: { kind: 'unavailable', reason: 'not_retained' },
    },
  }
}
function contentState() {
  return feed(model, [
    { t: 'open', index: 0, kind: 'text', fill: 'append', id: 'text', visibility: visible },
    { t: 'fill', index: 0, payload: 'delivered' },
  ])
}

// Expected blocks, byte counts and sums come from frozen SA3 S-9..S-16/examples, not state internals.
const cases: readonly { id: string; sources: readonly string[]; run(): void }[] = [
  {
    id: 'w6.stream.duplicate-parameters-versus-outer-text',
    sources: [
      'capability.stream-assembly/v3#S-10',
      'capability.stream-assembly/v3#S-11',
      'data.content-blocks/v3#S-24',
      'data.arrival-events/v2#S-29',
    ],
    run() {
      const raw = '{"x":1,"\\u0078":2}'
      let state = callState(raw)
      const before = snapshot(state)
      assert.deepEqual(before.blocks[0], {
        index: 0,
        closed: false,
        opened: {
          kind: 'tool_call',
          fill: 'append',
          id: 'call-block',
          visibility: visible,
          head: { callId: 'call', tool: 'read_file' },
        },
        content: raw,
      })
      state = ok(accept(state, { t: 'close', index: 0 }))
      const sealed = snapshot(state).blocks[0]
      assert.ok(sealed?.closed)
      assert.deepEqual(sealed.block, {
        kind: 'tool_call',
        id: 'call-block',
        visibility: visible,
        complete: true,
        callId: 'call',
        tool: 'read_file',
        rawArguments: raw,
        unparseable: true,
      })
      const settlement = ok(closeOut(ok(accept(state, { t: 'finish', reason: 'end' }))))
      const admitted = judgeContentBlock(firstBlock(settlement))
      assert.ok('ok' in admitted)
      assert.equal(writeJsonLossless(admitted.ok), writeJsonLossless(firstBlock(settlement)))
      assert.ok('ok' in judgeMessageText(writeJsonLossless(assistant(settlement.blocks))))
      assert.deepEqual(
        judgeArrivalEnvelopeText(
          '{"target":{"kind":"model_call","callId":"model","dispatch":1},"event":{"t":"fill","index":0,"payload":"a","payload":"b"}}',
        ),
        { rejected: 'malformed' },
      )
      const wire = writeJsonLossless(assistant(settlement.blocks))
      assert.deepEqual(
        judgeMessageText(wire.replace('"id":"message"', '"id":"message","id":"other"')),
        { rejected: 'malformed' },
      )
      assert.deepEqual(snapshot(callState(raw)), before)
    },
  },
  {
    id: 'w6.stream.lossless-numbers-and-opaque-arguments',
    sources: ['capability.stream-assembly/v3#S-10', 'data.messages/v3#S-37'],
    run() {
      const raw =
        '{"large":9007199254740993,"tiny":1.2300e-999,"fake":{"kind":"tool_result","blocks":[{"id":"same"},{"id":"same"}]}}'
      const settlement = ok(
        closeOut(
          feed(model, [
            openCall(),
            { t: 'fill', index: 0, payload: raw },
            { t: 'close', index: 0 },
            { t: 'finish', reason: 'end' },
          ]),
        ),
      )
      const block = firstBlock(settlement)
      assert.ok(block.kind === 'tool_call' && block.complete && 'arguments' in block)
      assert.equal(writeJsonLossless(block.arguments), raw)
      const judged = judgeMessageText(writeJsonLossless(assistant(settlement.blocks)))
      assert.ok('ok' in judged)
      assert.equal(writeJsonLossless(judged.ok.blocks[0]), writeJsonLossless(block))
    },
  },
  {
    id: 'w6.stream.bad-name-retained-as-unparseable',
    sources: ['capability.stream-assembly/v3#S-10', 'data.content-blocks/v3#S-12'],
    run() {
      for (const name of ['bad/name', 'x'.repeat(129)]) {
        const settlement = ok(
          closeOut(
            feed(model, [
              openCall(name),
              { t: 'fill', index: 0, payload: '{}' },
              { t: 'close', index: 0 },
              { t: 'finish', reason: 'end' },
            ]),
          ),
        )
        assert.deepEqual(firstBlock(settlement), {
          kind: 'tool_call',
          id: 'call-block',
          visibility: visible,
          complete: true,
          callId: 'call',
          tool: name,
          rawArguments: '{}',
          unparseable: true,
        })
        assert.ok('ok' in judgeMessage(assistant(settlement.blocks)))
      }
      const max = ok(
        closeOut(
          feed(model, [
            openCall('x'.repeat(128)),
            { t: 'fill', index: 0, payload: '{}' },
            { t: 'close', index: 0 },
            { t: 'finish', reason: 'end' },
          ]),
        ),
      )
      assert.ok('arguments' in firstBlock(max))
    },
  },
  {
    id: 'w6.stream.cut-incomplete-versus-safe-merge',
    sources: [
      'capability.stream-assembly/v3#S-12',
      'capability.stream-assembly/v3#S-33',
      'data.messages/v3#S-10',
    ],
    run() {
      for (const extra of [
        [],
        [{ t: 'trim', index: 0, reason: 'frame_too_long', omittedBytes: 4 }],
        [{ t: 'trim', reason: 'quota_exhausted', omittedBytes: 4 }],
      ]) {
        const state = callState('{"x":1}', 'read_file', extra)
        const closed = extra.length ? ok(accept(state, { t: 'close', index: 0 })) : state
        const settlement = ok(closeOut(ok(accept(closed, { t: 'finish', reason: 'max_tokens' }))))
        const block = firstBlock(settlement)
        assert.ok(block.kind === 'tool_call' && !block.complete)
        assert.equal(block.rawArguments, '{"x":1}')
        assert.deepEqual(block.visibility, { toHuman: false, toModel: false })
        assert.equal(Object.hasOwn(block, 'arguments'), false)
        assert.ok('ok' in judgeMessage(assistant(settlement.blocks, 'truncated_at_limit')))
        assert.deepEqual(judgeMessage(assistant(settlement.blocks)), { rejected: 'malformed' })
      }
      const merged = callState('{"x":1}', 'read_file', [
        { t: 'trim', reason: 'rate_merged', merged: 1 },
        { t: 'close', index: 0 },
        { t: 'trim', reason: 'rejected', omittedBytes: 2 },
        { t: 'finish', reason: 'end' },
      ])
      const block = firstBlock(ok(closeOut(merged)))
      assert.ok(block.kind === 'tool_call' && block.complete && 'arguments' in block)
    },
  },
  {
    id: 'w6.stream.decoded-voice-split-invariance',
    sources: ['data.arrival-events/v2#S-19', 'capability.stream-assembly/v3#S-27'],
    run() {
      const voice = {
        kind: 'voice',
        id: 'voice',
        visibility: visible,
        mediaType: 'audio/wav',
        data: { inline: 'AQID' },
      }
      const opened = {
        t: 'open',
        index: 0,
        kind: 'voice',
        fill: 'append',
        id: 'voice',
        visibility: visible,
        head: { mediaType: 'audio/wav' },
      }
      const split = feed(model, [
        opened,
        { t: 'fill', index: 0, payload: 'AQ==' },
        { t: 'fill', index: 0, payload: 'AgM=' },
      ])
      const current = snapshot(split).blocks[0]
      assert.ok(current && !current.closed)
      assert.equal(current.content, 'AQID')
      assert.deepEqual([...Buffer.from(String(current.content), 'base64')], [1, 2, 3])
      reject(split, { t: 'fill', index: 0, payload: 'AQ==AgM=' }, 'payload_kind_mismatch')
      const settlement = ok(
        closeOut(
          ok(
            accept(ok(accept(split, { t: 'close', index: 0, block: voice })), {
              t: 'finish',
              reason: 'end',
            }),
          ),
        ),
      )
      const one = ok(
        closeOut(
          feed(model, [
            opened,
            { t: 'fill', index: 0, payload: 'AQID' },
            { t: 'close', index: 0, block: voice },
            { t: 'finish', reason: 'end' },
          ]),
        ),
      )
      assert.deepEqual(settlement.blocks, one.blocks)
      assert.deepEqual(settlement.blocks, [voice])
      assert.ok('ok' in judgeMessage(assistant(settlement.blocks)))
    },
  },
  {
    id: 'w6.stream.tool-frame-replace-and-account',
    sources: [
      'capability.stream-assembly/v3#S-31',
      'capability.stream-assembly/v3#S-13',
      'capability.stream-assembly/v3/examples#2',
    ],
    run() {
      const image = (key: string) => ({
        kind: 'image',
        id: 'shot',
        visibility: frameVisible,
        mediaType: 'image/png',
        data: { storage: 'attachments', key, mediaType: 'image/png' },
      })
      const state = feed(tool, [
        { t: 'open', index: 0, kind: 'text', fill: 'append', id: 'log', visibility: frameVisible },
        { t: 'fill', index: 0, payload: 'a\n' },
        {
          t: 'open',
          index: 2,
          kind: 'image',
          fill: 'replace',
          id: 'shot',
          visibility: frameVisible,
          head: { mediaType: 'image/png' },
        },
        { t: 'fill', index: 0, payload: 'b\nc\n' },
        { t: 'trim', index: 0, reason: 'rate_merged', merged: 1 },
        { t: 'fill', index: 2, payload: image('old') },
        { t: 'fill', index: 2, payload: image('new') },
      ])
      const progress = snapshot(state)
      numberEquals(progress.position, 7)
      numberEquals(progress.firstContentAt, 2)
      const settlement = ok(
        closeOut(
          ok(
            accept(
              ok(
                accept(ok(accept(state, { t: 'close', index: 2, block: image('new') })), {
                  t: 'close',
                  index: 0,
                  block: text('log', 'a\nb\nc\n', frameVisible),
                }),
              ),
              { t: 'finish', reason: 'end' },
            ),
          ),
        ),
      )
      assert.deepEqual(settlement.blocks, [text('log', 'a\nb\nc\n', frameVisible), image('new')])
      assert.ok('frames' in settlement.account)
      numberEquals(
        settlement.account.frames.emitted,
        negativeControl ? 10 : 9,
        'SA3 S-13: accepted eight frames + one merged frame = 9',
      )
      trimsEqual(settlement.account.frames.trims, {
        ...zeroTrims,
        merged: 1,
        byReason: { ...zeroTrims.byReason, rate_merged: 1 },
      })
      assert.deepEqual(judgeAccountValue('FrameAccount', settlement.account.frames), { ok: true })
      assert.deepEqual(
        judgeAccountValue('ToolCallAccount', {
          callId: 'call',
          initiator: { organization: 'org_A', account: 'account' },
          externalEffect: 'confirmed',
          cost: { total_usd: 0, items: [] },
          frames: settlement.account.frames,
          wallClock: { startedAt: sentAt, endedAt },
        }),
        { ok: true },
      )
      assert.ok(
        'ok' in
          judgeMessage({
            id: 'internal',
            type: 'tool_internal',
            callId: 'call',
            createdAt: at,
            ending: 'complete',
            blocks: settlement.blocks,
          }),
      )
      const interrupted = ok(closeOut(ok(accept(state, { t: 'finish', reason: 'interrupted' }))))
      assert.deepEqual(interrupted.blocks, settlement.blocks)
      assert.ok('frames' in interrupted.account)
      numberEquals(interrupted.account.frames.emitted, 7)
      assert.ok(
        'ok' in
          judgeMessage({
            id: 'internal',
            type: 'tool_internal',
            callId: 'call',
            createdAt: at,
            ending: 'interrupted',
            blocks: interrupted.blocks,
          }),
      )
      const lost = ok(abandon(state))
      assert.deepEqual(lost.blocks, settlement.blocks)
      assert.ok(
        'ok' in
          judgeMessage({
            id: 'internal',
            type: 'tool_internal',
            callId: 'call',
            createdAt: at,
            ending: 'lost',
            blocks: lost.blocks,
          }),
      )
    },
  },
  {
    id: 'w6.stream.trim-pairing-and-frame-formulas',
    sources: ['capability.stream-assembly/v3#S-14', 'data.call-accounts/v2#S-15'],
    run() {
      const state = feed(tool, [
        { t: 'open', index: 0, kind: 'text', fill: 'append', id: 'log', visibility: frameVisible },
        { t: 'trim', reason: 'frame_too_long', omittedBytes: 3 },
        { t: 'trim', reason: 'rejected', omittedBytes: 2 },
        { t: 'trim', reason: 'frame_too_long', omittedBytes: 5 },
        { t: 'fill', index: 0, payload: 'x' },
        { t: 'trim', reason: 'rejected', omittedBytes: 7 },
        { t: 'trim', reason: 'rate_merged', merged: 2 },
        { t: 'trim', reason: 'quota_exhausted', omittedBytes: 11 },
        { t: 'finish', reason: 'interrupted' },
      ])
      const settlement = ok(closeOut(state))
      assert.ok('frames' in settlement.account)
      const frames = settlement.account.frames
      numberEquals(frames.emitted, 7)
      trimsEqual(frames.trims, {
        merged: 2,
        cut: 3,
        omittedBytes: 28,
        byReason: { rate_merged: 2, frame_too_long: 1, quota_exhausted: 1, rejected: 2 },
      })
      assert.deepEqual(judgeAccountValue('FrameAccount', frames), { ok: true })
      assert.ok(
        ExactDecimal.from(frames.trims.merged)
          .add(ExactDecimal.from(frames.trims.cut))
          .add(ExactDecimal.from(frames.trims.byReason.frame_too_long))
          .compare(ExactDecimal.from(frames.emitted)) <= 0,
      )
      assert.equal(
        ExactDecimal.from(frames.trims.cut).compare(
          ExactDecimal.from(frames.trims.byReason.quota_exhausted).add(
            ExactDecimal.from(frames.trims.byReason.rejected),
          ),
        ),
        0,
      )
    },
  },
  {
    id: 'w6.stream.reported-and-unknown-accounts',
    sources: ['capability.stream-assembly/v3#S-13', 'data.call-accounts/v2#S-20'],
    run() {
      const unknown = ok(abandon(ok(start(model))))
      assert.deepEqual(unknown.account, {
        usage: unknownUsage,
        cost: unknownCost,
        trims: zeroTrims,
      })
      const usage: Usage = {
        input_tokens: 900,
        output_tokens: 40,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      }
      const parsedCost = read('{"cost_usd":0.0012000,"source":"upstream_usage"}')
      assert.deepEqual(judgeAccountValue('Cost', parsedCost), { ok: true })
      const event = { t: 'account', usage, cost: parsedCost }
      const state = feed(model, [event])
      reject(state, event, 'account_duplicate')
      const settled = ok(abandon(state))
      const account = modelAccount(settled)
      assert.deepEqual(account.usage, usage)
      assert.equal(
        writeJsonLossless(account.cost),
        '{"cost_usd":0.0012000,"source":"upstream_usage"}',
      )
      const group = prepareAccountGroup({
        models: [
          { responseId: 'known', cost: account.cost, usage: account.usage },
          { responseId: 'unknown', cost: unknownCost, usage: unknownUsage },
        ],
        tools: [],
        corrections: [],
      })
      assert.ok('ok' in group)
      const sum = summarize(group.ok)
      assert.ok(!('failed' in sum))
      assert.equal(sum.knownSum.compare(ExactDecimal.from(0.0012)), 0)
      assert.equal(sum.unknownCount, 1)
      reject(ok(start(tool)), event, 'malformed')
      const clean = ok(start(model))
      reject(
        clean,
        { t: 'account', usage, cost: { cost_usd: -1, source: 'upstream_usage' } },
        'negative_amount',
      )
      reject(
        clean,
        { t: 'account', usage: { ...unknownUsage, input_tokens: 0 }, cost: unknownCost },
        'unknown_with_source',
      )
      assert.deepEqual(modelAccount(ok(abandon(clean))).usage, unknownUsage)
      const zeroUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      }
      const zero = ok(
        closeOut(
          feed(model, [
            { t: 'account', usage: zeroUsage, cost: { cost_usd: 0, source: 'upstream_usage' } },
            { t: 'finish', reason: 'end' },
          ]),
        ),
      )
      const zeroAccount = modelAccount(zero)
      assert.deepEqual(zeroAccount.usage, zeroUsage)
      numberEquals(
        zeroAccount.cost.cost_usd === 'unknown' ? undefined : zeroAccount.cost.cost_usd,
        0,
      )
      const noFrames = ok(closeOut(feed(tool, [{ t: 'finish', reason: 'end' }])))
      assert.deepEqual(noFrames.blocks, [])
      assert.ok('frames' in noFrames.account)
      numberEquals(noFrames.account.frames.emitted, 0)
      trimsEqual(noFrames.account.frames.trims, zeroTrims)
    },
  },
  {
    id: 'w6.stream.refusal-priority-and-historical-state',
    sources: [
      'capability.stream-assembly/v3#S-25',
      'capability.stream-assembly/v3#S-26',
      'examples#5',
    ],
    run() {
      const state = contentState()
      const before = snapshot(state)
      reject(state, { t: 'fill', index: 9, payload: 'x' }, 'block_not_open')
      reject(state, { ...openCall(), index: 0 }, 'index_reused')
      reject(
        state,
        {
          t: 'open',
          index: 0,
          kind: 'voice',
          fill: 'append',
          id: 'bad',
          visibility: visible,
          head: { mediaType: 'image/png' },
        },
        'head_modality_mismatch',
      )
      reject(state, { t: 'future' }, 'event_unknown')
      const closed = ok(accept(state, { t: 'close', index: 0, block: text('text', 'delivered') }))
      reject(closed, { t: 'fill', index: 0, payload: 'late' }, 'block_already_closed')
      reject(
        closed,
        { t: 'close', index: 0, block: text('text', 'delivered') },
        'block_already_closed',
      )
      const higher = feed(model, [
        { t: 'open', index: 3, kind: 'text', fill: 'append', id: 'higher', visibility: visible },
      ])
      reject(
        higher,
        { t: 'open', index: 1, kind: 'text', fill: 'append', id: 'lower', visibility: visible },
        'index_not_monotonic',
      )
      const finished = ok(accept(state, { t: 'finish', reason: 'end' }))
      reject(finished, { t: 'fill', index: 0, payload: 'late' }, 'event_after_finish')
      reject(finished, { t: 'trim', reason: 'rejected', omittedBytes: 1 }, 'event_after_finish')
      reject(
        finished,
        { t: 'account', usage: unknownUsage, cost: unknownCost },
        'event_after_finish',
      )
      reject(finished, { t: 'future' }, 'event_unknown')
      assert.deepEqual(abandon(finished), { rejected: 'event_after_finish' })
      assert.deepEqual(snapshot(state), before)
      assert.deepEqual(closeOut(state), { rejected: 'stream_not_finished' })
    },
  },
  {
    id: 'w6.stream.snapshot-value-and-branching',
    sources: [
      'capability.stream-assembly/v3#S-4',
      'capability.stream-assembly/v3#S-7',
      'capability.stream-assembly/v3#S-16',
    ],
    run() {
      const state = contentState()
      const view = snapshot(state)
      const original = writeJsonLossless(view)
      const left = ok(accept(state, { t: 'fill', index: 0, payload: ' left' }))
      const right = ok(accept(state, { t: 'fill', index: 0, payload: ' right' }))
      assert.equal(writeJsonLossless(view), original)
      assert.equal(Reflect.set(view, 'position', 999), false)
      assert.equal(Reflect.set(view.blocks, '0', null), false)
      const nested = view.blocks[0]
      assert.ok(nested && !nested.closed)
      assert.equal(Reflect.set(nested.opened.visibility, 'toHuman', false), false)
      assert.equal(writeJsonLossless(snapshot(state)), original)
      const l = snapshot(left).blocks[0],
        r = snapshot(right).blocks[0]
      assert.ok(l && !l.closed && r && !r.closed)
      assert.equal(l.content, 'delivered left')
      assert.equal(r.content, 'delivered right')
      numberEquals(snapshot(left).firstContentAt, 2)
      numberEquals(snapshot(right).firstContentAt, 2)
      const emptyOpen = feed(model, [
        { t: 'open', index: 0, kind: 'text', fill: 'replace', id: 'empty', visibility: visible },
      ])
      const emptyFill = ok(accept(emptyOpen, { t: 'fill', index: 0, payload: '' }))
      assert.equal(Object.hasOwn(snapshot(emptyFill), 'firstContentAt'), false)
      const nonemptyClose = ok(
        accept(emptyOpen, { t: 'close', index: 0, block: text('empty', 'now') }),
      )
      numberEquals(snapshot(nonemptyClose).firstContentAt, 2)
    },
  },
  {
    id: 'w6.stream.nested-message-identity-boundary',
    sources: ['data.messages/v3#S-39', 'data.arrival-events/v2#S-24'],
    run() {
      const image = (id: string, child: string) => ({
        kind: 'image',
        id,
        visibility: visible,
        mediaType: 'image/png',
        data: { inline: 'AQ==' },
        transcript: 'leaf',
        renderings: [{ producedBy: 'system', blocks: [text(child, 'leaf')] }],
      })
      for (const duplicate of ['none', 'nested', 'outer']) {
        const secondId = duplicate === 'outer' ? 'image1' : 'image2'
        const state = feed(model, [
          {
            t: 'open',
            index: 0,
            kind: 'image',
            fill: 'replace',
            id: 'image1',
            visibility: visible,
            head: { mediaType: 'image/png' },
          },
          {
            t: 'open',
            index: 1,
            kind: 'image',
            fill: 'replace',
            id: secondId,
            visibility: visible,
            head: { mediaType: 'image/png' },
          },
          {
            t: 'close',
            index: 1,
            block: image(secondId, duplicate === 'nested' ? 'child1' : 'child2'),
          },
          { t: 'close', index: 0, block: image('image1', 'child1') },
          { t: 'finish', reason: 'end' },
        ])
        const settled = ok(closeOut(state))
        assert.deepEqual(
          settled.blocks.map(b => b.id),
          ['image1', secondId],
        )
        for (const block of settled.blocks) {
          const admitted = judgeContentBlock(block)
          assert.ok('ok' in admitted)
          assert.equal(writeJsonLossless(admitted.ok), writeJsonLossless(block))
        }
        if (duplicate !== 'none')
          assert.deepEqual(judgeMessage(assistant(settled.blocks)), {
            rejected: 'block_id_duplicate',
          })
        else assert.ok('ok' in judgeMessage(assistant(settled.blocks)))
      }
    },
  },
  {
    id: 'w6.stream.model-settlement-shapes',
    sources: [
      'data.model-response/v3#S-13',
      'data.messages/v3#S-10',
      'capability.stream-assembly/v3#S-8',
    ],
    run() {
      const complete = ok(closeOut(ok(accept(contentState(), { t: 'finish', reason: 'end' }))))
      const good = {
        ...responseBase(complete),
        outcome: 'complete',
        reply: assistant(complete.blocks),
        replyDisposition: 'persisted',
        timing: { sentAt, firstTokenAt, endedAt },
      }
      assert.deepEqual(judgeModelResponse(good), { ok: true })
      const late = { ...good, call: { callId: 'model', runId: 'run' }, attemptId: 1, late: true }
      assert.deepEqual(judgeModelResponse(late), { ok: true })
      assert.deepEqual(judgeModelResponse({ ...good, late: true }), { rejected: 'malformed' })
      assert.ok(
        'ok' in
          judgeModelInvocationRecord({
            kind: 'model_call_dispatched',
            call: good.call.callId,
            dispatch: good.dispatch,
            response: good.id,
            ...route,
          }),
      )
      assert.deepEqual(judgeModelResponse({ ...good, delivered: complete.blocks }), {
        rejected: 'reply_and_delivered',
      })
      assert.deepEqual(judgeModelResponse({ ...good, failure: { cause: 'withdrawn' } }), {
        rejected: 'failure_on_success',
      })
      const cut = ok(
        closeOut(ok(accept(callState('{"x":'), { t: 'finish', reason: 'max_tokens' }))),
      )
      assert.deepEqual(
        judgeModelResponse({
          ...responseBase(cut),
          outcome: 'truncated',
          reply: assistant(cut.blocks, 'truncated_at_limit'),
          replyDisposition: 'persisted',
          timing: { sentAt, firstTokenAt, endedAt },
        }),
        { ok: true },
      )
      const interrupted = ok(
        closeOut(ok(accept(contentState(), { t: 'finish', reason: 'interrupted' }))),
      )
      assert.deepEqual(
        judgeModelResponse({
          ...responseBase(interrupted),
          outcome: 'interrupted',
          initiator: 'user',
          reply: assistant(interrupted.blocks, 'interrupted_by_user'),
          replyDisposition: 'persisted',
          timing: { sentAt, firstTokenAt, endedAt },
        }),
        { ok: true },
      )
      const empty = ok(closeOut(feed(model, [{ t: 'finish', reason: 'interrupted' }])))
      assert.deepEqual(
        judgeModelResponse({
          ...responseBase(empty),
          outcome: 'interrupted',
          initiator: 'user',
          timing: { sentAt, endedAt },
        }),
        { ok: true },
      )
      const runtimeLost = ok(abandon(contentState()))
      assert.deepEqual(
        judgeModelResponse({
          ...responseBase(runtimeLost),
          outcome: 'interrupted',
          initiator: 'runtime_lost',
          delivered: runtimeLost.blocks,
          timing: { sentAt, firstTokenAt, endedAt },
        }),
        { ok: true },
      )
      assert.deepEqual(
        judgeModelInvocationRecord({
          kind: 'model_call_opened',
          call: 'model',
          dispatch: 1,
          firstTokenAt,
        }),
        { ok: { kind: 'model_call_opened', call: 'model', dispatch: 1, firstTokenAt } },
      )
      assert.ok(
        'ok' in
          judgeModelInvocationRecord({
            kind: 'model_call_ended',
            call: 'model',
            ending: 'interrupted',
            initiator: 'user',
          }),
      )
    },
  },
  {
    id: 'w6.stream.lost-failure-delivered-and-in-band',
    sources: [
      'data.model-response/v3#S-13',
      'data.model-response/v3#S-15',
      'data.model-response/v3#S-27',
      'capability.stream-assembly/v3#S-22',
    ],
    run() {
      const early = ok(
        abandon(ok(start(model)), { cause: 'upstream_unavailable', statusCode: 429, inBand: true }),
      )
      assert.deepEqual(early.blocks, [])
      assert.deepEqual(early.ending, {
        reason: 'lost',
        error: { cause: 'upstream_unavailable', statusCode: 429, inBand: true },
      })
      const earlyResponse = {
        ...responseBase(early),
        outcome: 'failed',
        failure: early.ending.error,
        timing: { sentAt, endedAt },
      }
      assert.deepEqual(judgeModelResponse(earlyResponse), { ok: true })
      const mid = ok(
        abandon(contentState(), { cause: 'interrupted_mid_reply', statusCode: 529, inBand: true }),
      )
      const response = {
        ...responseBase(mid),
        outcome: 'failed',
        failure: mid.ending.error,
        delivered: mid.blocks,
        timing: { sentAt, firstTokenAt, endedAt },
      }
      assert.deepEqual(judgeModelResponse(response), { ok: true })
      assert.deepEqual(judgeModelResponse({ ...response, reply: assistant(mid.blocks) }), {
        rejected: 'reply_on_failure',
      })
      assert.deepEqual(
        judgeModelResponse({
          ...earlyResponse,
          failure: { cause: 'upstream_unavailable', inBand: true },
        }),
        { rejected: 'malformed' },
      )
      assert.equal(Object.hasOwn(mid, 'reply'), false)
      assert.deepEqual(modelAccount(mid).usage, unknownUsage)
    },
  },
]

const resolution = []
for (const name of [
  'content-blocks',
  'call-accounts',
  'arrival-events',
  'stream-assembly',
  'messages',
  'model-response',
]) {
  const url = new URL(import.meta.resolve('@omne-harness-lite/' + name))
  if (packedConsumer) {
    assert.ok(
      fileURLToPath(url).startsWith(dirname(fileURLToPath(import.meta.url)) + '/node_modules/'),
    )
    assert.ok(url.pathname.endsWith('/node_modules/@omne-harness-lite/' + name + '/dist/index.js'))
  } else assert.ok(url.pathname.endsWith('/packages/core/' + name + '/dist/index.js'))
  resolution.push({
    name,
    file: fileURLToPath(url),
    sha256: createHash('sha256')
      .update(await readFile(url))
      .digest('hex'),
  })
}
const results = []
for (const item of cases) {
  try {
    item.run()
    results.push({ id: item.id, sources: item.sources, status: 'passed' })
  } catch (error) {
    results.push({
      id: item.id,
      sources: item.sources,
      status: 'failed',
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
    })
  }
}
process.stdout.write(
  JSON.stringify(
    {
      specEpoch: 3,
      packedConsumer,
      negativeControl,
      nodeVersion: process.version,
      consumerArtifact: {
        file: fileURLToPath(import.meta.url),
        sha256: createHash('sha256')
          .update(await readFile(fileURLToPath(import.meta.url)))
          .digest('hex'),
      },
      resolution,
      cases: results,
    },
    null,
    2,
  ) + '\n',
)
if (results.some(item => item.status === 'failed')) process.exitCode = 1
