import { describe, expect, it } from 'vitest'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  inspectSettlementMembers,
  modelLogJsonEqual,
  captureModelLogValue,
  type InspectSettlementMembersInput,
} from '@omne-harness-lite/model-request-runtime'
import type { LogEntry } from '@omne-harness-lite/session-log'
import {
  anchors,
  batch,
  capture,
  dispatched,
  durable,
  jsonObject,
  located,
  opened,
  prepare,
  reply,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'

export function readInput(value: JsonObject = response): InspectSettlementMembersInput {
  const actual = durable(value)
  return {
    mode: 'read',
    session,
    tenant,
    prefix: actual.prefix,
    anchors: actual.anchors,
    target: { call: 'call', dispatch: 1, response: 'response' },
    current: { messageId: 'losing-message', disposition: 'persisted' },
  }
}
function changeResponse(
  input: InspectSettlementMembersInput,
  change: (value: JsonObject) => JsonObject,
): InspectSettlementMembersInput {
  return {
    ...input,
    prefix: {
      ...input.prefix,
      entries: input.prefix.entries.map(entry => {
        const wrapper = jsonObject(entry.payload)
        return wrapper.category === 'response'
          ? { ...entry, payload: { ...wrapper, value: change(jsonObject(wrapper.value)) } }
          : entry
      }),
    },
  }
}
function originalInput(): InspectSettlementMembersInput {
  return readInput()
}
function inputWithAnchors(
  value: JsonObject,
  opening: string | null,
  interruption: JsonObject | null = null,
  originalDispatched: JsonObject = dispatched,
): InspectSettlementMembersInput {
  const d = located(prepare('record', originalDispatched, { kind: 'record' }), 1)
  const entries: LogEntry[] = [d]
  const o =
    opening === null
      ? null
      : located(prepare('record', { ...opened, firstTokenAt: opening }, { kind: 'record' }), 2)
  if (o !== null) entries.push(o)
  const i =
    interruption === null
      ? null
      : located(prepare('record', interruption, { kind: 'record' }), entries.length + 1)
  if (i !== null) entries.push(i)
  for (const member of batch(value)) entries.push(located(member, entries.length + 1))
  return {
    mode: 'read',
    session,
    tenant,
    prefix: { entries, tail: entries.length },
    anchors: { dispatched: d, opened: o, intent: i },
    target: { call: 'call', dispatch: 1, response: 'response' },
    current: null,
  }
}
function expectRefused(input: InspectSettlementMembersInput) {
  const result = inspectSettlementMembers(input)
  expect(result).not.toHaveProperty('completeMembers')
  expect(result).not.toHaveProperty('absent')
}
describe('D088 complete association prior to production gates', () => {
  it('accepts write-before-position structure without requiring a candidate R in the prefix', () => {
    const original = anchors()
    const result = inspectSettlementMembers({
      mode: 'write',
      session,
      tenant,
      prefix: { entries: original.entries, tail: 2 },
      anchors: original,
      target: { call: 'call', dispatch: 1, response: 'response' },
      current: { messageId: 'winner-message', disposition: 'persisted' },
      candidates: batch(),
    })
    expect(result).toHaveProperty('completeMembers')
    if (!('completeMembers' in result)) throw new Error('expected complete write members')
    expect(result.completeMembers.mode).toBe('write')
    expect(result.completeMembers.disposition).toBe('same')
    expect(result.completeMembers.entries).toHaveLength(2)
    for (const entry of result.completeMembers.entries) expect(entry).not.toHaveProperty('position')
    expect(writeJsonLossless(result.completeMembers.response.value)).toBe(
      writeJsonLossless(response),
    )
    for (const entry of batch()) expect(entry).not.toHaveProperty('position')
  })
  it('retains the winner regardless of losing candidate identity or unrelated occupancy', () => {
    const input = originalInput()
    const unrelated = located(
      prepare(
        'message',
        { id: 'losing-message', type: 'user', createdAt: '2026-09-27T00:00:04Z', blocks: [] },
        { kind: 'message' },
      ),
      5,
    )
    const occupied = {
      ...input,
      prefix: { entries: [...input.prefix.entries, unrelated], tail: 5 },
    }
    expect(inspectSettlementMembers(input)).toHaveProperty('completeMembers')
    expect(inspectSettlementMembers(occupied)).toHaveProperty('completeMembers')
    const winner = inspectSettlementMembers({
      ...occupied,
      mode: 'write',
      candidates: batch({
        ...response,
        reply: { ...reply, id: 'losing-message', blocks: [] },
        replyDisposition: { consumed: { by: 'side_query' } },
      }),
      current: { messageId: 'losing-message', disposition: { consumed: { by: 'side_query' } } },
    })
    if (!('completeMembers' in winner)) throw new Error('expected lawful original')
    expect(winner.completeMembers.mode).toBe('read')
    expect(winner.completeMembers.disposition).toBe('firstWinner')
    expect(winner.completeMembers.message?.message?.id).toBe('winner-message')
    expect(writeJsonLossless(winner.completeMembers.response.value)).toBe(
      writeJsonLossless(response),
    )
    expect(
      winner.completeMembers.entries.map(entry => ('position' in entry ? entry.position : null)),
    ).toEqual([3, 4])
    expect(writeJsonLossless(jsonObject(input.prefix.entries[3]?.payload).value)).toContain(
      '0.0000000000000000000000000310',
    )
  })
  it('only checks stable current MessageId occupancy after no original response exists', () => {
    const original = anchors()
    const unrelated = located(
      prepare(
        'message',
        { id: 'losing-message', type: 'user', createdAt: '2026-09-27T00:00:04Z', blocks: [] },
        { kind: 'message' },
      ),
      3,
    )
    const input: InspectSettlementMembersInput = {
      mode: 'read',
      session,
      tenant,
      prefix: { entries: original.entries, tail: 2 },
      anchors: original,
      target: { call: 'call', dispatch: 1, response: 'response' },
      current: { messageId: 'losing-message', disposition: 'persisted' },
    }
    expect(inspectSettlementMembers(input)).toEqual({ absent: true })
    expect(
      inspectSettlementMembers({
        ...input,
        prefix: { entries: [...original.entries, unrelated], tail: 3 },
      }),
    ).toEqual({ inconsistent: true, reason: 'message_occupied' })
  })
  it('rejects each identity group and every D/R defect, not just key hit counts', () => {
    const input = originalInput()
    expectRefused({ ...input, session: 'another-session' })
    const otherTenant = parseTenantId({ organization: tenant.organization, account: 'different' })
    if (!('ok' in otherTenant)) throw new Error('fixture tenant')
    expectRefused({ ...input, tenant: otherTenant.ok })
    for (const change of [
      (value: JsonObject) => ({ ...value, id: 'different-response' }),
      (value: JsonObject) => ({ ...value, call: { callId: 'different-call' } }),
      (value: JsonObject) => ({ ...value, dispatch: new LosslessNumber('9007199254740993') }),
      (value: JsonObject) => ({
        ...value,
        call: { callId: 'call', runId: 'different-run' },
        attemptId: 1,
      }),
    ])
      expectRefused(changeResponse(input, change))
    for (const change of [
      (entry: LogEntry) => ({ ...entry, dedupeKey: 'forged-key' }),
      (entry: LogEntry) => ({ ...entry, readKeys: entry.readKeys.slice(1) }),
      (entry: LogEntry) => ({ ...entry, readKeys: [...entry.readKeys, 'extra'] }),
      (entry: LogEntry) => ({ ...entry, readKeys: [...entry.readKeys, ...entry.readKeys] }),
    ])
      expectRefused({
        ...input,
        prefix: {
          ...input.prefix,
          entries: input.prefix.entries.map((entry, index) =>
            index === 3 ? change(entry) : entry,
          ),
        },
      })
    expectRefused({ ...input, prefix: { ...input.prefix, tail: 5 } })
    expectRefused({
      ...input,
      prefix: {
        ...input.prefix,
        entries: input.prefix.entries.map((entry, index) =>
          index === 3 ? { ...entry, position: new LosslessNumber('9007199254740993') } : entry,
        ),
      },
    })
  })
  it('rejects all binding and original parameter disposition divergence', () => {
    const input = originalInput()
    for (const name of ['implementation', 'definition', 'configuration']) {
      expectRefused(
        changeResponse(input, value => {
          const route = jsonObject(value.route),
            adaptation = jsonObject(route.adaptation),
            snapshot = jsonObject(route.profileSnapshot)
          const changed = {
            ...adaptation,
            [name]: { ...jsonObject(adaptation[name]), revision: 'changed' },
          }
          return {
            ...value,
            route: {
              ...route,
              adaptation: changed,
              profileSnapshot: { ...snapshot, adaptation: changed },
            },
          }
        }),
      )
    }
    expectRefused(
      changeResponse(input, value => {
        const route = jsonObject(value.route),
          adaptation = jsonObject(route.adaptation),
          configuration = jsonObject(adaptation.configuration),
          snapshot = jsonObject(route.profileSnapshot)
        const changed = {
          ...adaptation,
          configuration: {
            ...configuration,
            values: { precise: new LosslessNumber('9007199254740992') },
          },
        }
        return {
          ...value,
          route: {
            ...route,
            adaptation: changed,
            profileSnapshot: { ...snapshot, adaptation: changed },
          },
        }
      }),
    )
    for (const [name, replacement] of [
      ['profile', { origin: 'official', routeName: 'changed' }],
      ['selectedBy', 'layer_lock'],
      ['provider', 'second'],
      [
        'credentialScope',
        { layer: 'tenant', tenant: { organization: tenant.organization, account: tenant.account } },
      ],
      ['parameters', { temperature: new LosslessNumber('0.7') }],
      ['parameterAdjustments', [{ name: 'temperature', requested: 0.7, sent: 0.4 }]],
      ['droppedParameters', ['retained']],
    ] satisfies readonly (readonly [string, JsonValue])[])
      expectRefused(
        changeResponse(input, value => ({
          ...value,
          route: { ...jsonObject(value.route), [name]: replacement },
        })),
      )
    expect(
      inspectSettlementMembers(
        changeResponse(input, value => ({
          ...value,
          route: {
            ...jsonObject(value.route),
            parameters: {
              temperature: 0.5,
              extra: { retained: { k: new LosslessNumber('9007199254740993e0') } },
            },
          },
        })),
      ),
    ).toHaveProperty('completeMembers')
  })
  it('requires the actual original opened and its raw timestamp before the response', () => {
    const input = originalInput()
    let executed = 0
    const hostileAnchor = {
      ...input.anchors.dispatched,
      get payload() {
        executed++
        return input.anchors.dispatched.payload
      },
    }
    expect(
      inspectSettlementMembers({
        ...input,
        anchors: { ...input.anchors, dispatched: hostileAnchor },
      }),
    ).toEqual({ inconsistent: true, reason: 'anchor' })
    expect(executed).toBe(0)
    expectRefused({ ...input, anchors: { ...input.anchors, opened: null } })
    expectRefused(
      changeResponse(input, value => ({
        ...value,
        timing: { ...jsonObject(value.timing), firstTokenAt: '2026-09-27T00:00:01.000Z' },
      })),
    )
    const absentOpened = {
      ...input,
      prefix: {
        entries: input.prefix.entries
          .filter((_, index) => index !== 1)
          .map((entry, index) => ({ ...entry, position: index + 1 })),
        tail: 3,
      },
      anchors: { ...input.anchors, opened: null },
    }
    expectRefused(absentOpened)
    expectRefused(
      changeResponse(input, value => ({ ...value, cost: { cost_usd: 0, source: 'none' } })),
    )
  })
  it('rejects partial/extra/pieced batches, foreign format and every full reply-field mismatch', () => {
    const input = originalInput()
    for (const keep of [
      [0, 1, 2],
      [0, 1, 3],
    ])
      expectRefused({
        ...input,
        prefix: {
          entries: input.prefix.entries
            .filter((_, index) => keep.includes(index))
            .map((entry, index) => ({ ...entry, position: index + 1 })),
          tail: 3,
        },
      })
    for (const [name, replacement] of [
      ['id', 'different-message'],
      ['ending', 'truncated_at_limit'],
      ['createdAt', '2026-09-27T00:00:03Z'],
      ['blocks', []],
      ['response', 'different-response'],
    ] satisfies readonly (readonly [string, JsonValue])[]) {
      expectRefused({
        ...input,
        prefix: {
          ...input.prefix,
          entries: input.prefix.entries.map((entry, index) =>
            index !== 2
              ? entry
              : {
                  ...entry,
                  payload: {
                    ...jsonObject(entry.payload),
                    value: { ...reply, [name]: replacement },
                  },
                },
          ),
        },
      })
    }
    expectRefused({
      ...input,
      prefix: {
        ...input.prefix,
        entries: input.prefix.entries.map((entry, index) =>
          index === 3
            ? { ...entry, payload: { ...jsonObject(entry.payload), format: 'mrr/2' } }
            : entry,
        ),
      },
    })
    const ordinary = located(
      prepare(
        'message',
        { id: 'ordinary', type: 'user', createdAt: '2026-09-27T00:00:04Z', blocks: [] },
        { kind: 'message' },
      ),
      3,
    )
    expectRefused({
      ...input,
      prefix: {
        entries: [
          ...input.prefix.entries.slice(0, 3),
          ordinary,
          ...input.prefix.entries.slice(3),
        ].map((entry, index) => ({ ...entry, position: index + 1 })),
        tail: 5,
      },
    })
    const duplicate = input.prefix.entries[3]
    if (duplicate === undefined) throw new Error('fixture response')
    expectRefused({
      ...input,
      prefix: { entries: [...input.prefix.entries, { ...duplicate, position: 5 }], tail: 5 },
    })
  })
  it('allows a different accounting attempt while keeping original attempt and G28 unavailable', () => {
    const shell = { tenant, run: 'run', attempt: 1 }
    const d = located(prepare('record', dispatched, { kind: 'record' }, shell), 1)
    const o = located(prepare('record', opened, { kind: 'record' }, shell), 2)
    const withRun: JsonObject = {
      ...response,
      call: { callId: 'call', runId: 'run' },
      attemptId: 1,
      late: true,
    }
    const captured = capture('response', withRun)
    const accounting = { tenant, run: 'run', attempt: 2 }
    const m = located(
      prepare('message', reply, { kind: 'persistedMessage', response: captured }, accounting),
      3,
    )
    const r = located(prepare('response', withRun, { kind: 'response' }, accounting), 4)
    const input: InspectSettlementMembersInput = {
      mode: 'read',
      session,
      tenant,
      prefix: { entries: [d, o, m, r], tail: 4 },
      anchors: { dispatched: d, opened: o, intent: null },
      target: { call: 'call', dispatch: 1, response: 'response' },
      current: null,
    }
    // The original complete batch is recognized from its durable values; a new
    // candidate consults the current Run source in the settlement coordinator.
    expect(inspectSettlementMembers(input)).toHaveProperty('completeMembers')
    expect(
      inspectSettlementMembers(
        changeResponse(input, value => ({
          ...value,
          timing: { ...jsonObject(value.timing), sentAt: '2026-09-27T00:00:01.0004Z' },
        })),
      ),
    ).toEqual({ inconsistent: true, reason: 'timing' })
    expectRefused(changeResponse(input, value => ({ ...value, attemptId: 2 })))
  })
  it('checks all legal outcome shapes and complete dispositions without inventing no-reply success', () => {
    for (const [outcome, ending, initiator] of [
      ['complete', 'complete', null],
      ['truncated', 'truncated_at_limit', null],
      ['interrupted', 'interrupted_by_user', 'user'],
    ] satisfies readonly (readonly [string, string, string | null])[])
      for (const disposition of [
        'persisted',
        { vetoed: { by: 'gate' } },
        { vetoed: { by: 'gate', reason: 'hold' } },
        { consumed: { by: 'compaction' } },
        { consumed: { by: 'side_query' } },
      ] satisfies readonly JsonValue[]) {
        const value: JsonObject = {
          ...response,
          outcome,
          reply: { ...reply, ending },
          replyDisposition: disposition,
          ...(initiator === null ? {} : { initiator }),
        }
        expect(
          inspectSettlementMembers(inputWithAnchors(value, '2026-09-27T00:00:01Z')),
        ).toHaveProperty('completeMembers')
      }
    const { reply: _reply, replyDisposition: _disposition, ...noReply } = response
    const delivered = reply.blocks
    if (delivered === undefined) throw new Error('fixture delivered blocks')
    for (const value of [
      { ...noReply, outcome: 'interrupted', initiator: 'runtime_lost' },
      { ...noReply, outcome: 'interrupted', initiator: 'run_cancelled', delivered },
      {
        ...noReply,
        outcome: 'failed',
        failure: { cause: 'interrupted_mid_reply', statusCode: 429 },
        delivered,
      },
    ] satisfies readonly JsonObject[])
      expect(
        inspectSettlementMembers(inputWithAnchors(value, '2026-09-27T00:00:01Z')),
      ).toHaveProperty('completeMembers')
    const unopened = {
      ...noReply,
      timing: { sentAt: '2026-09-27T00:00:00Z', endedAt: '2026-09-27T00:00:02Z' },
    }
    for (const value of [
      { ...unopened, outcome: 'interrupted', initiator: 'runtime_lost' },
      { ...unopened, outcome: 'failed', failure: { cause: 'upstream_unavailable' } },
    ] satisfies readonly JsonObject[])
      expect(inspectSettlementMembers(inputWithAnchors(value, null))).toHaveProperty(
        'completeMembers',
      )
  })
  it('uses the actual intent initiator and rejects mismatched original intent', () => {
    const value = {
      ...response,
      outcome: 'interrupted',
      initiator: 'user',
      reply: { ...reply, ending: 'interrupted_by_user' },
    }
    const intent = { kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' }
    expect(
      inspectSettlementMembers(inputWithAnchors(value, '2026-09-27T00:00:01Z', intent)),
    ).toHaveProperty('completeMembers')
    expect(
      inspectSettlementMembers(
        inputWithAnchors(value, '2026-09-27T00:00:01Z', { ...intent, initiator: 'run_cancelled' }),
      ),
    ).toEqual({ inconsistent: true, reason: 'intent' })
  })
  it('keeps absent reason different from an empty reason and obeys MR4 reception', () => {
    expect(
      modelLogJsonEqual({ vetoed: { by: 'gate' } }, { vetoed: { by: 'gate', reason: '' } }),
    ).toBe(false)
    expect(
      captureModelLogValue({
        category: 'response',
        input: {
          kind: 'value',
          value: { ...response, replyDisposition: { vetoed: { by: 'gate', reason: '' } } },
        },
      }),
    ).toEqual({ invalidValue: true, reason: 'value' })
    const input = readInput({ ...response, replyDisposition: { vetoed: { by: 'gate' } } })
    let executed = 0
    expect(
      inspectSettlementMembers({
        ...input,
        current: {
          messageId: 'winner-message',
          get disposition() {
            executed++
            return 'persisted' as const
          },
        },
      }),
    ).toEqual({ inconsistent: true, reason: 'input' })
    expect(executed).toBe(0)
    expect(
      inspectSettlementMembers({
        ...input,
        current: {
          messageId: 'winner-message',
          disposition: { vetoed: { by: 'gate', reason: '' } },
        },
      }),
    ).toEqual({ inconsistent: true, reason: 'input' })
  })
  it('applies original private key adjustments and omits extra only when all original items were dropped', () => {
    const original: JsonObject = {
      ...dispatched,
      parameters: { temperature: 0.7, extra: { 'extra.private': new LosslessNumber('1.00') } },
      parameterAdjustments: [
        {
          name: 'extra.private',
          requested: new LosslessNumber('1.00'),
          sent: new LosslessNumber('2.00'),
        },
      ],
    }
    const { droppedParameters: _drop, ...adjustedOriginal } = original
    const route = jsonObject(response.route)
    const { droppedParameters: _routeDrop, ...adjustedRoute } = route
    const adjusted: JsonObject = {
      ...response,
      route: {
        ...adjustedRoute,
        parameters: { temperature: 0.7, extra: { 'extra.private': new LosslessNumber('2e0') } },
        parameterAdjustments: adjustedOriginal.parameterAdjustments ?? null,
      },
    }
    expect(
      inspectSettlementMembers(
        inputWithAnchors(adjusted, '2026-09-27T00:00:01Z', null, adjustedOriginal),
      ),
    ).toHaveProperty('completeMembers')
    const { parameterAdjustments: _adjustments, ...droppedOriginal } = original
    const { parameterAdjustments: _routeAdjustments, ...droppedRoute } = route
    const dropRecord = { ...droppedOriginal, droppedParameters: ['extra.private'] }
    const dropped: JsonObject = {
      ...response,
      route: {
        ...droppedRoute,
        parameters: { temperature: 0.7 },
        droppedParameters: ['extra.private'],
      },
    }
    expect(
      inspectSettlementMembers(inputWithAnchors(dropped, '2026-09-27T00:00:01Z', null, dropRecord)),
    ).toHaveProperty('completeMembers')
    expectRefused(
      changeResponse(
        inputWithAnchors(dropped, '2026-09-27T00:00:01Z', null, dropRecord),
        value => ({
          ...value,
          route: { ...jsonObject(value.route), parameters: { temperature: 0.7, extra: {} } },
        }),
      ),
    )
  })
  it('compares all legal veto/consumed fields and keeps no-reply first winner separate from same disposition', () => {
    for (const [original, current, expected] of [
      [{ vetoed: { by: 'gate' } }, { vetoed: { by: 'gate' } }, 'same'],
      [{ vetoed: { by: 'gate' } }, { vetoed: { by: 'gate', reason: 'hold' } }, 'firstWinner'],
      [
        { vetoed: { by: 'gate', reason: 'hold' } },
        { vetoed: { by: 'other', reason: 'hold' } },
        'firstWinner',
      ],
      [
        { vetoed: { by: 'gate', reason: 'hold' } },
        { vetoed: { by: 'gate', reason: 'hold' } },
        'same',
      ],
      [{ consumed: { by: 'compaction' } }, { consumed: { by: 'side_query' } }, 'firstWinner'],
      [{ consumed: { by: 'side_query' } }, { consumed: { by: 'side_query' } }, 'same'],
    ] satisfies readonly (readonly [
      import('@omne-harness-lite/model-response').ReplyDisposition,
      import('@omne-harness-lite/model-response').ReplyDisposition,
      string,
    ])[]) {
      const input = readInput({ ...response, replyDisposition: original })
      const result = inspectSettlementMembers({
        ...input,
        current: { messageId: 'losing-message', disposition: current },
      })
      if (!('completeMembers' in result)) throw new Error('expected conditional legal members')
      expect(result.completeMembers.disposition).toBe(expected)
      expect(result.completeMembers.entries).toHaveLength(1)
      expect(result.completeMembers.message).toBeNull()
      expect(writeJsonLossless(result.completeMembers.response.value)).toBe(
        writeJsonLossless({ ...response, replyDisposition: original }),
      )
    }
    const { reply: _reply, replyDisposition: _disposition, ...noReply } = response
    const input = inputWithAnchors(
      { ...noReply, outcome: 'interrupted', initiator: 'runtime_lost' },
      '2026-09-27T00:00:01Z',
    )
    const result = inspectSettlementMembers({
      ...input,
      current: { messageId: null, disposition: null },
    })
    if (!('completeMembers' in result)) throw new Error('expected conditional no-reply members')
    expect(result.completeMembers.disposition).toBe('firstWinner')
    expect(result.completeMembers.message).toBeNull()
  })
  it('uses actual public D089 comparison on complete raw timing without millisecond quantization', () => {
    const common = '12345678901234567890'.repeat(2000)
    for (const [sentAt, firstTokenAt, endedAt, complete] of [
      ['2026-09-27T00:00:00.0004Z', '2026-09-27T00:00:00.0003Z', '2026-09-27T00:00:01Z', false],
      ['2026-09-27T00:00:00.0003Z', '2026-09-27T00:00:00.0004Z', '2026-09-27T00:00:01Z', true],
      [
        `2026-09-27T00:00:00.${common}2Z`,
        `2026-09-27T00:00:00.${common}1Z`,
        '2026-09-27T00:00:01Z',
        false,
      ],
      [
        `2026-09-27T00:00:00.${common}1Z`,
        `2026-09-27T00:00:00.${common}2Z`,
        '2026-09-27T00:00:01Z',
        true,
      ],
      ['2026-09-27T01:00:00+01:00', '2026-09-27T00:00:00.000Z', '2026-09-26T19:00:00-05:00', true],
      ['2026-09-27T00:00:00Z', '2026-09-27T00:00:01.0004Z', '2026-09-27T00:00:01.0003Z', false],
      ['0000-01-01T00:00:00+23:59', '0000-01-01T00:01:00+23:59', '0000-01-01T00:02:00+23:59', true],
      ['9999-12-31T23:57:59-23:59', '9999-12-31T23:58:59-23:59', '9999-12-31T23:59:59-23:59', true],
      ['2026-02-30T00:00:00Z', '2026-09-27T00:00:01Z', '2026-09-27T00:00:02Z', false],
    ] satisfies readonly (readonly [string, string, string, boolean])[]) {
      const value = { ...response, timing: { sentAt, firstTokenAt, endedAt } }
      const result = inspectSettlementMembers(inputWithAnchors(value, firstTokenAt))
      if (complete) {
        if (!('completeMembers' in result)) throw new Error('expected conditional ordered members')
        expect(writeJsonLossless(jsonObject(result.completeMembers.response.value).timing)).toBe(
          writeJsonLossless(value.timing),
        )
      } else expect(result).toEqual({ inconsistent: true, reason: 'timing' })
    }
    const { reply: _reply, replyDisposition: _disposition, ...noReply } = response
    const value = {
      ...noReply,
      outcome: 'failed',
      failure: { cause: 'upstream_unavailable' },
      timing: { sentAt: '2026-09-27T00:00:00.0004Z', endedAt: '2026-09-27T00:00:00.0003Z' },
    }
    expect(inspectSettlementMembers(inputWithAnchors(value, null))).toEqual({
      inconsistent: true,
      reason: 'timing',
    })
    const alias = inputWithAnchors(
      {
        ...response,
        timing: {
          sentAt: '2026-09-27T00:00:00Z',
          firstTokenAt: '2026-09-27T01:00:01+01:00',
          endedAt: '2026-09-27T00:00:02Z',
        },
      },
      '2026-09-27T00:00:01Z',
    )
    expect(inspectSettlementMembers(alias)).toEqual({ inconsistent: true, reason: 'opened' })
  })
  it('skips only the absent actual sentAt comparison for MR8 interrupted recovery', () => {
    const { reply: _reply, replyDisposition: _disposition, ...withoutReply } = response
    const base = {
      ...withoutReply,
      outcome: 'interrupted',
      initiator: 'runtime_lost',
      timing: {
        sentAt: null,
        firstTokenAt: '2026-09-27T00:00:01Z',
        endedAt: '2026-09-27T00:00:02Z',
      },
    }
    const lawful = inspectSettlementMembers(inputWithAnchors(base, base.timing.firstTokenAt))
    if (!('completeMembers' in lawful)) throw new Error('expected nullable interrupted batch')
    expect(lawful.completeMembers.response.response?.timing.sentAt).toBeNull()
    const reversed = { ...base, timing: { ...base.timing, endedAt: '2026-09-27T00:00:00Z' } }
    expect(inspectSettlementMembers(inputWithAnchors(reversed, base.timing.firstTokenAt))).toEqual({
      inconsistent: true,
      reason: 'timing',
    })
  })
})
