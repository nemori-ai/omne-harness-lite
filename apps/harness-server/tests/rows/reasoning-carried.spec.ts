// @module-tag slow
import { expect, it } from 'vitest'
import { historyOf, onReleaseTree, pollUntil } from '../support/release-tree.ts'

const sse = (events: readonly unknown[]) =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const SEALED = 'ENCRYPTED-REASONING-STATE-OF-STEP-ONE'

type Body = Readonly<{ messages: readonly Readonly<Record<string, unknown>>[] }>

it('C11: the reasoning state of a reply comes back in the next request of the release tree', async () => {
  const bodies: Body[] = []
  await onReleaseTree(
    {
      permission: 'bypass-permissions',
      collaboration: 'co-work',
      script: ({ body }) => {
        const request = JSON.parse(body) as Body & { model: string }
        bodies.push(request)
        const serving = { model: request.model, provider: 'OpenAI' }
        const events: unknown[] =
          bodies.length === 1
            ? [
                {
                  ...serving,
                  choices: [
                    {
                      delta: {
                        reasoning_details: [
                          {
                            type: 'reasoning.encrypted',
                            id: 'rs_1',
                            index: 0,
                            format: 'openai-responses-v1',
                            data: SEALED,
                          },
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
                            id: 'call_1',
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
                { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
                // The meter counts a carried reasoning state as the output of the call that made it.
                {
                  ...serving,
                  choices: [],
                  usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
                },
              ]
            : [
                { ...serving, choices: [{ delta: { content: 'done' } }] },
                { choices: [{ delta: {}, finish_reason: 'stop' }] },
              ]
        return { status: 200, contentType: 'text/event-stream', body: sse(events) }
      },
    },
    async tree => {
      const session = await tree.startSession('Use a tool, then finish.')
      await pollUntil(
        'the run ends',
        () => historyOf(tree, session),
        seen => seen.some(entry => entry.kind === 'run.terminal'),
      )
    },
  )
  expect(bodies).toHaveLength(2)
  const [, second] = bodies as [Body, Body]
  const assistant = second.messages.find(message => message['role'] === 'assistant')
  expect(JSON.stringify(assistant ?? null)).toContain(SEALED)
})
