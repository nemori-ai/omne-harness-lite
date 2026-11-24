// @module-tag slow
import { expect, it } from 'vitest'
import { interfacePath } from '../fixtures/gateway-wire.ts'
import { historyOf, onReleaseTree, pollUntil } from '../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const MODEL = 'anthropic/claude-sonnet-5'
const SIGNED = 'SIGNATURE-OF-THE-FIRST-THINKING-BLOCK'

type Body = Readonly<{ model: string; messages: readonly Readonly<Record<string, unknown>>[] }>

it('C17: a session on a Claude model of the release goes through the Messages interface and carries its thinking back', async () => {
  const sent: Readonly<{ body: Body; spoken: string }>[] = []
  await onReleaseTree(
    {
      permission: 'bypass-permissions',
      collaboration: 'co-work',
      model: MODEL,
      script: ({ body, rawBody, path }) => {
        const request = JSON.parse(body) as Body
        sent.push({ body: request, spoken: interfacePath(path, rawBody) })
        const serving = { model: request.model, provider: 'Anthropic' }
        const events: unknown[] =
          sent.length === 1
            ? [
                {
                  ...serving,
                  choices: [
                    {
                      delta: {
                        reasoning_details: [
                          { type: 'reasoning.encrypted', id: 'th_1', index: 0, data: SIGNED },
                        ],
                      },
                    },
                  ],
                },
                {
                  ...serving,
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'toolu_1',
                            type: 'function',
                            function: {
                              name: 'Ask',
                              arguments: JSON.stringify({ command: 'no-such-command', params: {} }),
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  choices: [{ delta: {}, finish_reason: 'tool_calls' }],
                  usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
                },
              ]
            : [
                { ...serving, choices: [{ delta: { content: 'done on Claude' } }] },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ]
        return { status: 200, contentType: 'text/event-stream', body: sse(events) }
      },
    },
    async tree => {
      const session = await tree.startSession('Use a tool, then finish.')
      const history = await pollUntil(
        'the run ends',
        () => historyOf(tree, session),
        seen => seen.some(entry => entry.kind === 'run.terminal'),
      )
      expect(JSON.stringify(history)).toContain('done on Claude')
    },
  )
  expect(sent).toHaveLength(2)
  for (const { body, spoken } of sent) {
    expect(spoken).toBe('/api/v1/messages')
    expect(body.model).toBe(MODEL)
  }
  const assistant = sent[1]?.body.messages.find(message => message['role'] === 'assistant')
  expect(JSON.stringify(assistant ?? null)).toContain(SIGNED)
})
