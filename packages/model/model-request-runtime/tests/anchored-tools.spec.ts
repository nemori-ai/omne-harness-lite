import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { PlannedSemantics, TransportAdapter } from '../src/types.ts'
import { createAnchoredModelInvocation } from '../src/anchored-invocation.ts'
import { harness, payload, transport } from './anchored-invocation-fixture.ts'

const tool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}

function toolCall(): ArrivalEvent[] {
  const id = parseOpaqueIdentifier('tool-call-block', 'BlockId')
  const call = parseOpaqueIdentifier('tool-call-one', 'CallId')
  if (!('ok' in id) || !('ok' in call)) throw new Error('tool call identity')
  return [
    {
      t: 'open',
      index: 0,
      id: id.ok,
      kind: 'tool_call',
      fill: 'append',
      visibility: { toHuman: true, toModel: true },
      head: { tool: tool.name, callId: call.ok },
    },
    { t: 'fill', index: 0, payload: '{"query":"value"}' },
    { t: 'close', index: 0 },
  ]
}

describe('anchored noRun tool definitions and history', () => {
  it('plans a resolved tool, persists the streamed call, then passes the complete call/result pair to the next request', async () => {
    await harness(async h => {
      const observed: string[] = []
      const accepted: { readonly kind: string; readonly writes: number }[] = []
      let sends = 0
      const adapter: TransportAdapter<PlannedSemantics, object> = {
        plan(input) {
          observed.push('plan')
          expect(input.tools).toEqual([tool])
          return { planned: { input, parameters: input.parameters } }
        },
        async send() {
          observed.push('send')
          sends++
          expect(h.writes.map(write => write.count)).toEqual([1])
          return { response: {} }
        },
        async *read() {
          for (const event of toolCall()) yield event
          return { ended: 'end' }
        },
      }
      const first = createAnchoredModelInvocation({
        ...h.input,
        planInput: { ...h.input.planInput, tools: [tool] },
        transport: adapter,
        onAccepted(event) {
          accepted.push({ kind: event.t, writes: h.writes.length })
        },
      })
      const firstOutcome = await first.outcome
      if (!('replyPending' in firstOutcome)) throw new Error('tool reply missing')
      expect(firstOutcome.replyPending.reply.blocks).toMatchObject([
        { kind: 'tool_call', tool: tool.name, callId: 'tool-call-one', complete: true },
      ])
      expect(await first.settleReply('persisted')).toHaveProperty('settled')
      expect(await first.close()).toEqual({ released: true })
      expect(observed).toEqual(['plan', 'send'])
      expect(accepted).toContainEqual({ kind: 'fill', writes: 2 })
      expect(sends).toBe(1)
      expect(h.writes.map(write => write.count)).toEqual([1, 1, 2])

      const read = await h.log.readSince(h.input.settlement.binding.session, 0)
      if (!('entries' in read) || read.entries.length !== 4) throw new Error('durable prefix')
      expect(read.entries.map(payload).map(value => value.kind ?? value.type)).toEqual([
        'model_call_dispatched',
        'model_call_opened',
        'assistant',
        undefined,
      ])
      const durableAssistant = read.entries[2]
      if (!durableAssistant) throw new Error('durable assistant missing')
      const assistant = judgeMessage(payload(durableAssistant))
      if (!('ok' in assistant)) throw new Error('durable assistant')
      const result = judgeMessage({
        id: 'tool-result-message',
        type: 'tool',
        callId: 'tool-call-one',
        createdAt: '2026-09-28T00:00:00Z',
        blocks: [
          {
            id: 'tool-result-block',
            kind: 'tool_result',
            callId: 'tool-call-one',
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: 'tool-result-text',
                kind: 'text',
                text: 'found',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      if (!('ok' in result)) throw new Error('tool result fixture')
      const call = parseOpaqueIdentifier('second-tool-call', 'ModelCallId')
      const message = parseOpaqueIdentifier('second-tool-message', 'MessageId')
      if (!('ok' in call) || !('ok' in message)) throw new Error('second identity')
      const secondTransport = transport()
      const second = createAnchoredModelInvocation({
        ...h.input,
        responseId: 'second-tool-response',
        messageId: message.ok,
        planInput: {
          ...h.input.planInput,
          target: { kind: 'model_call', callId: call.ok, dispatch: 1 },
          tools: [tool],
          messages: [assistant.ok, result.ok],
        },
        transport: {
          ...secondTransport.adapter,
          plan(input) {
            expect(input.tools).toEqual([tool])
            expect(input.messages).toEqual([assistant.ok, result.ok])
            return secondTransport.adapter.plan(input)
          },
        },
      })
      expect(await second.outcome).toHaveProperty('replyPending')
      expect(secondTransport.sends()).toBe(1)
      expect(await second.settleReply('persisted')).toHaveProperty('settled')
      expect(await second.close()).toEqual({ released: true })
    })
  })

  it('rejects malformed tool schema and duplicate model names before any anchor or send', async () => {
    await harness(async h => {
      const malformed = { ...tool }
      Reflect.set(malformed, 'parameters', [])
      const t = transport()
      for (const tools of [[malformed], [tool, { ...tool }]]) {
        const handle = createAnchoredModelInvocation({
          ...h.input,
          planInput: { ...h.input.planInput, tools },
          transport: t.adapter,
        })
        expect(await handle.outcome).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
        expect(await handle.close()).toEqual({ released: true })
      }
      expect(t.plans()).toBe(0)
      expect(t.sends()).toBe(0)
      expect(h.writes).toHaveLength(0)
    })
  })

  it('preserves planner refusal for orphan history before durable dispatch', async () => {
    await harness(async h => {
      const assistant = judgeMessage({
        id: 'orphan-assistant',
        type: 'assistant',
        response: 'orphan-response',
        ending: 'complete',
        createdAt: '2026-09-28T00:00:00Z',
        blocks: [
          {
            id: 'orphan-call-block',
            kind: 'tool_call',
            callId: 'orphan-call',
            tool: tool.name,
            complete: true,
            arguments: {},
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in assistant)) throw new Error('orphan fixture')
      let sends = 0
      const handle = createAnchoredModelInvocation({
        ...h.input,
        planInput: { ...h.input.planInput, tools: [tool], messages: [assistant.ok] },
        transport: {
          plan(input) {
            expect(input.messages).toEqual([assistant.ok])
            return { rejected: 'orphan_tool_call' }
          },
          async send() {
            sends++
            return { response: {} }
          },
          async *read() {
            return { ended: 'end' }
          },
        },
      })
      expect(await handle.outcome).toEqual({ rejected: 'orphan_tool_call' })
      expect(sends).toBe(0)
      expect(h.writes).toHaveLength(0)
      expect(await handle.close()).toEqual({ released: true })
    })
  })
})
