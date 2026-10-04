import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {createAnchoredModelInvocation, type SettlementCoordinatorInput} from '@omne-harness-lite/model-request-runtime-local'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { harness, payload } from '../../model-request-runtime-local/tests/anchored-invocation-fixture.ts'
import { certificate, content, finish, fixture, input, policy, sse } from './support.ts'

// This fixture deliberately exercises noRun through the public runtime instance.
// Do not transport the source harness's absent, nominally typed run reader.
function noRunSettlement(
  source: Parameters<Parameters<typeof harness>[0]>[0]['input']['settlement'],
): SettlementCoordinatorInput {
  expect(source.run).toBeUndefined()
  return {
    binding: source.binding,
    owner: source.owner,
    ...(source.settlementContention ? { settlementContention: source.settlementContention } : {}),
    ...(source.settlementScheduler ? { settlementScheduler: source.settlementScheduler } : {}),
    diagnostic: source.diagnostic,
  }
}

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

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('noRun anchored invocation through actual TLS and OpenRouter wire protocol', () => {
  it('sends a resolved tool after durable dispatch, persists the streamed call, then sends complete call/result history', async () => {
    await harness(async h => {
      const upstreamAtSend: number[] = []
      const upstreamAtAccepted: { readonly kind: string; readonly writes: number }[] = []
      const host = await fixture(cert.tls, (res, request) => {
        upstreamAtSend.push(h.writes.length)
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(
          upstreamAtSend.length === 1
            ? sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_exact',
                          function: { name: tool.name, arguments: '{"query":"value"}' },
                        },
                      ],
                    },
                  },
                ],
              }) + finish('tool_calls')
            : content('done') + finish(),
        )
        expect(request.path).toBe('/api/v1/chat/completions')
      })
      try {
        const base = input()
        const first = createAnchoredModelInvocation({
          ...h.input,
          settlement: noRunSettlement(h.input.settlement),
          planInput: { ...base, tools: [tool] },
          profile: { origin: 'official', routeName: base.routeName },
          credential: 'test-secret',
          policy: policy(),
          transport: host.transport,
          onAccepted(event) {
            upstreamAtAccepted.push({ kind: event.t, writes: h.writes.length })
          },
        })
        const firstOutcome = await first.outcome
        if (!('replyPending' in firstOutcome)) throw new Error('first tool call missing')
        expect(firstOutcome.replyPending.reply.blocks).toMatchObject([
          { kind: 'tool_call', tool: tool.name, complete: true },
        ])
        const firstBlock = firstOutcome.replyPending.reply.blocks[0]
        if (!firstBlock || firstBlock.kind !== 'tool_call' || !firstBlock.complete)
          throw new Error('completed tool call missing')
        const actualCallId = firstBlock.callId
        expect(await first.settleReply('persisted')).toHaveProperty('settled')
        expect(await first.close()).toEqual({ released: true })
        expect(upstreamAtSend).toEqual([1])
        expect(upstreamAtAccepted).toContainEqual({ kind: 'fill', writes: 2 })
        expect(upstreamAtAccepted).toContainEqual({ kind: 'close', writes: 2 })
        expect(h.writes.map(write => write.count)).toEqual([1, 1, 2])
        const wireOne = host.requests[0]
        if (!wireOne) throw new Error('first HTTP request missing')
        const firstBody = readJsonStrict(wireOne.body)
        if (!('ok' in firstBody)) throw new Error('first HTTP body invalid')
        expect(firstBody.ok).toMatchObject({
          tools: [
            {
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            },
          ],
        })

        const durable = await h.log.readSince(h.input.settlement.binding.session, 0)
        if (!('entries' in durable) || !durable.entries[2] || !durable.entries[3])
          throw new Error('first durable settlement missing')
        const assistant = judgeMessage(payload(durable.entries[2]))
        if (!('ok' in assistant)) throw new Error('durable tool call missing')
        expect(payload(durable.entries[3])).toMatchObject({
          outcome: 'complete',
          reply: { id: assistant.ok.id },
        })
        const toolResult = judgeMessage({
          id: 'actual-tool-result-message',
          type: 'tool',
          callId: actualCallId,
          createdAt: '2026-09-28T00:00:00Z',
          blocks: [
            {
              id: 'actual-tool-result-block',
              kind: 'tool_result',
              callId: actualCallId,
              outcome: 'completed',
              visibility: { toHuman: true, toModel: true },
              blocks: [
                {
                  id: 'actual-tool-result-text',
                  kind: 'text',
                  text: 'found',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
            },
          ],
        })
        if (!('ok' in toolResult)) throw new Error('tool result fixture invalid')
        const call = parseOpaqueIdentifier('actual-second-tool-call', 'ModelCallId')
        const message = parseOpaqueIdentifier('actual-second-tool-message', 'MessageId')
        if (!('ok' in call) || !('ok' in message)) throw new Error('second identity')
        const second = createAnchoredModelInvocation({
          ...h.input,
          settlement: noRunSettlement(h.input.settlement),
          responseId: 'actual-second-tool-response',
          messageId: message.ok,
          planInput: {
            ...base,
            target: { kind: 'model_call', callId: call.ok, dispatch: 1 },
            tools: [tool],
            messages: [assistant.ok, toolResult.ok],
          },
          profile: { origin: 'official', routeName: base.routeName },
          credential: 'test-secret',
          policy: policy(),
          transport: host.transport,
        })
        expect(await second.outcome).toHaveProperty('replyPending')
        expect(await second.settleReply('persisted')).toHaveProperty('settled')
        expect(await second.close()).toEqual({ released: true })
        expect(host.requests).toHaveLength(2)
        expect(upstreamAtSend).toEqual([1, 4])
        const wireTwo = host.requests[1]
        if (!wireTwo) throw new Error('second HTTP request missing')
        const secondBody = readJsonStrict(wireTwo.body)
        if (!('ok' in secondBody)) throw new Error('second HTTP body invalid')
        expect(secondBody.ok).toMatchObject({
          tools: [{ function: { name: tool.name } }],
          messages: [
            {
              role: 'assistant',
              tool_calls: [{ id: actualCallId, function: { name: tool.name } }],
            },
            { role: 'tool', tool_call_id: actualCallId, content: 'found' },
          ],
        })
      } finally {
        await host.close()
      }
    })
  })

  it('invalid tool entry, repeated name, and orphan call each refuse before HTTP and durable anchor', async () => {
    await harness(async h => {
      const host = await fixture(cert.tls, res => res.end(content('unexpected') + finish()))
      try {
        const base = input()
        const malformed = { ...tool }
        Reflect.set(malformed, 'parameters', [])
        const orphan = judgeMessage({
          id: 'actual-orphan-message',
          type: 'assistant',
          response: 'actual-orphan-response',
          ending: 'complete',
          createdAt: '2026-09-28T00:00:00Z',
          blocks: [
            {
              id: 'actual-orphan-block',
              kind: 'tool_call',
              callId: 'actual-orphan-call',
              tool: tool.name,
              complete: true,
              arguments: {},
              visibility: { toHuman: true, toModel: true },
            },
          ],
        })
        if (!('ok' in orphan)) throw new Error('orphan fixture invalid')
        for (const [tools, messages, reason] of [
          [[malformed], [], 'invalidInput'],
          [[tool, { ...tool }], [], 'invalidInput'],
          [[tool], [orphan.ok], 'orphan_tool_call'],
        ] as const) {
          const handle = createAnchoredModelInvocation({
            ...h.input,
            settlement: noRunSettlement(h.input.settlement),
            planInput: { ...base, tools, messages },
            profile: { origin: 'official', routeName: base.routeName },
            credential: 'test-secret',
            policy: policy(),
            transport: host.transport,
          })
          expect(await handle.outcome).toEqual(
            reason === 'invalidInput'
              ? { rejected: 'invalidInput', reason: 'malformed' }
              : { rejected: reason },
          )
          expect(await handle.close()).toEqual({ released: true })
        }
        expect(host.requests).toHaveLength(0)
        expect(h.writes).toHaveLength(0)
      } finally {
        await host.close()
      }
    })
  })
})
